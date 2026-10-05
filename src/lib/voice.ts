import { useCallback, useEffect, useRef, useState } from "react";
import { sentenceHangs } from "./deck/guess";

/** The dock orb's three moods: resting, hearing you, and chewing on it. */
export type VoiceState = "idle" | "listening" | "working";

type RecognitionResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function makeRecognition(): Recognition | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

const wordCount = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g)?.length ?? 0;

/** Mic loudness → 0..1. Fast attack, slow release, so the orb swells on a
    syllable and settles between words instead of flickering. */
function follow(level: { current: number }, target: number) {
  level.current += (target - level.current) * (target > level.current ? 0.35 : 0.08);
}

/** One scripted word's spoken length: ~180 words a minute, longer words longer. */
function wordMs(word: string) {
  const syllables = Math.max(1, word.toLowerCase().replace(/[^a-z]/g, "").match(/[aeiouy]+/g)?.length ?? 1);
  return 200 + 70 * syllables;
}

/** A hesitation mid-ask, written into a script as "…" or "..." ("…500": 500 ms). */
const HESITATE = /^(…|\.\.\.)(\d+)?$/;

/** `?voice=Make a space for our Tahoe weekend` plays a scripted ask instead of
    the mic: words land one at a time and the level fakes a speaking voice.
    Frame-capture takes have no microphone, so this is how the orb gets filmed.
    Default pace: a word every 300 ms, shown as it starts. `&voicePace=talk`:
    each word takes its spoken length and shows when it ends (the way a
    recogniser hands words over), and "…" in the script is a hesitation of
    `&voicePause=` ms (900 by default). The script never ends the ask itself:
    the pause after its last word does, the same as with a real voice. */
