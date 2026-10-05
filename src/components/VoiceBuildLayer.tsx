import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Widget } from "../data/types";
import type { AskTrace, StageName, VoiceFound, VoiceLanded, VoiceReceipt, VoiceReply, VoiceShell } from "../live/useVoiceBuild";
import { feedVoiceStage } from "../lib/voiceStage";
import type { ResolveNote, RoomFacts } from "../lib/deck";

/** The dev readout and drawer show on the dev lane, or anywhere with `?timing=1`
    (`?timing=0` hides them). Model names and milliseconds live only there. */
function devMode() {
  const q = new URLSearchParams(window.location.search).get("timing");
  if (q === "1") return true;
  if (q === "0") return false;
  return /dusty-condor/.test(import.meta.env.VITE_CONVEX_URL ?? "");
}

/** The ring in the maker's colour: on the card being built, following its
    element frame by frame (the card glides and grows under it). */
function ShellRing({ shell, tint }: { shell: VoiceShell; tint: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shell.draftId) return;
    let raf = 0;
    const tick = () => {
      const el = shell.host.querySelector<HTMLElement>(`[data-widget-id="${shell.draftId}"]`);
      const ring = ref.current;
      if (el && ring) {
        ring.style.left = `${el.offsetLeft}px`;
        ring.style.top = `${el.offsetTop}px`;
        ring.style.width = `${el.offsetWidth}px`;
        ring.style.height = `${el.offsetHeight}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [shell.draftId, shell.host]);
  const { x, y, w, h } = shell.box;
  return (
    <div
      ref={ref}
      className={`voice-shell ${shell.draftId ? "is-ring" : ""}`}
      data-testid="voice-shell"
      data-phase={shell.phase}
      style={{ ...tint, left: x, top: y, width: w, height: h }}
      aria-live="polite"
    >
      {!shell.draftId && <q className="voice-shell-said">{shell.said}</q>}
    </div>
  );
}

/** The ask was already on the board: a ring in the asker's colour pulses
    once around that widget (following it while the camera glides). */
function FoundPulse({ found, tint }: { found: VoiceFound; tint: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = found.host.querySelector<HTMLElement>(`[data-widget-id="${found.widgetId}"]`);
      const ring = ref.current;
      if (el && ring) {
        ring.style.left = `${el.offsetLeft}px`;
        ring.style.top = `${el.offsetTop}px`;
        ring.style.width = `${el.offsetWidth}px`;
        ring.style.height = `${el.offsetHeight}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [found.host, found.widgetId]);
  return <div ref={ref} className="voice-found-pulse" data-testid="voice-found-pulse" data-widget-ref={found.widgetId} style={tint} aria-hidden />;
}

const STAGE_LABEL: Record<StageName, string> = {
  pause: "pause detected",
  decided: "decide sure (≥ 0.8) back",
  found: "camera on the card already here",
  answer: "the verb's slip on screen (answer, recap, your part, go)",
  skeleton: "skeleton on screen",
  tentative: "first tentative field",
  "card-full": "card visually complete (tentative or final)",
  "first-field": "final answer's first field",
  "card-local": "final card on this screen",
  committed: "committed",
  "card-on-screen": "synced card on screen",
  "cluster-local": "recipe: first card of the group on this screen",
  "cluster-on-screen": "recipe: the whole group synced on screen",
};

/** $ per 1M tokens in / out (Token Factory GET /v1/models). */
const PRICE: Record<string, [number, number]> = { Lightning: [0.06, 0.24], Ultra: [1, 3], Super: [0.3, 0.9] };
const dollars = (model: string, u: { prompt: number; completion: number } | null | undefined) => {
  const p = PRICE[model];
  return p && u ? (u.prompt * p[0] + u.completion * p[1]) / 1e6 : 0;
};

/** Where a token's value came from: the room brief's rows behind it. */
function sourceOf(token: string, f: RoomFacts | null): string | null {
  if (!f) return null;
  const arg = /\(([^)]*)\)/.exec(token)?.[1]?.toLowerCase() ?? "";
  const near = <T extends { title: string }>(list: T[]) => list.find((x) => arg && (x.title.toLowerCase().includes(arg) || arg.includes(x.title.toLowerCase()))) ?? list[0];
  const name = /^@([a-z-]+)/.exec(token)?.[1];
  switch (name) {
    case "home":
      return `people ${f.people.join(", ")}${f.away.length ? ` · away: ${f.away.map((a) => `${a.name} ("${a.why}")`).join(", ")}` : ""}`;
    case "coming":
    case "headcount": {
      const r = near(f.rsvps);
      return r ? `rsvp "${r.title}": yes ${r.yes.join(", ") || "—"} · no ${r.no.join(", ") || "—"} · no answer ${r.waiting.join(", ") || "—"}` : "no rsvp on the board";
    }
    case "on-trip":
    case "payer": {
      const x = near(f.splits);
      return x ? `split "${x.title}"${x.also.length ? ` (mail: "${x.also.join('", "')}")` : ""}: ${x.people.join(", ")} · ${x.payer ?? "nobody"} paid ${x.paid} of ${x.total}` : "no split on the board";
    }
    case "leader": {
      const x = near(f.polls);
      return x ? `poll "${x.title}": ${x.leader ?? "no leader"} ${x.lead} of ${x.votes} votes` : "no poll";
    }
    case "places":
      return `saved links that are places: ${f.places.join(", ") || "none"}`;
    case "date": {
      const x = near(f.dates);
      return x ? `countdown "${x.title}" → ${x.date} (${x.days} days)` : "no countdown";
    }
    case "last": {
      const x = near(f.wheels);
      return x ? `wheel "${x.title}": ${x.options.join(", ")} · last ${x.last ?? "—"}` : "no wheel";
    }
    case "zones":
    case "call-times":
      return `clocks: ${f.clocks.map((c) => `${c.label} ${c.tz}`).join(" · ") || "none"}`;
    case "everyone-but":
      return `people ${f.people.join(", ")}`;
    case "chores":
      return `wheels ${f.wheels.map((w) => `"${w.title}"`).join(", ") || "none"} · lists ${f.lists.map((l) => `"${l.title}"`).join(", ") || "none"}`;
    default:
      return null;
  }
}

