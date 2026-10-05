/** The space a bare URL opens — always shown with its explicit room slug. */
export const DEFAULT_SPACE_SLUG = "crew";

export function normalSpaceHash(slug: string) {
  return `#/space/${encodeURIComponent(slug)}`;
}

/** A room's own "what this space knows" page: `#/space/<slug>/knows`. */
export function knowsHash(slug: string) {
  return `${normalSpaceHash(slug)}/knows`;
}

/** The room a `#/space/<slug>[/page]` hash names, without the page. */
export function slugOfSpaceHash(rest: string) {
  return rest.split(/[/?]/)[0];
}

/** Which page of the room the hash is on: the board, or what the space knows. */
export function spacePageFromHash(): "board" | "knows" {
  return /^#\/?space\/[^/?]+\/knows\b/.test(window.location.hash) ? "knows" : "board";
}

export function inviteUrlForSpace(slug: string) {
  return `${window.location.origin}${window.location.pathname}#/join/${encodeURIComponent(slug)}`;
}

/** About remembers the room you came from. A cold link returns to the
 *  crew at its explicit `#/space/crew` address. */
const LAST_SPACE_KEY = "ourspaces:last-space";

export function rememberSpaceSlug(slug: string) {
  try {
    window.sessionStorage.setItem(LAST_SPACE_KEY, slug);
  } catch {
    /* private mode — the default slug is a fine answer */
  }
}

export function lastSpaceSlug(): string {
  try {
    return window.sessionStorage.getItem(LAST_SPACE_KEY) || DEFAULT_SPACE_SLUG;
  } catch {
    return DEFAULT_SPACE_SLUG;
  }
}
