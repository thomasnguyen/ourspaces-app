/**
 * Choices become a vote (nebius R2), on the board. A vote rides on the card
 * it's about, an ink ticket off its bottom edge like the waiting ticket:
 * "move game night to sunday?" / "tara asked · 3 people said yes to friday",
 * and for the people whose choice it is, keep it / change it (one person:
 * ok / no). Everyone else sees who has answered. When it closes, a cream
 * note stays on the card for a while: what changed and what was cleared
 * ("friday rsvps cleared · 3 people, answer again"), or that it was kept.
 * Data: convex/choiceVotes.ts `room`; counting: lib/choiceVote.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { KEEP, voterKey, voterOf } from "../lib/choiceVote";
import { useCardEl, useLeaving } from "./RightOfWay";

export type RowVote = {
  id: string;
  widgetId: string;
  stake: string;
  voters: { id?: string; name: string; why: string }[];
  options: { id: string; ask: string; changed?: string; by?: string; byUserId?: string }[];
  answers: { voter: string; option: string; at: number }[];
  state: string;
  why?: string;
  note?: string;
  landed?: string;
  at: number;
  endsAt: number;
  closedAt?: number;
  scripted?: boolean;
};
type Me = { userId: string; name: string };

/** How long a closed vote's note stays on the card. */
const NOTE_MS = 10 * 60_000;
const KEPT_MS = 60_000;

/** The options as buttons read: one person is asked ok / no; two changes are named by what they change to. */
export function labelsOf(v: RowVote): Record<string, string> {
  const one = v.voters.length === 1;
  const changes = v.options.filter((o) => o.id !== KEEP);
  return Object.fromEntries(v.options.map((o) => [o.id, o.id === KEEP ? (one ? "no" : "keep it") : one ? "ok" : changes.length > 1 ? (o.changed || "change it") : "change it"]));
}

/** "move game night to sunday?" or, to the one person asked, "tara wants to take towels off the list". */
export function questionOf(v: RowVote, me: Me): string {
  const changes = v.options.filter((o) => o.id !== KEEP);
  if (changes.length > 1) return changes.map((o) => o.ask.replace(/\?$/, "")).join(", or ") + "?";
  const o = changes[0];
  if (!o) return "";
  if (v.voters.length === 1 && voterOf(v.voters, me.userId, me.name)) return `${(o.by ?? "someone").toLowerCase()} wants to ${o.ask.replace(/\?$/, "")}`;
  return o.ask;
}

function Ticket({ host, vote, me, leaving, onAnswer, onWithdraw }: { host: HTMLElement | null; vote: RowVote; me: Me; leaving?: boolean; onAnswer: (id: string, option: string) => void; onWithdraw: (id: string) => void }) {
  const el = useCardEl(host, vote.widgetId);
  if (!el) return null;
  const mine = voterOf(vote.voters, me.userId, me.name);
  const picked = mine ? vote.answers.find((a) => a.voter === mine)?.option : undefined;
  const labels = labelsOf(vote);
  const askers = [...new Set(vote.options.filter((o) => o.by).map((o) => o.by!.toLowerCase()))];
  const asked = vote.options.find((o) => o.byUserId === me.userId && o.id !== KEEP);
  const answered = new Set(vote.answers.map((a) => a.voter));
  return createPortal(
    <div className={`row-vote${leaving ? " is-leaving" : ""}`} data-testid="row-vote" data-vote-id={vote.id} data-voter={mine ? "true" : "false"} data-scripted={vote.scripted ? "true" : undefined}>
      <span className="row-vote-ask" data-testid="row-vote-ask">
        {questionOf(vote, me)}
      </span>
      <span className="row-vote-stake" data-testid="row-vote-stake">
        {askers.join(" and ")} asked · {vote.voters.length === 1 && mine ? `you ${vote.voters[0].why.replace(/^has /, "have ")}` : vote.stake}
        {vote.scripted ? " · scripted" : ""}
      </span>
      {mine ? (
        <span className="row-vote-options">
          {!picked && (
            <b className="row-vote-you" data-testid="row-vote-you">
              waiting on you
            </b>
          )}
          {vote.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="row-vote-option"
              data-testid="row-vote-option"
              data-option={o.id}
              data-picked={picked === o.id ? "true" : undefined}
              data-keep={o.id === KEEP ? "true" : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onAnswer(vote.id, o.id)}
            >
              {labels[o.id]}
            </button>
          ))}
        </span>
      ) : null}
      <span className="row-vote-tally" data-testid="row-vote-tally">
        {vote.voters.map((p) => (
          <i key={voterKey(p)} data-answered={answered.has(voterKey(p)) ? "true" : undefined} title={p.why}>
            {p.name.toLowerCase()}
          </i>
        ))}
        <em>
          {answered.size} of {vote.voters.length} answered
        </em>
        {asked && (
          <button type="button" className="row-vote-withdraw" data-testid="row-vote-withdraw" onPointerDown={(e) => e.stopPropagation()} onClick={() => onWithdraw(vote.id)}>
            withdraw
          </button>
        )}
      </span>
    </div>,
    el,
  );
}

