/**
 * Faces are content, not identity logic. Keeping the catalog in one place lets
 * seeded people and named visitor personas share the same visual language.
 */
export const AVATAR_CATALOG: Record<string, string> = {
  maya: "/avatars/maya.png",
  jules: "/avatars/jules.png",
  sam: "/avatars/sam.png",
  rio: "/avatars/rio.png",
  kenji: "/avatars/kenji.png",
  ash: "/avatars/ash.png",
  noor: "/avatars/noor.png",
  theo: "/avatars/theo.png",
  gigi: "/avatars/gigi.png",
  marco: "/avatars/marco.png",
  ren: "/avatars/ren.png",
  sky: "/avatars/sky.png",
  alex: "/avatars/alex.png",
  jordan: "/avatars/jordan.png",
  riley: "/avatars/riley.png",
  morgan: "/avatars/morgan.png",
  priya: "/avatars/priya.png",
  casey: "/avatars/casey.png",
  dev: "/avatars/dev.png",
  juno: "/avatars/juno.png",
  momo: "/avatars/momo.png",
  pico: "/avatars/pico.png",
  wren: "/avatars/wren.png",
  ziggy: "/avatars/ziggy.png",
  clover: "/avatars/clover.png",
  pepper: "/avatars/pepper.png",
  kiwi: "/avatars/kiwi.png",
};

export function getAvatarSrc(name: string): string | undefined {
  return AVATAR_CATALOG[name.trim().toLowerCase()];
}

export const VISITOR_AVATAR_NAMES = [
  "juno",
  "momo",
  "pico",
  "wren",
  "ziggy",
  "clover",
  "pepper",
  "kiwi",
] as const;
