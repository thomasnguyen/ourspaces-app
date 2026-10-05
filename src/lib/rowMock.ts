/**
 * Right of Way in mock mode: a scripted second person holding a card, so the
 * halo and the ghost can be shot without a backend (features/right-of-way.md).
 * Everything here is labelled scripted on screen; nothing is decided by the
 * real gate. `?row=held` the halo · `?row=ghost` + a waiting edit ·
 * `?row=land` the holder lets go after 3 s and the edit lands · `&rowCard=`
 * title words to pick the card (default: the first poll).
 * Choices become a vote (R2): `?row=ask` a scripted asker wants to take the
 * poll's top option off; you and two scripted people voted for it, so a vote
 * rides on the card (one scripted answer in) · `?row=askland` the second
 * scripted person says change it at 2.4 s: 2 of 3, it lands, the note says
 * whose votes were cleared. Counting is the real lib/choiceVote.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { applyEdit } from "./deck/edits";
import { KEEP, tally } from "./choiceVote";
import type { RowGhost, RowLease } from "../components/RightOfWay";
import type { RowVote } from "../components/ChoiceVote";
import type { Widget } from "../data/types";

type Member = { name: string; color: string };
const GRACE_MS = 600;
const LET_GO_AFTER_MS = 3_000;

export function useRowMock(widgets: Widget[], members: Member[]) {
  const mode = useMemo(() => new URLSearchParams(window.location.search).get("row"), []);
  const pick = useMemo(() => new URLSearchParams(window.location.search).get("rowCard")?.toLowerCase(), []);
  const card = useMemo(() => {
    if (!mode) return undefined;
    const title = (w: Widget) => String(w.data.question ?? w.data.title ?? "").toLowerCase();
    return (pick ? widgets.find((w) => title(w).includes(pick)) : undefined) ?? widgets.find((w) => w.type === "poll");
    // the card is picked once, at load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pick, widgets.length]);
  const others = members.filter((m) => m.name.toLowerCase() !== "you");
  const holder = others[1] ?? others[0] ?? { name: "jules", color: "var(--color-crew)" };
  const asker = others[0] ?? { name: "maya", color: "var(--color-couple)" };
  const [t0] = useState(() => Date.now());
  const [phase, setPhase] = useState<"held" | "letting" | "landed">("held");
  /* the vote: answers so far (yours from a tap, theirs on a script) */
  const [answers, setAnswers] = useState<RowVote["answers"]>(() => (mode === "ask" || mode === "askland" ? [{ voter: "scripted-2", option: "c1", at: t0 }] : []));
  useEffect(() => {
    if (mode !== "askland") return;
    const a = window.setTimeout(() => setAnswers((x) => [...x, { voter: "scripted-3", option: "c1", at: Date.now() }]), 2_400);
    return () => window.clearTimeout(a);
  }, [mode]);
  useEffect(() => {
    if (mode !== "land") return;
    const a = window.setTimeout(() => setPhase("letting"), LET_GO_AFTER_MS);
    const b = window.setTimeout(() => setPhase("landed"), LET_GO_AFTER_MS + GRACE_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [mode]);

  return useMemo(() => {
    if (!mode || !card) return { leases: [], ghosts: [], overrides: {}, slip: null, heldBack: null, votes: [], answer: () => {} };
    if (mode === "ask" || mode === "askland") {
      const opts = (card.data.options as { id: string; label: string }[] | undefined) ?? [];
      const top = opts[0];
      const third = others[2] ?? { name: "rio" };
      const voters = [{ id: "you", name: "you", why: `voted for ${top?.label ?? "it"}` }, { id: "scripted-2", name: holder.name, why: `voted for ${top?.label ?? "it"}` }, { id: "scripted-3", name: third.name, why: `voted for ${top?.label ?? "it"}` }];
      const options = [{ id: KEEP, ask: "" }, { id: "c1", ask: `take ${top?.label.toLowerCase() ?? "it"} off the poll?`, by: asker.name, byUserId: "scripted-asker" }];
      const out = tally(voters, options, answers);
      const closed = out.state !== "open";
      const r = top ? applyEdit({ type: card.type, data: card.data as Record<string, unknown> }, { op: "removeOption", value: top.label }, { today: new Date().toISOString().slice(0, 10), votes: { [top.id]: 0 } }) : null;
      const vote: RowVote = {
        id: "scripted-vote", widgetId: card.id, stake: `3 people voted for ${top?.label.toLowerCase() ?? "it"}`, voters, options, answers, at: t0, endsAt: t0 + 86_400_000, scripted: true,
        state: out.state, ...(closed ? { closedAt: Date.now(), why: out.state === "change" ? `${out.n} of ${out.of} said change it` : "kept as it is", ...(out.state === "change" ? { note: `${top?.label.toLowerCase()} votes cleared · 3 people, vote again`, landed: "landed" } : {}) } : {}),
      };
      const overrides = out.state === "change" && r?.ok ? { [card.id]: r.data as Widget["data"] } : {};
      return { leases: [], ghosts: [], overrides, slip: null, heldBack: null, votes: [vote], answer: (_id: string, option: string) => setAnswers((x) => [...x.filter((a) => a.voter !== "you"), { voter: "you", option, at: Date.now() }]) };
    }
    const op = card.type === "poll" ? { op: "addOption", value: "ramen" } : { op: "rename", value: "taco tuesday" };
    const r = applyEdit({ type: card.type, data: card.data as Record<string, unknown> }, op, { today: new Date().toISOString().slice(0, 10) });
    const leases: RowLease[] =
      phase === "landed" ? [] : [{ thing: card.id, kind: "drag", userId: "scripted", name: holder.name, color: holder.color, since: t0, ...(phase === "letting" ? { letGoAt: t0 + LET_GO_AFTER_MS } : {}), scripted: true }];
    const ghosts: RowGhost[] =
      mode === "held" || phase === "landed" || !r.ok
        ? []
        : [{ id: "scripted-ghost", thing: card.id, widgetId: card.id, kind: "edit", by: asker.name, byUserId: "scripted-asker", text: r.text, write: JSON.stringify({ kind: "edit", op }), on: JSON.stringify({ userId: "scripted", name: holder.name, color: holder.color, kind: "drag" }), at: t0, scripted: true }];
    const overrides = phase === "landed" && r.ok ? { [card.id]: r.data as Widget["data"] } : {};
    const slip = phase === "landed" && r.ok ? { id: "scripted-slip", widgetId: card.id, text: `${asker.name.toLowerCase()} ${r.text} · waited ${((LET_GO_AFTER_MS + GRACE_MS) / 1000).toFixed(1)} s for ${holder.name.toLowerCase()} · scripted`, color: asker.color } : null;
    // "what it held back", scripted (the live page reads the ledger)
    const heldBack = [
      { id: "s1", at: t0, kind: "edit", by: asker.name, verdict: "wait", reason: `${holder.name} is moving it`, text: `${r.ok ? r.text : "a change"} · scripted`, outcome: JSON.stringify({ state: "landed", ms: 4500, on: holder.name }) },
      { id: "s2", at: t0, kind: "edit", by: asker.name, verdict: "wait", reason: `${holder.name} is typing in it`, text: "renamed it taco tuesday · scripted", outcome: JSON.stringify({ state: "dropped", ms: 3900, on: holder.name }) },
      { id: "s3", at: t0, kind: "edit", by: holder.name, verdict: "never", reason: "3 people voted for pizza; i won't remove it", text: "took pizza off · scripted" },
    ];
    heldBack.push({ id: "s4", at: t0, kind: "edit", by: asker.name, verdict: "ask", reason: `that's 3 people's choice: 3 people said yes to friday`, text: "move game night to sunday? · scripted", outcome: JSON.stringify({ state: "changed", ms: 41000, on: "3 people said yes to friday", why: "2 of 3 said change it" }) });
    return { leases, ghosts, overrides, slip, heldBack, votes: [] as RowVote[], answer: (_id: string, _option: string) => {} };
  }, [mode, card, phase, holder.name, holder.color, asker.name, asker.color, t0, answers, others]);
}
