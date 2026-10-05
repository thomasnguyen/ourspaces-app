/* The voice moment's clock, in one table.

   Every beat of a mock ask (speech, when the card type is known, when each
   part lands, the pause, complete, commit, other screens, the close) is
   driven from the constants below. Each one names where its number comes
   from:

   - "measured": a median straight out of an eval doc (laptop → Token
     Factory → dev deployment, 2026-10-04).
   - "derived":  arithmetic on measured numbers; the sum is written out.
   - "code":     a constant the live code already runs on (the number is not
     a latency, it is a rule).
   - "assumed":  nobody measured this. The number is a defensible pick and
     the note says why. Nothing assumed is faster than what was measured
     around it.
   - "design":   how long our own animation takes. Not a latency.

   Docs live in the local eval folder (`nebius/eval/`, not in the repo).
   `?slow=3` plays every one of these at a third of the speed. The dev
   readout (`?timing=1`) prints the same rows next to what this run did. */

export type TimingKind = "measured" | "derived" | "code" | "assumed" | "design";
export type Timing = { ms: number; kind: TimingKind; source: string; note: string };

const t = (ms: number, kind: TimingKind, source: string, note: string): Timing => ({ ms, kind, source, note });

export const VOICE_TIMINGS = {
  // ---- speech (`&voicePace=talk`) ----
  wordBase: t(200, "measured", "eval/s1-speed.md · How it's measured", "a scripted word takes 200 ms…"),
  wordPerSyllable: t(70, "measured", "eval/s1-speed.md · How it's measured", "…plus 70 ms per syllable, about 180 words a minute"),
  wordGap: t(30, "code", "src/lib/voice.ts runScript", "the breath between two scripted words, as the harness ran it"),
  hesitation: t(900, "measured", "eval/s1-speed.md · How it's measured", '"…" in a script is a 900 ms hesitation'),

  // ---- which card ----
  typeAtKeyword: t(0, "measured", "eval/s1-speed.md · After (guess.ts, 0 ms)", "a card word in the sentence: code names the card the frame the word lands"),
  typeByDecide: t(573, "measured", "eval/decide/head.md · Verdict", "no card word: one-token pick on Ultra, p50 from the laptop, after the call leaves"),
  decideThenFill: t(980, "measured", "eval/decide/head.md · Verdict", "no card word: the pick and the small fill back to back, call → card"),

  // ---- the call ----
  steady: t(200, "code", "src/live/useVoiceBuild.ts STEADY_MS", "words unchanged this long go out as a call"),
  lastWordToFirstField: t(731, "measured", "eval/s1-speed.md · after2 medians", "last word → first field filled"),
  lastWordToComplete: t(778, "measured", "eval/s1-speed.md · after2 medians", "last word → card complete on the asker"),
  callToFirstField: t(531, "derived", "731 − 200", "first field, counted from when the call leaves (last word + steady)"),
  callToComplete: t(578, "derived", "778 − 200", "card complete, counted from when the call leaves"),
  streamWindow: t(47, "derived", "778 − 731", "the whole card streams in this window once its first field is in"),
  roomFillFirstCard: t(775, "measured", "eval/brief/v2.md · Latency (BCD3-ultra)", "an ask that leans on the room (who, among whom) on the bigger model: call → first card"),

  // ---- the end of the ask ----
  pauseQuiet: t(650, "code", "src/lib/voice.ts PAUSE_MS", "quiet after the last word that ends the ask"),
  pauseHang: t(1600, "code", "src/lib/voice.ts HANG_MS", 'the same when the words hang on "for…"'),
  pauseDetected: t(665, "measured", "eval/s1-speed.md · after2 medians", "last word → pause detected"),
  lastWordToCommitted: t(1034, "measured", "eval/s1-speed.md · after2 medians", "last word → committed"),
  lastWordToOthers: t(1065, "measured", "eval/s1-speed.md · after2 medians", "last word → visible in a second browser"),
  commit: t(256, "derived", "1,034 − 778", "card complete → committed"),
  othersAfterCommit: t(31, "derived", "1,065 − 1,034", "committed → on the other screens"),

  // ---- what nobody measured ----
  partBeat: t(40, "assumed", "no measurement", "parts landing one by one: the stream hands a whole card over inside 47 ms, so the beat between two parts on screen is ours. 40 ms is the house stagger; the card is complete on screen later than measured, never sooner"),
  numberTick: t(360, "assumed", "no measurement", "a number counting up to its value (days, dollars): one arrival long"),
  closeHold: t(320, "assumed", "no measurement", "the finished card held on the stage before it lets go: long enough to read as whole"),

  // ---- our own motion ----
  stageOpen: t(760, "design", "VoiceStage.tsx", "the orb's flight from the dock to its place on the stage"),
  cardPop: t(360, "design", "--dur-arrive", "the card's skeleton arriving on the stage"),
  partArrive: t(220, "design", "--dur-base", "one part's own arrival"),
  orbHome: t(500, "design", "--dur-stage", "the orb's flight back to the dock"),
  cardTravel: t(500, "design", "--dur-stage", "the card's travel from the stage to its spot on the board"),
} as const satisfies Record<string, Timing>;

export type TimingName = keyof typeof VOICE_TIMINGS;

/** `?slow=3` → 3: every beat takes three times as long. 1 at real speed. */
export function voiceSlow(): number {
  const n = Number(new URLSearchParams(window.location.search).get("slow"));
  return n >= 1 && n <= 10 ? n : 1;
}

/** A beat's length in this session: the table's number at the session's speed. */
export function beat(name: TimingName): number {
  return VOICE_TIMINGS[name].ms * voiceSlow();
}

/** How the table splits, for the readout and the docs. */
export function timingCounts() {
  const counts: Record<TimingKind, number> = { measured: 0, derived: 0, code: 0, assumed: 0, design: 0 };
  for (const row of Object.values(VOICE_TIMINGS)) counts[row.kind]++;
  return counts;
}
