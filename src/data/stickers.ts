export type StickerDefinition = {
  id: string;
  label: string;
  src: string;
  width: number;
  height: number;
  rotate: number;
};

export const STICKER_CATALOG: StickerDefinition[] = [
  {
    id: "glad-ur-here",
    label: "glad ur here",
    src: "/assets/stickers/glad-ur-here.png",
    width: 92,
    height: 94,
    rotate: -7,
  },
  {
    id: "since-19",
    label: "since '19",
    src: "/assets/stickers/since-19.png",
    width: 136,
    height: 68,
    rotate: 4,
  },
  {
    id: "ours",
    label: "ours",
    src: "/assets/stickers/ours.png",
    width: 142,
    height: 80,
    rotate: -3,
  },
  {
    id: "good-vibes",
    label: "good vibes",
    src: "/assets/stickers/good-vibes.png",
    width: 128,
    height: 96,
    rotate: 2,
  },
  {
    id: "double-smile",
    label: "double smile",
    src: "/assets/stickers/double-smile.png",
    width: 132,
    height: 84,
    rotate: -4,
  },
  {
    id: "sparkle-burst",
    label: "sparkle burst",
    src: "/assets/stickers/sparkle-burst.png",
    width: 88,
    height: 94,
    rotate: 5,
  },
];

export function getStickerDefinition(stickerId: unknown) {
  return STICKER_CATALOG.find((sticker) => sticker.id === stickerId);
}
