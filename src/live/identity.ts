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
  "#FFB020",
  "#FF3B5C",
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
export const PERSONA_NAMES = [
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

/**
 * Bind this tab's identity to the authenticated Convex user (§1: guest is a
 * real anonymous account, not a random string). Called once the Convex Auth
 * session lands. Everything the person already picked — name, color, face —
 * travels with them, so a guest who later joins stays the same person.
 *
 * No-op when the id is unchanged, so it is safe to call on every render.
 */
export function adoptAuthUserId(authUserId: string) {
  const identity = getIdentity();
  if (identity.userId === authUserId) return;
  current = { ...identity, userId: authUserId };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
}

export function updateIdentity(
  patch: Partial<Omit<LiveIdentity, "userId">>,
) {
  current = { ...getIdentity(), ...patch };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(current));
  for (const listener of listeners) listener();
}

/** Sign out: forget who this tab was. The next load mints a fresh guest. */
export function resetIdentity() {
  window.sessionStorage.removeItem(SESSION_KEY);
  current = null;
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

/** One tap on the entry gate: a name, its colour and its face travel together. */
export type Persona = {
  name: string;
  color: string;
  emoji: string;
  avatarUrl?: string;
};

export const PERSONAS: readonly Persona[] = PERSONA_NAMES.map((name, index) => ({
  name,
  color: IDENTITY_COLORS[index % IDENTITY_COLORS.length],
  emoji: IDENTITY_EMOJIS[index % 8],
  avatarUrl: getAvatarSrc(name),
}));

/** A persona name is a placeholder the next look may replace; a typed name is yours. */
export function isPersonaName(name: string) {
  return (PERSONA_NAMES as readonly string[]).includes(name.trim().toLowerCase());
}

const TAB_KEY = "ourspaces:tab-id";
let tabId: string | null = null;

/**
 * Presence is per TAB, not per person — and that distinction is the whole
 * reason live cursors used to die the moment you tested them.
 *
 * Convex Auth keeps its tokens in localStorage, so two windows of the same
 * browser are the same authenticated user and share `identity.userId`. The
 * presence row is keyed by (spaceId, userId), so window B overwrote window
 * A's row twenty times a second, and each window filtered the single row out
 * as "me". No peer cursor, no peer drag — only the committed drop, which
 * rides the widgets table and never touched presence. Opening a second window
 * is exactly how anyone checks a live canvas, so the feature looked broken
 * while being entirely built.
 *
 * A random id in sessionStorage is per-tab by definition and survives a
 * reload of that tab. Figma and Docs treat your other window as a real second
 * presence for the same reason: it is a real second viewport. Anything about
 * the PERSON — votes, claims, createdBy, who owns a widget — still uses
 * `identity.userId`.
 *
 * It also outlives `adoptAuthUserId`: the presence key never changes mid-
 * session, so the tab can't leave a ghost of itself behind when the silent
 * sign-in lands and swaps the user id underneath it.
 */
export function getPresenceId(): string {
  if (tabId) return tabId;
  const existing = window.sessionStorage.getItem(TAB_KEY);
  tabId = existing ?? crypto.randomUUID();
  if (!existing) window.sessionStorage.setItem(TAB_KEY, tabId);
  return tabId;
}
