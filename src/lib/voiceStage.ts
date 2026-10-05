import type { Widget } from "../data/types";
import { CATALOG, type CardId } from "./deck";
import { fillPlan, partId, type PartValue } from "./voiceFillPlan";

/* The seam between the voice stage and whatever starts a build.

   The stage is the big dark listening view the dock orb opens into
   (components/VoiceStage.tsx). It closes itself when the ask ends. Anything
   that starts building EARLIER, while the person is still talking, calls
   `releaseVoiceStage()`: the stage lets go at once, the orb flies back to the
   dock and keeps listening there, and the board is in view for the card.
   Safe to call any time; it does nothing when no stage is up. */

const listeners = new Set<() => void>();

/** Release the voice stage now (a build has started). */
export function releaseVoiceStage() {
  listeners.forEach((listener) => listener());
}

/** The stage listens here. Returns the unsubscribe. */
export function onVoiceStageRelease(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ---- the build, as the stage reads it ----

   The two-part stage shows the card being built on its right half. It does
   not own the build and knows nothing about calls or models: it reads this
   one shape. `feedVoiceStage()` makes it from what `useVoiceBuild` already
   returns (VoiceBuildLayer calls it on every change), so the stage is a
   layer on top of the build, mock or live. */


export type StagePart = {
  /** `question`, `option-0`, … (test id `voice-stage-part-<id>`) */
  id: string;
  label: string;
  wave: number;
  /** pending: a skeleton. tentative: showing, from your words or an answer
      to words you may still add to. final: the answer for the whole ask. */
  status: "pending" | "tentative" | "final";
  value: PartValue | null;
  tick: boolean;
  /** The value came from a room fact, not the words or the model: which one ("saved places"). */
  room: string | null;
};

export type StageBuild = {
  /** One per ask (the build session's key, its wall-clock start). */
  key: number;
  said: string;
  /** The card type, once known (a card word, or the model's pick). */
  kind: CardId | null;
  /** The build's own widget for it, at board size: skeleton, then card. */
  widget: Widget | null;
  parts: StagePart[];
  /** Every part is final and the card has its spot. */
  complete: boolean;
  /** The placed spot: the board element to travel to (the local draft's id, then the synced id). */
  placed: { widgetId: string; host: HTMLElement } | null;
  /** Nothing could be placed. */
  failed: boolean;
  /** The room facts this card used, in a person's words ("saved places"). */
  sources: string[];
  /** The ask pointed at a card the board already has instead of dealing one: that card. */
  found: { widgetId: string; host: HTMLElement; title: string } | null;
  maker: { name: string; color: string };
};

/** What the live code must provide: exactly these fields of `useVoiceBuild`'s
    return value, plus the maker. */
export type StageFeed = {
  drafts: Widget[];
  shell: { said: string; draftId: string | null } | null;
  landed: { widgetId: string; host: HTMLElement; traceKey: number } | null;
  /** The build's "already here" (useVoiceBuild `found`). */
  found?: { widgetId: string; host: HTMLElement; traceKey: number; title: string } | null;
  receipt: { ok: boolean; key: number } | null;
  traces: Array<{ key: number; said: string; how: string | null; notes?: Array<{ token: string; kind: string; detail: string }> }>;
  color: string;
  by: string;
};

/** A room token in a person's words: "@date(maya's bday)" → "the maya's bday countdown". */
function sourceName(token: string) {
  const m = /^@([a-z-]+)(?:\((.*)\))?$/i.exec(token);
  const of = m?.[2] ? `“${m[2].split(",")[0]}” ` : "";
  switch (m?.[1]) {
    case "places":
      return "your saved places";
    case "coming":
      return `who said yes to ${of || "it"}`.trim();
    case "home":
      return "who's around";
    case "date":
      return `the ${of}countdown`;
    case "leader":
      return `the ${of}poll`;
    case "on-trip":
    case "payer":
      return `the ${of}split`;
    case "last":
      return `the ${of}wheel`;
    default:
      return "the room";
  }
}

let current: StageBuild | null = null;
const watchers = new Set<() => void>();

export function feedVoiceStage(feed: StageFeed) {
  const draft = feed.drafts[0] ?? null;
  const draftKey = draft ? Number(/^voice-draft-(\d+)-/.exec(draft.id)?.[1]) : NaN;
  const key = Number.isFinite(draftKey) ? draftKey : (feed.found?.traceKey ?? feed.landed?.traceKey ?? feed.receipt?.key ?? (feed.shell ? feed.traces[0]?.key : undefined));
  let next: StageBuild | null = null;
  if (key !== undefined) {
    const same = current?.key === key ? current : null;
    // the draft is dropped once its synced copy is on the board: keep showing the last one
    const widget = draft ?? same?.widget ?? null;
    const kind = widget ? (CATALOG.find((c) => c.type === widget.type)?.id ?? null) : null;
    const trace = feed.traces.find((t) => t.key === key);
    const placed = feed.landed?.traceKey === key ? { widgetId: feed.landed.widgetId, host: feed.landed.host } : null;
    const complete = placed !== null;
    const ended = complete || Boolean(trace?.how);
    // where values came from: the resolver's notes on this ask (lib/deck/resolve.ts)
    const fromRoom = new Map<string, string>();
    for (const note of trace?.notes ?? []) {
      if (note.kind === "expanded") for (const value of note.detail.split(", ")) fromRoom.set(value.toLowerCase(), sourceName(note.token));
    }
    const parts: StagePart[] = [];
    if (widget) {
      for (const step of fillPlan(kind).steps) {
        step.read(widget.data as Record<string, unknown>, complete).forEach((value, i) => {
          const status = value === null ? "pending" : complete || (ended && step.from !== "words") ? "final" : "tentative";
          const room = value === null ? null : (fromRoom.get(String(value).toLowerCase()) ?? null);
          parts.push({ id: partId(step, i), label: step.label, wave: step.wave, status, value, tick: Boolean(step.tick), room });
        });
      }
    }
    next = {
      key,
      said: trace?.said || feed.shell?.said || same?.said || "",
      kind,
      widget,
      parts,
      complete,
      placed,
      failed: feed.receipt?.key === key && !feed.receipt.ok,
      sources: [...new Set(parts.flatMap((p) => (p.room ? [p.room] : [])))],
      found: feed.found?.traceKey === key ? { widgetId: feed.found.widgetId, host: feed.found.host, title: feed.found.title } : null,
      maker: { name: feed.by, color: feed.color },
    };
  }
  current = next;
  watchers.forEach((w) => w());
}

export const watchVoiceStage = (w: () => void) => {
  watchers.add(w);
  return () => {
    watchers.delete(w);
  };
};
export const voiceStageBuild = () => current;

/* ---- the beats of the last ask, for the dev readout (`?timing=1`) ---- */

export type StageBeat = { name: string; at: number };
let beats: StageBeat[] = [];
const beatWatchers = new Set<() => void>();
/** Note a beat: `performance.now()` when it showed. First time only per
    name, unless `replace` (the last word keeps moving). "tap" starts a new ask. */
export function markStageBeat(name: string, at = performance.now(), replace = false) {
  if (name === "tap") beats = [];
  else if (replace) beats = beats.filter((b) => b.name !== name);
  else if (beats.some((b) => b.name === name)) return;
  beats = [...beats, { name, at }];
  performance.mark(`stage:${name}`, { startTime: at });
  beatWatchers.forEach((w) => w());
}
export const watchStageBeats = (w: () => void) => {
  beatWatchers.add(w);
  return () => {
    beatWatchers.delete(w);
  };
};
export const stageBeats = () => beats;

/* ---- what the room offers when a card was named with nothing in it ----
   The room registers one function (mock: App.tsx over lib/deck/suggest.ts and
   the mock facts; live: the same over the room brief's facts). */

export type StageOffer = { label: string; say: string; from: string };
let offers: (card: string) => StageOffer[] = () => [];
export function setVoiceStageOffers(fn: (card: string) => StageOffer[]) {
  offers = fn;
}
export const voiceStageOffers = (card: string) => offers(card);