function runScript(
  script: string,
  level: { current: number },
  onText: (text: string) => void,
  onDone: () => void,
) {
  const q = new URLSearchParams(window.location.search);
  const talk = q.get("voicePace") === "talk";
  const pause = Number(q.get("voicePause") ?? 900) || 900;
  const tokens = script.replace(/(\S)(…|\.\.\.)/g, "$1 $2").split(/\s+/).filter(Boolean);
  // Each word: when it starts and ends being said, ms from the tap.
  const words: { word: string; from: number; to: number }[] = [];
  let at = 0;
  for (const token of tokens) {
    const hesitate = HESITATE.exec(token);
    if (hesitate) {
      at += Number(hesitate[2] ?? pause);
      continue;
    }
    const len = talk ? wordMs(token) : 300;
    words.push({ word: token, from: at, to: at + len });
    at += len + (talk ? 30 : 0);
  }
  const end = words.length ? words[words.length - 1].to : 0;
  const started = performance.now();
  let raf = 0;
  const tick = () => {
    const t = performance.now() - started;
    const spoken = words.filter((w) => (talk ? w.to <= t : w.from <= t)).length;
    onText(words.slice(0, Math.max(talk ? 0 : 1, spoken)).map((w) => w.word).join(" "));
    const word = words.find((w) => w.from <= t && t < w.to);
    const inWord = word ? (t - word.from) / (word.to - word.from) : 0;
    const syllable = Math.sin(inWord * Math.PI) * (0.55 + 0.35 * Math.sin(t / 97));
    follow(level, word ? Math.max(0, syllable) : 0);
    // Safety only: the listener ends the ask on the pause long before this.
    if (t > end + 5000) {
      onDone();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

/** How an ask ended: the pause after the last word, or the done button. */
export type VoiceEnd = { how: "pause" | "done"; lastWordAt: number; endedAt: number };

/** What the room does with a finished ask. The orb stays "working" until the
    returned promise settles; without one it rests after 1.4 s as before. */
export type VoiceAsk = (said: string, end: VoiceEnd) => Promise<unknown> | void;

/** The room listening along: `start` on the tap, `words` every time the
    transcript changes, `ask` once it ends. `ready`: these words already
    made a whole card, so a shorter quiet is enough to end on. A word that
    lands just after a pause ended the ask reopens it: `words` again, then
    `ask` again with the longer sentence. */
export type VoiceHooks = {
  start?: () => void;
  words?: (text: string) => void;
  ask?: VoiceAsk;
  ready?: (text: string) => boolean;
};

/** Quiet after the last word that ends the ask. */
const PAUSE_MS = 650;
/** …unless the words stop mid-thought ("add a poll for…"): then wait longer. */
const HANG_MS = 1600;
/** …and when the words already made a whole card (never on a trailing number: "640…"). */
const READY_MS = 350;
/** After a pause ends the ask, a word this soon reopens it instead of being lost. */
const LATE_MS = 1200;
/** A loud room can't hold an ask open past this much quiet from the recogniser. */
const MAX_QUIET_MS = 2600;
/** Nothing said at all: give up. */
const NOTHING_MS = 9000;

export function useVoice(hooks: VoiceHooks = {}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const said = useRef("");
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  /** Read by the orb every frame; never goes through React. */
  const level = useRef(0);
  const stopRef = useRef<() => void>(() => {});
  const workTimer = useRef(0);
  /** performance.now() of the newest words: the last word, once the ask ends. */
  const lastWordAt = useRef(0);
  const listenTimer = useRef(0);
  const listening = useRef(false);
  const lateTimer = useRef(0);
  /** Words when the last ask ended on a pause: a late word reopens only if it adds one. */
  const endedWords = useRef(-1);
  const askSeq = useRef(0);

  const finish = useCallback((how: VoiceEnd["how"] = "done") => {
    window.clearInterval(listenTimer.current);
    if (!listening.current) return;
    listening.current = false;
    const endedAt = performance.now();
    if (how === "pause") performance.mark("voice:pause");
    level.current = 0;
    window.clearTimeout(lateTimer.current);
    if (how === "pause") {
      // Keep hearing a moment: a word that was only a hesitation away reopens the ask.
      endedWords.current = wordCount(said.current);
      lateTimer.current = window.setTimeout(() => {
        if (listening.current) return;
        endedWords.current = -1;
        stopRef.current();
        stopRef.current = () => {};
      }, LATE_MS);
    } else {
      endedWords.current = -1;
      stopRef.current();
      stopRef.current = () => {};
    }
    if (lastWordAt.current) performance.mark("voice:last-word", { startTime: lastWordAt.current });
    setState("working");
    window.clearTimeout(workTimer.current);
    const text = said.current.trim();
    const seq = ++askSeq.current;
    const pending = text ? hooksRef.current.ask?.(text, { how, lastWordAt: lastWordAt.current, endedAt }) : undefined;
    if (!pending) {
      workTimer.current = window.setTimeout(() => setState("idle"), 1400);
      return;
    }
    // A stuck call must not hold the orb forever.
    workTimer.current = window.setTimeout(() => setState("idle"), 15000);
    void pending.finally(() => {
      window.clearTimeout(workTimer.current);
      if (seq === askSeq.current) setState((s) => (s === "working" ? "idle" : s));
    });
  }, []);

  const hear = useCallback((text: string) => {
    if (!listening.current) {
      // Just ended on a pause: only a new word reopens it, not a recogniser's tidy-up.
      if (endedWords.current < 0 || wordCount(text) <= endedWords.current) return;
      endedWords.current = -1;
      window.clearTimeout(lateTimer.current);
      listening.current = true;
      setState("listening");
      listenRef.current();
    }
    if (text && text !== said.current) {
      if (!said.current) performance.mark("voice:first-word");
      lastWordAt.current = performance.now();
      hooksRef.current.words?.(text);
    }
    said.current = text;
    setTranscript(text);
  }, []);

  /* A pause is the end: no new words for PAUSE_MS while the voice is quiet. */
  const listenForPause = useCallback(() => {
    const startedAt = performance.now();
    window.clearInterval(listenTimer.current);
    listenTimer.current = window.setInterval(() => {
      const now = performance.now();
      if (!said.current) {
        if (now - startedAt > NOTHING_MS) finish("pause");
        return;
      }
      const quiet = now - lastWordAt.current;
      const wait = sentenceHangs(said.current)
        ? HANG_MS
        : !/\d\W*$/.test(said.current) && hooksRef.current.ready?.(said.current)
          ? READY_MS
          : PAUSE_MS;
      if ((quiet > wait && level.current < 0.2) || quiet > MAX_QUIET_MS) finish("pause");
    }, 25);
  }, [finish]);
  const listenRef = useRef(listenForPause);
  listenRef.current = listenForPause;

  const start = useCallback(async () => {
    window.clearTimeout(workTimer.current);
    window.clearTimeout(lateTimer.current);
    endedWords.current = -1;
    stopRef.current();
    stopRef.current = () => {};
    performance.mark("voice:tap");
    lastWordAt.current = 0;
    said.current = "";
    setTranscript("");
    setState("listening");
    listening.current = true;
    hooksRef.current.start?.();
    listenForPause();

    const script = new URLSearchParams(window.location.search).get("voice");
    if (script) {
      stopRef.current = runScript(script, level, hear, () => finish("pause"));
      return;
    }

    let raf = 0;
    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let recognition = makeRecognition();
    stopRef.current = () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      void audio?.close();
      recognition?.stop();
    };

    if (recognition) {
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        let text = "";
        for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
        hear(text.trim());
      };
      recognition.onend = () => {
        recognition = null;
      };
      recognition.start();
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      audio = new AudioContext();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      audio.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) sum += sample * sample;
        const rms = Math.sqrt(sum / buffer.length);
        follow(level, Math.sqrt(Math.min(1, Math.max(0, rms - 0.004) * 6)));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // No mic permission: the orb still shows it's listening, it just can't swell.
    }
  }, [finish, hear, listenForPause]);

  useEffect(
    () => () => {
      stopRef.current();
      window.clearTimeout(workTimer.current);
      window.clearInterval(listenTimer.current);
      window.clearTimeout(lateTimer.current);
    },
    [],
  );

  return { state, transcript, level, start, finish };
}
