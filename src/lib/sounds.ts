export type UiSound = "tap" | "place" | "promote";

/** Sound design + how to add cues: see public/sounds/README.md */

const SOUND_ENABLED_KEY = "ourspaces:sound-enabled";

const SOUND_FILES: Record<UiSound, string> = {
  tap: "/sounds/tap.mp3",
  place: "/sounds/place.mp3",
  promote: "/sounds/promote.mp3",
};

const SOUND_VOLUMES: Record<UiSound, number> = {
  tap: 0.34,
  place: 0.42,
  promote: 0.52,
};

const audioCache = new Map<UiSound, HTMLAudioElement>();
let soundEnabled: boolean | null = null;

export function getSoundEnabled() {
  if (soundEnabled !== null) return soundEnabled;
  if (typeof window === "undefined") return true;

  soundEnabled = window.localStorage.getItem(SOUND_ENABLED_KEY) !== "false";
  return soundEnabled;
}

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
  }
}

function getAudio(sound: UiSound) {
  const cached = audioCache.get(sound);
  if (cached) return cached;

  const audio = new Audio(SOUND_FILES[sound]);
  audio.preload = "auto";
  audioCache.set(sound, audio);
  return audio;
}

export function preloadSounds() {
  if (typeof Audio === "undefined") return;
  (Object.keys(SOUND_FILES) as UiSound[]).forEach((sound) => {
    getAudio(sound).load();
  });
}

export function playSound(sound: UiSound) {
  if (!getSoundEnabled() || typeof Audio === "undefined") return;

  const audio = getAudio(sound).cloneNode(true) as HTMLAudioElement;
  audio.volume = SOUND_VOLUMES[sound];
  void audio.play().catch(() => {
    // Browsers can reject playback before the first user gesture.
  });
}
