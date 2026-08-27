export type Identity = {
  userId: string;
  name: string;
  color: string;
};

export const IDENTITY_STORAGE_KEY = "ourspaces:identity";

// Keep the actual palette in the design tokens so identity colors stay in sync
// with the rest of the app without duplicating color literals in components.
export const IDENTITY_COLORS = [
  "var(--color-crew)",
  "var(--color-couple)",
  "var(--color-trip)",
  "var(--color-fam)",
  "var(--color-league)",
] as const;

export type IdentityColor = (typeof IDENTITY_COLORS)[number];

function isIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Identity>;
  return (
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0 &&
    typeof candidate.color === "string" &&
    candidate.color.length > 0
  );
}

export function getIdentity(): Identity | null {
  if (typeof window === "undefined") return null;

  const saved = window.localStorage.getItem(IDENTITY_STORAGE_KEY);
  if (!saved) return null;

  try {
    const parsed: unknown = JSON.parse(saved);
    return isIdentity(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveIdentity(name: string, color: string): Identity {
  const identity: Identity = {
    userId: crypto.randomUUID(),
    name: name.trim(),
    color,
  };

  window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

