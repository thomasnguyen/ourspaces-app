import { useSyncExternalStore } from "react";
import { getAvatarSrc } from "../data/avatars";

export type LiveIdentity = {
  userId: string;
  name: string;
  color: string;
  emoji: string;
  avatarUrl?: string;
};

export const IDENTITY_COLORS = [
  "#7C5CFF",
  "#E63DA8",
  "#FF7A3D",
  "#3D6EFF",
  "#13B8A6",
  "#C6F750",
] as const;

export const IDENTITY_EMOJIS = [
  "🦊",
  "🐸",
  "🐙",
  "🐦",
  "🍄",
  "🌵",
  "⭐",
  "👻",
  "🐢",
  "🦋",
  "🍒",
  "🍑",
  "🔥",
  "✨",
] as const;

const SESSION_KEY = "ourspaces:tab-identity";
const SEQUENCE_KEY = "ourspaces:persona-sequence";
const PERSONA_NAMES = [
  "juno",
  "momo",
  "pico",
  "wren",
  "ziggy",
  "clover",
  "pepper",
  "kiwi",
] as const;

let current: LiveIdentity | null = null;
const listeners = new Set<() => void>();

function emojiForUser(userId: string) {
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return IDENTITY_EMOJIS[hash % 8];
}

function isLiveIdentity(value: unknown): value is LiveIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<LiveIdentity>;
  return (
    typeof identity.userId === "string" &&
    typeof identity.name === "string" &&
    typeof identity.color === "string"
  );
}

function load(): LiveIdentity {
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) {
    try {
      const parsed: unknown = JSON.parse(existing);
      if (isLiveIdentity(parsed)) {
        const identity: LiveIdentity = {
          ...parsed,
          emoji:
            typeof parsed.emoji === "string"
              ? parsed.emoji
              : emojiForUser(parsed.userId),
          avatarUrl:
            typeof parsed.avatarUrl === "string"
              ? parsed.avatarUrl
              : getAvatarSrc(parsed.name),
        };
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
        return identity;
      }
    } catch {
      // Reallocate below.
    }
    window.sessionStorage.removeItem(SESSION_KEY);
  }

  const sequence = Number.parseInt(
    window.localStorage.getItem(SEQUENCE_KEY) ?? "0",
    10,
  );
  const index = Number.isFinite(sequence)
    ? Math.abs(sequence) % PERSONA_NAMES.length
    : 0;
  window.localStorage.setItem(SEQUENCE_KEY, String(index + 1));
  const identity: LiveIdentity = {
    userId: crypto.randomUUID(),
    name: PERSONA_NAMES[index],
    color: IDENTITY_COLORS[index % IDENTITY_COLORS.length],
    emoji: IDENTITY_EMOJIS[index % 8],
    avatarUrl: getAvatarSrc(PERSONA_NAMES[index]),
  };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
  return identity;
}

export function getIdentity(): LiveIdentity {
  if (!current) current = load();
  return current;
}

export function updateIdentity(
  patch: Partial<Omit<LiveIdentity, "userId">>,
) {
  current = { ...getIdentity(), ...patch };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
}

export function useIdentity() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getIdentity,
    getIdentity,
  );
}
