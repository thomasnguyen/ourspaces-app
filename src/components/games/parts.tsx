/** The small pieces every game surface draws with: a face, an award sticker. */
import type { CSSProperties } from "react";
import { getAvatarSrc } from "../../data/avatars";
import type { Award, GamePerson } from "../../lib/games/types";

/** Ink that reads on a flat identity colour. */
export function inkOn(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return "var(--color-ink)";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "var(--color-ink)" : "white";
}

export const byStyle = (person: GamePerson, more: Record<string, string | number> = {}) =>
  ({ "--by": person.color, "--on": inkOn(person.color), ...more }) as CSSProperties;

/** A person as a die-cut sticker: their photo, or their initial on their colour. */
export function GameFace({ person, className = "" }: { person: GamePerson; className?: string }) {
  const src = getAvatarSrc(person.name);
  return (
    <span className={`gm-face ${className}`} style={byStyle(person)}>
      {src ? <img src={src} alt="" draggable={false} /> : <b>{person.name.trim().slice(0, 1)}</b>}
    </span>
  );
}

const TONES = ["var(--color-trip)", "var(--color-couple)", "var(--color-fam)", "var(--color-lime)", "var(--color-league)", "var(--color-crew)"];
const TONE_INK = ["var(--color-ink)", "white", "white", "var(--color-ink)", "var(--color-ink)", "white"];

/** An award: a paper sticker with the round's mark and its title. `dot` is
    the size that rides on an avatar. */
export function AwardSticker({ award, size = "md", i = 0, land = false }: { award: Pick<Award, "title" | "glyph" | "tone" | "prompt">; size?: "dot" | "md" | "lg"; i?: number; land?: boolean }) {
  const tone = ((award.tone % 6) + 6) % 6;
  const style = { "--tone": TONES[tone], "--tone-ink": TONE_INK[tone], "--i": i } as CSSProperties;
  const inside = (
    <>
      <i aria-hidden="true">{award.glyph}</i>
      {size !== "dot" && <b>{award.title}</b>}
    </>
  );
  /* the one that lands at a reveal is the one a take waits for */
  return land ? (
    <span className={`gm-award gm-award-${size} is-landing`} style={style} title={award.prompt} data-testid="game-sticker">
      {inside}
    </span>
  ) : (
    <span className={`gm-award gm-award-${size}`} style={style} title={award.prompt}>
      {inside}
    </span>
  );
}

/** "ash" · "ash and kenji" · "ash, kenji and rio" */
export function nameList(names: string[]): string {
  const shown = names.map((name) => name.toLowerCase());
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}
