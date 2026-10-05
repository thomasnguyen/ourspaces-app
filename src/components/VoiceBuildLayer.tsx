import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AskTrace, StageName, VoiceLanded, VoiceReceipt, VoiceShell } from "../live/useVoiceBuild";

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

const STAGE_LABEL: Record<StageName, string> = {
  pause: "pause detected",
  skeleton: "skeleton on screen",
  tentative: "first tentative field",
  "card-full": "card visually complete (tentative or final)",
  "first-field": "final answer's first field",
  "card-local": "final card on this screen",
  committed: "committed",
  "card-on-screen": "synced card on screen",
};

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
              {c.used ? " · final" : t.fills.some((f) => f.call === i) ? " · tentative only" : " · ignored"} · “{c.text}”
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
        <h3>2 · code's guess</h3>
        <p>
          {t.guesses.length
            ? t.guesses.map((g) => `${g.card} at ${ms(g.ms)}`).join(" → ")
            : "no card named in the words"}
          {t.guessAgreed !== null && ` · model ${t.guessAgreed ? "agreed" : "disagreed"}`}
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

      <section>
        <h3>7 · stages, from the last word</h3>
        {mock ? (
          <p>not timed: the stand-in waits on purpose</p>
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
  shell,
  landed,
  receipt,
  leaving,
  traces,
  color,
  by,
}: {
  shell: VoiceShell | null;
  landed: VoiceLanded | null;
  receipt: VoiceReceipt | null;
  leaving: boolean;
  traces: AskTrace[];
  /** The maker's colour. */
  color: string;
  by: string;
}) {
  const [dev] = useState(devMode);
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
          ) : latest.model === null && latest.done ? (
            <span>stand-in · no model ran · not timed</span>
          ) : (
            <>
              <span>{latest.model ?? "…"}</span>
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