const KIND_LABEL: Record<ResolveNote["kind"], string> = {
  expanded: "→",
  fallback: "fallback",
  unknown: "unknown, left out",
  rule: "rule",
  "unlisted-name": "not in the room",
};

/** The route in two or three words, for the readout. */
/** Mock never calls a model: its readout must not name a route and a model mid-ask either. */
const MOCK = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock");

function routeLabel(t: AskTrace): string | null {
  if (!t.route) return null;
  return t.route.route === "brain" ? "room facts · Ultra" : "plain · Lightning";
}

const ms = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString()} ms`);

/** Everything behind one ask, in the order it happened. */
function ContextDrawer({
  traces,
  index,
  onIndex,
  onClose,
}: {
  traces: AskTrace[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const t = traces[index];
  if (!t) return null;
  const mock = t.model === null;
  // another verb than make: the card sections (guess, decide, route, context, cards, spot) don't apply
  const nonMake = !!t.verb && t.verb.verb !== "make";
  return (
    <aside className="dev-context" data-testid="dev-context-drawer" aria-label="What happened on this ask">
      <header className="dev-context-head">
        <b>ask {traces.length - index} of {traces.length}</b>
        <span>{new Date(t.at).toLocaleTimeString()}</span>
        <button type="button" disabled={index >= traces.length - 1} onClick={() => onIndex(index + 1)}>
          older
        </button>
        <button type="button" disabled={index <= 0} onClick={() => onIndex(index - 1)}>
          newer
        </button>
        <button type="button" data-testid="dev-context-close" onClick={onClose}>
          close
        </button>
      </header>

      <section>
        <h3>1 · heard</h3>
        <ol className="dev-context-list">
          {t.words.map((w, i) => (
            <li key={i}>
              <code>{ms(w.ms)}</code> {w.text}
            </li>
          ))}
        </ol>
        <p>{t.how ? `ended by ${t.how === "pause" ? "the pause" : "the done button"}` : "still listening"}</p>
        <h3>calls</h3>
        <ol className="dev-context-list">
          {t.calls.map((c, i) => (
            <li key={i}>
              <code>{ms(c.ms)}</code> {c.spec ? "speculative" : "at the end"}
              {c.used ? " · final" : t.fills.some((f) => f.call === i) ? " · tentative only" : " · ignored"}
              {c.route && ` · ${c.route}`}
              {c.card && ` · told: ${c.card}`} · “{c.text}”
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3>fills (dimmed until final)</h3>
        <ol className="dev-context-list">
          {t.fills.map((f, i) => (
            <li key={i}>
              <code>{ms(f.ms)}</code> {f.final ? "final" : "tentative"} · call {f.call + 1}
              {f.whole ? " · whole card" : " · some fields"}
              {f.changed.length ? ` · changed ${f.changed.join(", ")}` : ""} · “{f.words}”
            </li>
          ))}
          {!t.fills.length && <li>—</li>}
        </ol>
        <p>{t.flicker} field change{t.flicker === 1 ? "" : "s"} after first showing</p>
        {t.late.map((l, i) => (
          <p key={i}>
            late word at {ms(l.ms)}: “{l.text}” · {l.outcome}
            {l.after !== undefined && ` · ${ms(l.after)} after its last word`}
          </p>
        ))}
      </section>

      <section>
        <h3>verb</h3>
        {t.verb ? (
          <div data-testid="dev-context-verb">
            <p>
              <b>{t.verb.verb}</b> · by {t.verb.by}
              {t.verb.conf != null && ` (${t.verb.conf.toFixed(2)})`} · {t.verb.why}
            </p>
            {t.verb.mine && <p>your part: {t.verb.mine}</p>}
            {t.verb.answer && (
              <>
                <p>
                  answer ({t.verb.answer.by === "facts" ? "room facts, code, no model" : t.verb.answer.by === "retrieval" ? `retrieved + Ultra${t.verb.answer.ms != null ? `, ${t.verb.answer.ms} ms` : ""}` : t.verb.answer.by}): “{t.verb.answer.text}” · {t.verb.answer.source}
                </p>
                <ol className="dev-context-list" data-testid="dev-context-answer-facts">
                  {t.verb.answer.facts.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                  {!t.verb.answer.facts.length && <li>nothing read</li>}
                </ol>
              </>
            )}
          </div>
        ) : (
          <p>no router (this room has none)</p>
        )}
      </section>

      {nonMake ? (
        <section>
          <p>not a card ask: no guess, no deal, no route, no context sent{t.calls.length ? ` · ${t.calls.length} retrieval call${t.calls.length === 1 ? "" : "s"} (Ultra)` : ""}{t.decides.length ? ` · ${t.decides.length} decide` : ""}</p>
        </section>
      ) : (
      <>
      <section>
        <h3>2 · code's guess</h3>
        <p>
          {t.guesses.length
            ? t.guesses.map((g) => `${g.card} at ${ms(g.ms)}`).join(" → ")
            : "no card named in the words"}
          {t.guessAgreed !== null && ` · model ${t.guessAgreed ? "agreed" : "disagreed"}`}
        </p>
      </section>

      <section>
        <h3>decide (Ultra, one letter)</h3>
        <ol className="dev-context-list">
          {t.decides.map((d, i) => (
            <li key={i} className={d.error ? "dev-context-bad" : ""}>
              <code>{ms(d.ms)}</code> → <code>{d.back === null ? "…" : ms(d.back)}</code> “{d.text}” ·{" "}
              {d.error ?? (d.card ? `${d.card} ${d.conf?.toFixed(2)}${(d.conf ?? 0) >= 0.8 ? " ✓" : " (below 0.8)"}` : "—")}
              {d.top.length > 1 && ` · then ${d.top.slice(1).map((x) => `${x.card} ${x.p.toFixed(2)}`).join(", ")}`}
            </li>
          ))}
          {!t.decides.length && <li>{mock ? "not run: mock mode" : "none sent"}</li>}
        </ol>
        <p>
          {t.stages.decided === null
            ? "no sure pick"
            : `first sure pick ${ms(t.stages.decided)} from the last word · ${
                t.stages.pause !== null && t.stages.decided < t.stages.pause ? "ready before the pause" : "after the pause"
              }`}
          {t.overrode && ` · overrode the answer: ${t.overrode}`}
        </p>
        <p>
          skeleton:{" "}
          {t.skeletons.length ? t.skeletons.map((k) => `${k.card} (${k.by}, ${ms(k.ms)})`).join(" → ") : "—"}
          {t.decideMoves > 0 && ` · the decide moved it ${t.decideMoves}×`}
        </p>
      </section>

      <section>
        <h3>already on the board?</h3>
        {t.found ? (
          <>
            <p data-testid="dev-context-found">
              <b>{t.found.outcome === "pointed" ? "pointed at the card already here, nothing written" : "dealt a card"}</b> · {t.found.why}
            </p>
            <p>
              code's check: {t.found.check.ok ? `match: ${t.found.check.why}` : `no match: ${t.found.check.why}`}
              {t.found.widgetId && <> · widget <code>{t.found.widgetId}</code></>}
            </p>
            <p>
              the model's yes/no (Ultra, same prefix as the decide):{" "}
              {t.found.verdict
                ? t.found.verdict.standIn
                  ? "not asked: mock mode, code's match stands in"
                  : `${t.found.verdict.yes ? "yes" : "no"} ${t.found.verdict.conf?.toFixed(2) ?? ""} on “${t.found.verdict.text}”`
                : t.found.check.ok
                  ? "no answer in time"
                  : "not asked (no match)"}
            </p>
          </>
        ) : (
          <p>{t.done ? "not checked (a late word, or a card already written)" : "…"}</p>
        )}
        {t.decides.some((d) => d.match) && (
          <ol className="dev-context-list">
            {t.decides
              .filter((d) => d.match)
              .map((d, i) => (
                <li key={i}>
                  “{d.text}” · match {d.match} · {d.onBoard ? (d.onBoard.error ?? `${d.onBoard.yes ? "yes" : "no"} ${d.onBoard.conf?.toFixed(2)}`) : "…"}
                </li>
              ))}
          </ol>
        )}
        {t.held.length > 0 && (
          <p>
            skeleton held against: {t.held.map((h) => `${h.card} (call ${h.call + 1}, ${ms(h.ms)})`).join(", ")}
          </p>
        )}
      </section>

      <section>
        <h3>route</h3>
        <p data-testid="dev-context-route">
          {t.route ? <b>{t.route.route === "brain" ? "room facts → Ultra (token prompt)" : "plain → Lightning (fast fill)"}</b> : mock ? "mock: no route" : "—"}
          {t.route && ` · ${t.route.why}`}
        </p>
        {t.route?.route === "brain" && (
          <>
            <p>facts sent (only these):</p>
            <pre>{t.route.facts.join("\n")}</pre>
          </>
        )}
      </section>

      <section>
        <h3>tokens and rules</h3>
        <ol className="dev-context-list">
          {t.notes.map((n, i) => {
            const src = n.kind === "expanded" || n.kind === "fallback" ? sourceOf(n.token, t.facts) : null;
            return (
              <li key={i} className={n.kind === "unknown" || n.kind === "unlisted-name" ? "dev-context-bad" : ""}>
                <code>{n.token}</code> {KIND_LABEL[n.kind]} {n.detail}
                {src && <small> · from {src}</small>}
              </li>
            );
          })}
          {!t.notes.length && <li>{t.route?.route === "brain" ? "no tokens in the answer" : "none (no tokens on the fast route)"}</li>}
        </ol>
      </section>

      <section>
        <h3>cost</h3>
        <p>
          {(() => {
            const fills = t.calls.filter((c) => c.usage);
            const fillUsd = fills.reduce((a, c) => a + dollars(c.usage!.model, c.usage), 0);
            const decUsd = t.decides.reduce((a, d) => a + dollars("Ultra", d.usage), 0);
            const byModel = fills.reduce<Record<string, number>>((m, c) => ((m[c.usage!.model] = (m[c.usage!.model] ?? 0) + 1), m), {});
            return `${t.calls.length} fill call${t.calls.length === 1 ? "" : "s"} (${Object.entries(byModel).map(([k, v]) => `${k} ${v}`).join(", ") || "usage pending"}) + ${t.decides.length} decide · ≈ ${(fillUsd + decUsd).toFixed(4)} (fills ${fillUsd.toFixed(4)}, decide ${decUsd.toFixed(4)})`;
          })()}
        </p>
      </section>

      <section>
        <h3>3 · context sent to the model</h3>
        <pre>{t.context ?? (mock ? "not sent: mock mode, no model ran" : "not sent yet")}</pre>
      </section>

      <section>
        <h3>4 · the model's answer {t.model ? `(${t.model})` : "(stand-in, not a model)"}</h3>
        <pre>{t.answer ?? "—"}</pre>
        {t.modelMs && !mock && (
          <p>
            model: first line {ms(t.modelMs.firstLine)} · whole answer {ms(t.modelMs.total)} after the call left
          </p>
        )}
        {t.error && <p className="dev-context-bad">{t.error}</p>}
      </section>

      <section>
        <h3>5 · cards after applyCard</h3>
        <ol className="dev-context-list">
          {t.cards.map((c, i) => (
            <li key={i} className={c.ok ? "" : "dev-context-bad"}>
              {c.card} · {c.ok ? `kept${c.widgetId ? ` → ${c.widgetId}` : ""}` : `rejected: ${c.reason}`}
            </li>
          ))}
          {!t.cards.length && <li>—</li>}
        </ol>
      </section>

      <section>
        <h3>6 · why this spot</h3>
        <p>{t.place ?? "—"}</p>
      </section>

      </>
      )}
      <section>
        <h3>7 · stages, from the last word</h3>
        {mock && !nonMake ? (
          <p>simulated from measurements (src/lib/voiceTimings.ts): no model ran, so nothing here was timed</p>
        ) : (
          <table>
            <tbody>
              {(Object.keys(STAGE_LABEL) as StageName[]).map((k) => (
                <tr key={k}>
                  <td>{STAGE_LABEL[k]}</td>
                  <td>{ms(t.stages[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </aside>
  );
}

/**
 * What a voice ask looks like while it builds (src/live/useVoiceBuild.ts):
 * a ring in the maker's colour on the skeleton being filled (or a card-sized
 * hole with the words, before they name a card), and the slip on the card
 * that landed: who said it. A miss has no card to sit on, so it shows above
 * the dock. Model names and timings stay out of the room: they're in the dev
 * readout at the bottom, which opens the context drawer.
 */
export function VoiceBuildLayer({
  drafts,
  shell,
  landed,
  found,
  reply,
  receipt,
  leaving,
  traces,
  color,
  by,
}: {
  /** The local skeleton / card, for the voice stage (lib/voiceStage.ts). */
  drafts: Widget[];
  shell: VoiceShell | null;
  landed: VoiceLanded | null;
  found?: VoiceFound | null;
  /** Another verb's slip (lib/deck/verbs.ts): an answer, a recap, offers. */
  reply?: VoiceReply | null;
  receipt: VoiceReceipt | null;
  leaving: boolean;
  traces: AskTrace[];
  /** The maker's colour. */
  color: string;
  by: string;
}) {
  const [dev] = useState(devMode);
  // The voice stage shows this build on its right half; it reads it through this one call.
  useEffect(() => feedVoiceStage({ drafts, shell, landed, found: found ?? null, reply: reply ?? null, receipt, traces, color, by }), [drafts, shell, landed, found, reply, receipt, traces, color, by]);
  const [open, setOpen] = useState<number | null>(null);
  const tint = { "--maker": color } as CSSProperties;
  const latest = traces[0];
  const openFor = (key: number) => {
    const i = traces.findIndex((t) => t.key === key);
    setOpen(i >= 0 ? i : 0);
  };
  const okReceipt = receipt?.ok ? receipt : null;

  return (
    <>
      {shell && createPortal(<ShellRing shell={shell} tint={tint} />, shell.host)}
      {landed &&
        createPortal(
          <div
            className={`voice-slip ${leaving ? "is-leaving" : ""} ${dev ? "is-dev" : ""}`}
            style={{ ...tint, left: landed.x, top: landed.y }}
            onClick={dev ? () => openFor(landed.traceKey) : undefined}
          >
            <span className="voice-landed" data-testid="voice-landed" data-widget-ref={landed.widgetId}>
              {by} said it
            </span>
          </div>,
          landed.host,
        )}
      {found && createPortal(<FoundPulse key={`${found.traceKey}-${found.widgetId}`} found={found} tint={tint} />, found.host)}
      {found &&
        createPortal(
          <div
            className={`voice-slip is-found ${leaving ? "is-leaving" : ""} ${dev ? "is-dev" : ""}`}
            style={{ ...tint, left: found.x, top: found.y }}
            onClick={dev ? () => openFor(found.traceKey) : undefined}
          >
            <span className="voice-landed voice-found" data-testid="voice-found" data-widget-ref={found.widgetId} data-card={found.card}>
              {found.done ?? <>already here{found.by ? ` · ${found.by} made it` : ""}</>}
            </span>
            {found.next === "spin" && (
              <button
                type="button"
                className="voice-found-next"
                data-testid="voice-found-spin"
                onClick={(e) => {
                  e.stopPropagation();
                  found.host.querySelector<HTMLButtonElement>(`[data-widget-id="${found.widgetId}"] [data-testid="wheel-spin"]`)?.click();
                }}
              >
                spin it
              </button>
            )}
          </div>,
          found.host,
        )}
      {reply && !reply.widgetId && (
        <div key={reply.traceKey} className={`voice-receipt is-miss voice-reply ${leaving ? "is-leaving" : ""}`} data-testid="voice-reply" data-verb={reply.verb} style={tint} role="status">
          <span>{reply.text}</span>
          {reply.source && <span className="voice-reply-source">{reply.source}</span>}
          {reply.offers?.map((o, i) => (
            <button type="button" key={i} className="voice-found-next" data-testid={`voice-reply-offer-${i}`} onClick={o.run}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {receipt && !receipt.ok && (
        <p
          key={receipt.key}
          className={`voice-receipt is-miss ${leaving ? "is-leaving" : ""}`}
          data-testid="voice-receipt"
          style={tint}
          role="status"
        >
          couldn't place that
        </p>
      )}
      {dev && (
        <button
          type="button"
          className="dev-readout"
          data-testid="dev-readout"
          onClick={() => setOpen((o) => (o === null ? 0 : null))}
          title="What happened on the last voice ask"
        >
          {!latest ? (
            <span>voice · no ask yet</span>
          ) : latest.verb && latest.verb.verb !== "make" ? (
            <>
              <span data-testid="dev-readout-route">
                {latest.verb.verb} · {latest.verb.by}
              </span>
              <span data-testid="voice-receipt" data-verb={latest.verb.verb}>
                {latest.verb.answer?.by === "retrieval" ? "retrieved + Ultra" : latest.verb.answer?.by === "stand-in" ? "stand-in · no model" : "code, no model"} · last word → slip{" "}
                {latest.stages.answer === null ? "…" : ms(latest.stages.answer).replace("+", "")}
              </span>
              <span>
                {latest.calls.length + latest.decides.length} model call{latest.calls.length + latest.decides.length === 1 ? "" : "s"} · nothing built
              </span>
            </>
          ) : latest.found?.outcome === "pointed" && latest.found.why.startsWith("do my part") ? (
            <>
              <span data-testid="dev-readout-route">do my part</span>
              <span data-testid="voice-receipt" data-found="1">
                code, no model · last word → camera {latest.stages.found === null ? "…" : ms(latest.stages.found).replace("+", "")}
              </span>
              <span>your row only</span>
            </>
          ) : latest.found?.outcome === "pointed" ? (
            <>
              <span data-testid="dev-readout-route">already here</span>
              <span data-testid="voice-receipt" data-found="1">
                {latest.found.verdict?.standIn
                  ? "stand-in · code's match only · not timed"
                  : `yes/no ${latest.found.verdict?.conf?.toFixed(2)} · last word → camera ${latest.stages.found === null ? "…" : ms(latest.stages.found).replace("+", "")}`}
              </span>
              <span>nothing written</span>
            </>
          ) : latest.model === null && (latest.done || MOCK) ? (
            <span>simulated from measurements · no model ran</span>
          ) : (
            <>
              <span data-testid="dev-readout-route">{routeLabel(latest) ?? latest.model ?? "…"}</span>
              <span
                data-testid={okReceipt ? "voice-receipt" : undefined}
                data-ms={okReceipt && okReceipt.ms !== null ? okReceipt.ms : undefined}
              >
                last word → final card {latest.stages["card-local"] === null ? "…" : ms(latest.stages["card-local"]).replace("+", "")}
              </span>
              {latest.stages.tentative !== null && <span>tentative {ms(latest.stages.tentative).replace("+", "")}</span>}
              <span>
                {latest.calls.length} call{latest.calls.length === 1 ? "" : "s"}
                {latest.calls.some((c) => c.spec && c.used) ? " · early hit" : ""}
              </span>
              {latest.late.length > 0 && (
                <span>
                  late word · {latest.late.at(-1)!.outcome}
                  {latest.late.at(-1)!.after !== undefined && ` ${ms(latest.late.at(-1)!.after).replace("+", "")} after it`}
                </span>
              )}
              {latest.guessAgreed !== null && <span>guess {latest.guessAgreed ? "right" : "wrong"}</span>}
            </>
          )}
        </button>
      )}
      {dev && open !== null && (
        <ContextDrawer traces={traces} index={Math.min(open, traces.length - 1)} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
