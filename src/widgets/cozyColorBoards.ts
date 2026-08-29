// The cozy-color postcard gallery: our generated scene + traced masterpieces.
// Traced boards come from scripts/trace-artwork.mjs; the scene from
// scripts/generate-cozy-art.mjs.

import { ART_DECOR, ART_H, ART_REGIONS, ART_W } from "./cozyColorArt";
import { BOARD as STARRY } from "./boards/starry";
import { BOARD as WAVE } from "./boards/wave";

export type BoardLabel = { x: number; y: number; s: number };
export type BoardRegion = { id: string; c: number; d: string; labels: BoardLabel[] };

export type CozyBoard = {
  id: string;
  title: string;
  credit?: string;
  w: number;
  h: number;
  /** palette per shared preset value; index = region.c, number shown = c+1 */
  palettes: { electric: string[]; sunset: string[] };
  presetLabels: { electric: string; sunset: string };
  poster: string;
  regions: BoardRegion[];
  /** full traced art rendered muted beneath the blank board */
  underlay?: { d: string; c: number }[];
  muted?: string[];
  /** thin always-on detail strokes (generated scene only) */
  decor?: { d: string; w: number }[];
};

const SCENE_TONE_INDEX = { berry: 0, orange: 1, blue: 2, violet: 3, teal: 4, lime: 5 } as const;

const SCENE: CozyBoard = {
  id: "same-moon",
  title: "same moon, both windows",
  credit: "our own postcard",
  w: ART_W,
  h: ART_H,
  palettes: {
    electric: [
      "var(--color-couple)",
      "var(--color-trip)",
      "var(--color-fam)",
      "var(--color-crew)",
      "var(--color-league)",
      "var(--color-lime)",
    ],
    sunset: [
      "var(--color-trip)",
      "var(--color-couple)",
      "var(--color-crew)",
      "var(--color-fam)",
      "var(--color-lime)",
      "var(--color-league)",
    ],
  },
  presetLabels: { electric: "night pop", sunset: "sunset" },
  poster: "/assets/cozy-color-poster.svg",
  regions: ART_REGIONS.map((region) => ({
    id: region.id,
    c: SCENE_TONE_INDEX[region.tone],
    d: region.d,
    labels: region.labels,
  })),
  decor: ART_DECOR,
};

export const COZY_BOARDS: CozyBoard[] = [
  {
    id: STARRY.id,
    title: STARRY.title,
    credit: STARRY.credit,
    w: STARRY.w,
    h: STARRY.h,
    palettes: { electric: STARRY.classic, sunset: STARRY.neon },
    presetLabels: { electric: "classic", sunset: "neon" },
    poster: STARRY.poster,
    regions: STARRY.regions,
    underlay: STARRY.underlay,
    muted: STARRY.muted,
  },
  {
    id: WAVE.id,
    title: WAVE.title,
    credit: WAVE.credit,
    w: WAVE.w,
    h: WAVE.h,
    palettes: { electric: WAVE.classic, sunset: WAVE.neon },
    presetLabels: { electric: "classic", sunset: "neon" },
    poster: WAVE.poster,
    regions: WAVE.regions,
    underlay: WAVE.underlay,
    muted: WAVE.muted,
  },
  SCENE,
];

/** legacy scene strokes have unprefixed region ids */
export const strokePrefix = (board: CozyBoard) => (board.id === "same-moon" ? "" : `${board.id}:`);
