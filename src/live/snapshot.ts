import type { Widget } from "../data/types";

const MAX_SERIALIZED_SIZE = 200 * 1024;

export type SpaceSnapshot = {
  name: string;
  canvasW?: number;
  canvasH?: number;
  widgets: Widget[];
  savedAt: number;
};

function storageKey(slug: string) {
  return `ourspaces:snapshot:v1:${slug}`;
}

function isSnapshot(value: unknown): value is SpaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<SpaceSnapshot>;
  return (
    typeof snapshot.name === "string" &&
    Array.isArray(snapshot.widgets) &&
    typeof snapshot.savedAt === "number"
  );
}

export function readSpaceSnapshot(slug: string): SpaceSnapshot | undefined {
  if (typeof window === "undefined") return undefined;

  const serialized = window.localStorage.getItem(storageKey(slug));
  if (!serialized) return undefined;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isSnapshot(parsed)) {
      window.localStorage.removeItem(storageKey(slug));
      return undefined;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(storageKey(slug));
    return undefined;
  }
}

export function writeSpaceSnapshot(slug: string, snapshot: SpaceSnapshot) {
  if (typeof window === "undefined") return;

  try {
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > MAX_SERIALIZED_SIZE) return;
    window.localStorage.setItem(storageKey(slug), serialized);
  } catch {
    // A private window or a full quota should never interrupt the live board.
  }
}
