/** The space `#/` lands on — the demo's opening beat. */
export const DEFAULT_SPACE_SLUG = "buildroom";

export function normalSpaceHash(slug: string) {
  return slug === DEFAULT_SPACE_SLUG ? "#/" : `#/space/${encodeURIComponent(slug)}`;
}

export function inviteUrlForSpace(slug: string) {
  return `${window.location.origin}${window.location.pathname}#/join/${encodeURIComponent(slug)}`;
}

/** `#/about` is an overlay, not a room — it opens over whatever canvas you
 *  were already on, so hitting it from the crew space doesn't quietly move
 *  you to the build room. Session-scoped: a cold link falls back to `#/`. */
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
