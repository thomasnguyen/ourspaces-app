/** SomaFM room radio — one shared HTMLAudioElement, no player library. */

export type RadioStation = {
  id: string;
  name: string;
  chip: string;
  tag: string;
};

export const RADIO_STATIONS: RadioStation[] = [
  { id: "indiepop", name: "Indie Pop Rocks", chip: "indie", tag: "indie pop" },
  { id: "groovesalad", name: "Groove Salad", chip: "chill", tag: "chill beats" },
  { id: "lush", name: "Lush", chip: "lush", tag: "mellow vocals" },
  { id: "folkfwd", name: "Folk Forward", chip: "folk", tag: "indie folk" },
  { id: "poptron", name: "PopTron", chip: "pop", tag: "alt pop" },
  { id: "thetrip", name: "The Trip", chip: "trip", tag: "prog house" },
];

export const DEFAULT_STATION_ID = RADIO_STATIONS[0].id;

export type RadioTrack = { title: string; artist: string };

export type RadioSnapshot = {
  ownerId: string | null;
  stationId: string | null;
  playing: boolean;
  waiting: boolean;
  error: boolean;
  track: RadioTrack | null;
  tracks: Record<string, RadioTrack>;
};

// SomaFM ice 403s any browser request with a Referer. Radio Paradise allows it.
const OPEN_STREAMS: Record<string, string> = {
  indiepop: "https://stream.radioparadise.com/aac-128",
  groovesalad: "https://stream.radioparadise.com/mellow-128",
  lush: "https://stream.radioparadise.com/mellow-128",
  folkfwd: "https://stream.radioparadise.com/global-128",
  poptron: "https://stream.radioparadise.com/rock-128",
  thetrip: "https://stream.radioparadise.com/beyond-128",
};
const OPEN_STREAM = OPEN_STREAMS.groovesalad;
const listeners = new Set<() => void>();

let audio: HTMLAudioElement | null = null;
let playGen = 0;
let songTimer: number | null = null;
let trackCache: { stationId: string; track: RadioTrack | null; at: number } | null =
  null;

let snapshot: RadioSnapshot = {
  ownerId: null,
  stationId: null,
  playing: false,
  waiting: false,
  error: false,
  track: null,
  tracks: {},
};

export function stationById(id: string | undefined) {
  return RADIO_STATIONS.find((station) => station.id === id) ?? RADIO_STATIONS[0];
}

export function subscribeRadio(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRadioSnapshot() {
  return snapshot;
}

function emit(next: Partial<RadioSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function sources(stationId: string) {
  const primary = OPEN_STREAMS[stationId] ?? OPEN_STREAM;
  return primary === OPEN_STREAM ? [primary] : [primary, OPEN_STREAM];
}

function disposeAudio() {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  audio.remove();
  audio = null;
}

function getAudio() {
  if (audio) return audio;
  audio = document.createElement("audio");
  audio.preload = "none";
  audio.volume = 0.82;
  // SomaFM 403s any request that sends a Referer from another origin.
  audio.setAttribute("referrerpolicy", "no-referrer");
  audio.setAttribute("playsinline", "");
  audio.style.display = "none";
  document.body.appendChild(audio);
  audio.addEventListener("playing", () => {
    emit({ playing: true, waiting: false, error: false });
  });
  audio.addEventListener("pause", () => {
    if (snapshot.waiting) return;
    emit({ playing: false });
  });
  audio.addEventListener("waiting", () => {
    if (!snapshot.error) emit({ waiting: true });
  });
  return audio;
}

function startSrc(el: HTMLAudioElement, urls: string[], gen: number) {
  const src = urls[0];
  const rest = urls.slice(1);
  if (!src) {
    emit({ playing: false, waiting: false, error: true });
    return;
  }
  const onError = () => {
    el.removeEventListener("error", onError);
    if (gen !== playGen) return;
    if (rest.length) {
      emit({ waiting: true, error: false, playing: false });
      startSrc(el, rest, gen);
      return;
    }
    emit({ playing: false, waiting: false, error: true });
  };
  el.addEventListener("error", onError);
  el.setAttribute("referrerpolicy", "no-referrer");
  el.src = src;
  void el.play().catch((error) => {
    if (gen !== playGen) return;
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") return;
    if (name === "NotAllowedError") {
      el.removeEventListener("error", onError);
      emit({ playing: false, waiting: false, error: true });
    }
  });
}

async function loadTrack(stationId: string) {
  const fresh = trackCache && trackCache.stationId === stationId && Date.now() - trackCache.at < 12_000;
  if (fresh && trackCache) {
    rememberTrack(stationId, trackCache.track);
    return;
  }
  try {
    const response = await fetch(`https://somafm.com/songs/${stationId}.json`);
    const data = (await response.json()) as {
      songs?: Array<{ title?: string; artist?: string }>;
    };
    const song = data.songs?.[0];
    const track =
      song?.title && song.artist ? { title: song.title, artist: song.artist } : null;
    trackCache = { stationId, track, at: Date.now() };
    rememberTrack(stationId, track);
  } catch {
    rememberTrack(stationId, null);
  }
}

function rememberTrack(stationId: string, track: RadioTrack | null) {
  emit({
    tracks: track
      ? { ...snapshot.tracks, [stationId]: track }
      : snapshot.tracks,
    track: snapshot.stationId === stationId ? track : snapshot.track,
  });
}

function startSongPoll(stationId: string) {
  void loadTrack(stationId);
  if (songTimer !== null) window.clearInterval(songTimer);
  songTimer = window.setInterval(() => {
    void loadTrack(stationId);
  }, 20_000);
}

export function prefetchTrack(stationId: string) {
  void loadTrack(stationId);
}

export function playRadio(ownerId: string, stationId: string) {
  disposeAudio();
  const el = getAudio();
  const gen = ++playGen;
  const keepTrack = snapshot.stationId === stationId ? snapshot.track : null;
  emit({
    ownerId,
    stationId,
    waiting: true,
    error: false,
    playing: false,
    track: keepTrack,
  });
  startSongPoll(stationId);
  startSrc(el, sources(stationId), gen);
}

export function stopRadio() {
  playGen += 1;
  if (songTimer !== null) {
    window.clearInterval(songTimer);
    songTimer = null;
  }
  disposeAudio();
  emit({ playing: false, waiting: false, ownerId: null, error: false });
}

export function isListeningTo(ownerId: string, stationId: string) {
  return snapshot.playing && snapshot.ownerId === ownerId && snapshot.stationId === stationId;
}
