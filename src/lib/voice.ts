import { useCallback, useEffect, useRef, useState } from "react";

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

/** Mic loudness → 0..1. Fast attack, slow release, so the orb swells on a
    syllable and settles between words instead of flickering. */
function follow(level: { current: number }, target: number) {
  level.current += (target - level.current) * (target > level.current ? 0.35 : 0.08);
}

/** `?voice=Make a space for our Tahoe weekend` plays a scripted ask instead of
    the mic: words land one at a time and the level fakes a speaking voice.
    Frame-capture takes have no microphone, so this is how the orb gets filmed. */
function runScript(
  script: string,
  level: { current: number },
  onText: (text: string) => void,
  onDone: () => void,
) {
  const words = script.split(/\s+/).filter(Boolean);
  const wordMs = 300;
  const started = performance.now();
  let raf = 0;
  const tick = () => {
    const t = performance.now() - started;
    const spoken = Math.min(words.length, Math.floor(t / wordMs) + 1);
    onText(words.slice(0, spoken).join(" "));
    const inWord = (t % wordMs) / wordMs;
    const talking = t < words.length * wordMs;
    const syllable = Math.sin(inWord * Math.PI) * (0.55 + 0.35 * Math.sin(t / 97));
    follow(level, talking ? Math.max(0, syllable) : 0);
    if (t > words.length * wordMs + 700) {
      onDone();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}

/** What the room does with a finished ask. The orb stays "working" until the
    returned promise settles; without one it rests after 1.4 s as before. */
export type VoiceAsk = (said: string) => Promise<unknown> | void;

export function useVoice(onAsk?: VoiceAsk) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const said = useRef("");
  const askRef = useRef(onAsk);
  askRef.current = onAsk;
  /** Read by the orb every frame; never goes through React. */
  const level = useRef(0);
  const stopRef = useRef<() => void>(() => {});
  const workTimer = useRef(0);

  const finish = useCallback(() => {
    stopRef.current();
    stopRef.current = () => {};
    level.current = 0;
    setState("working");
    window.clearTimeout(workTimer.current);
    const text = said.current.trim();
    const pending = text ? askRef.current?.(text) : undefined;
    if (!pending) {
      workTimer.current = window.setTimeout(() => setState("idle"), 1400);
      return;
    }
    // A stuck call must not hold the orb forever.
    workTimer.current = window.setTimeout(() => setState("idle"), 15000);
    void pending.finally(() => {
      window.clearTimeout(workTimer.current);
      setState((s) => (s === "working" ? "idle" : s));
    });
  }, []);

  const hear = useCallback((text: string) => {
    said.current = text;
    setTranscript(text);
  }, []);

  const start = useCallback(async () => {
    window.clearTimeout(workTimer.current);
    hear("");
    setState("listening");

    const script = new URLSearchParams(window.location.search).get("voice");
    if (script) {
      stopRef.current = runScript(script, level, hear, finish);
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
  }, [finish, hear]);

  useEffect(
    () => () => {
      stopRef.current();
      window.clearTimeout(workTimer.current);
    },
    [],
  );

  return { state, transcript, level, start, finish };
}