/** A closed vote's line on the card: what happened, and what it cleared. */
export function noteOf(v: RowVote): { stamp: string; line: string } | null {
  if (v.state === "change") {
    if (v.landed && v.landed !== "landed") return { stamp: v.why ?? "changed", line: v.landed.startsWith("waiting") ? v.landed : `didn't land: ${v.landed}` };
    return { stamp: v.why ?? "changed", line: v.note ?? "changed" };
  }
  if (v.state === "moot") return { stamp: "moot", line: v.why ?? "they changed it themselves" };
  if (v.state === "withdrawn") return { stamp: "withdrawn", line: v.why ?? "withdrawn" };
  return { stamp: "kept", line: v.why ?? "kept as it is" };
}

function Note({ host, vote, leaving }: { host: HTMLElement | null; vote: RowVote; leaving?: boolean }) {
  const el = useCardEl(host, vote.widgetId);
  const n = noteOf(vote);
  if (!el || !n) return null;
  return createPortal(
    <div className={`row-vote-note${leaving ? " is-leaving" : ""}`} data-testid="row-vote-note" data-state={vote.state} data-scripted={vote.scripted ? "true" : undefined}>
      <b>{n.stamp}</b>
      <span>{n.line}{vote.scripted ? " · scripted" : ""}</span>
    </div>,
    el,
  );
}

/** Every open vote on the board, and the notes of recently closed ones. */
export function RowVotes({ host, votes, me, onAnswer, onWithdraw }: { host: HTMLElement | null; votes: RowVote[]; me: Me; onAnswer: (id: string, option: string) => void; onWithdraw: (id: string) => void }) {
  // a note lives a while after it closed (the client's clock: queries don't read one)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);
  const open = useMemo(() => votes.filter((v) => v.state === "open").map((v) => ({ ...v, key: v.id })), [votes]);
  const notes = useMemo(
    () => votes.filter((v) => v.state !== "open" && v.closedAt !== undefined && !v.landed?.startsWith("waiting") && now - v.closedAt < (v.state === "change" ? NOTE_MS : KEPT_MS) && !votes.some((o) => o.state === "open" && o.widgetId === v.widgetId)).filter((v, i, all) => all.findIndex((o) => o.widgetId === v.widgetId) === i).map((v) => ({ ...v, key: `note:${v.id}` })),
    [votes, now],
  );
  // a passed change waiting on someone's hand: the ghost's ticket says so; the note comes when it lands
  const shownOpen = useLeaving(open);
  const shownNotes = useLeaving(notes);
  return (
    <>
      {shownOpen.map((v) => (
        <Ticket key={v.key} host={host} vote={v} me={me} leaving={v.leaving} onAnswer={onAnswer} onWithdraw={onWithdraw} />
      ))}
      {shownNotes.map((v) => (
        <Note key={v.key} host={host} vote={v} leaving={v.leaving} />
      ))}
    </>
  );
}
