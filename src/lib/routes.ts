export function normalSpaceHash(slug: string) {
  return slug === "crew" ? "#/" : `#/space/${encodeURIComponent(slug)}`;
}

export function inviteUrlForSpace(slug: string) {
  return `${window.location.origin}${window.location.pathname}#/join/${encodeURIComponent(slug)}`;
}
