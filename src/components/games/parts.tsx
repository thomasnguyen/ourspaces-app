/** The small pieces every game surface draws with: a face, an award sticker. */
import { useEffect, type CSSProperties } from "react";
import { getAvatarSrc } from "../../data/avatars";
import type { Award, GamePerson } from "../../lib/games/types";

/** An invitation outranks the first-visit demo notice: while one is showing, the notice steps aside. */
export function useNoticeAside(showing: boolean) {
  useEffect(() => {
    if (showing) document.querySelector<HTMLDialogElement>('dialog[data-testid="demo-waitlist-dialog"][open]')?.close();
  }, [showing]);
}

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
/** `next →` after a reveal. Live, the round moves on when everyone in has
    pressed it: once you have, the key says who it is waiting on (dashed, like
    every other wait in the room). */
export function NextKey({ round, players, me, label, onNext }: { round: { ready?: string[] }; players: GamePerson[]; me: string; label: string; onNext: () => void }) {
  const lower = (s: string) => s.trim().toLowerCase();
  const ready = (round.ready ?? []).map(lower);
  if (ready.includes(lower(me))) {
    const out = players.filter((p) => !ready.includes(lower(p.name))).map((p) => lower(p.name));
    return (
      <span className="gm-go gm-next-wait" data-testid="game-next-waiting">
        {out.length ? `waiting on ${nameList(out)}` : "next up"}
      </span>
    );
  }
  return (
    <button type="button" className="gm-go" data-testid="game-next" onClick={onNext}>
      {label}
    </button>
  );
}

export function nameList(names: string[]): string {
  const shown = names.map((name) => name.toLowerCase());
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}
