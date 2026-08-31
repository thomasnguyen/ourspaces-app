/** The space `#/` lands on — the demo's opening beat. */
export const DEFAULT_SPACE_SLUG = "buildroom";

export function normalSpaceHash(slug: string) {
  return slug === DEFAULT_SPACE_SLUG ? "#/" : `#/space/${encodeURIComponent(slug)}`;
}

export function inviteUrlForSpace(slug: string) {
  return `${window.location.origin}${window.location.pathname}#/join/${encodeURIComponent(slug)}`;
}
