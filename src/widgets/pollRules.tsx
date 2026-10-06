/**
 * A poll's rules on the card (the league's vote): the black pills under the
 * options ("closes wed 9:00 pm", "6 of 8 needed") and the stamp once it is
 * decided ("passed", "failed", "pho won"). The maths is lib/pollRules.ts; this
 * is the clock and the drawing. A poll without `closesAt` / `needs` draws
 * nothing here and its card is exactly as before.
 *
 * Mock state URLs (polls with rules only): `?poll=passed` (the count reaches
 * what it needs), `?poll=closed` (its time is up, short of it).
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Widget } from "../data/types";
import { getDataMode } from "../live/dataMode";
import { closesLabel, localIso, pollOutcome, type PollOption, type PollOutcome } from "../lib/pollRules";

type Option = PollOption & { total: number };
/** Extra voters the mock `?poll=passed` state adds, league names past the room's six. */
const MOCK_VOTERS = ["Dre", "Lou", "Tash", "Bo", "Nico", "Wren", "Cal", "Pia"];

function mockState(widget: Widget): Widget {
  if (getDataMode() !== "mock") return widget;
  const lab = new URLSearchParams(window.location.search).get("poll");
  const d = widget.data;
  if (!lab || (!d.closesAt && !d.needs)) return widget;
  if (lab === "closed" || lab === "failed") return { ...widget, data: { ...d, closesAt: localIso(new Date(Date.now() - 2 * 3_600_000)) } };
  if (lab !== "passed" || typeof d.needs !== "number") return widget;
  const options = d.options as Option[];
  const yes = pollOutcome(d, options).toward;
  const add = Math.max(0, d.needs - (yes?.votes ?? 0));
  const total = (options[0]?.total ?? 0) + add;
  return {
    ...widget,
    data: {
      ...d,
      options: options.map((o) => ({ ...o, total, ...(o.id === yes?.id ? { votes: o.votes + add, voters: [...(o.voters ?? []), ...MOCK_VOTERS.slice(0, add)] } : {}) })),
    },
  };
}

/**
 * The card's rules on this clock: it closes for everyone at the same minute
 * (a timer to `closesAt`, as `useChallenge` does for a reveal) and the
 * "closes in 3h" line ticks once a minute in its last twelve hours.
 */
export function usePollRules(raw: Widget, selectedOptionId?: string) {
  const widget = useMemo(() => mockState(raw), [raw]);
  const [now, setNow] = useState(() => Date.now());
  const ruled = Boolean(widget.data.closesAt || widget.data.needs);
  const outcome = useMemo<PollOutcome | null>(() => {
    if (!ruled) return null;
    const options = (widget.data.options as Option[]).map((o) => ({ ...o, votes: o.votes + (o.id === selectedOptionId ? 1 : 0) }));
    return pollOutcome(widget.data, options, new Date(now));
  }, [widget, ruled, selectedOptionId, now]);
  const closesMs = outcome?.closesAt?.getTime() ?? 0;
  useEffect(() => {
    const left = closesMs - Date.now();
    if (left <= 0 || left > 2 ** 31 - 1) return;
    const tick = window.setInterval(() => setNow(Date.now()), left < 12 * 3_600_000 ? 60_000 : 30 * 60_000);
    const at = window.setTimeout(() => setNow(Date.now()), left + 50);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(at);
    };
  }, [closesMs]);
  return { widget, outcome, now };
}

/** The class the card wears: `poll-ruled`, and once decided `poll-done poll-verdict-<kind>`. */
export const pollRulesClass = (o: PollOutcome | null) => (!o ? "" : ` poll-ruled${o.done ? ` poll-done poll-verdict-${o.stamp?.kind ?? "done"}` : ""}`);

/** The pills under the options: when it closes, and how far the count is from what it needs. */
export function PollRulesLine({ outcome, now }: { outcome: PollOutcome | null; now: number }) {
  if (!outcome || (!outcome.closesAt && !outcome.needs)) return null;
  const { closesAt: at, needs: need, toward, done, closed } = outcome;
  // decided: the stamp carries the count; only the time it closed stays (a vote that passed early has none)
  const closesAt = done && !closed ? null : at;
  const needs = done ? null : need;
  if (!closesAt && !needs) return null;
  const got = Math.min(toward?.votes ?? 0, needs ?? 0);
  return (
    <div className="poll-rules">
      {closesAt && (
        <span className="poll-rule poll-closes" data-testid="poll-closes" data-closes-at={closesAt.toISOString()}>
          <i className="poll-closes-dot" aria-hidden="true" />
          {closesLabel(closesAt, new Date(now))}
        </span>
      )}
      {needs && (
        <span className="poll-rule poll-needs" data-testid="poll-needs" data-needs={needs} data-got={toward?.votes ?? 0}>
          {needs <= 12 && (
            <span className="poll-needs-pips" aria-hidden="true">
              {Array.from({ length: needs }, (_, i) => (
                <i key={i} className={i < got ? "is-in" : ""} style={{ "--i": i } as CSSProperties} />
              ))}
            </span>
          )}
          {toward && !/^(yes|yeah|yep|yea|aye)\b/i.test(toward.label) ? `${toward.label.toLowerCase()} ` : ""}
          {toward?.votes ?? 0} of {needs} needed
        </span>
      )}
    </div>
  );
}

/** The verdict, stamped on the card the moment it is decided. */
export function PollStamp({ outcome }: { outcome: PollOutcome | null }) {
  const s = outcome?.done ? outcome.stamp : null;
  if (!s) return null;
  return (
    <div className={`poll-stamp poll-stamp-${s.kind}`} data-testid="poll-stamp" data-verdict={s.kind}>
      <strong>{s.label}</strong>
      <small>{s.sub}</small>
    </div>
  );
}
