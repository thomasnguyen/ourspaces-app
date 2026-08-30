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
    label: "hello cat",
    src: "/assets/stickers/hello-cat.png",
    width: 116,
    height: 156,
    rotate: -5,
  },
  {
    id: "rio-socks",
    label: "Rio in socks",
    src: "/assets/stickers/socks-terrier.png",
    width: 148,
    height: 151,
    rotate: 3,
  },
  {
    id: "holo-smiley",
    label: "holographic smiley",
    src: "/assets/stickers/holo-smiley.png",
    width: 133,
    height: 152,
    rotate: -3,
  },
  {
    id: "since-19",
    label: "pizza pals",
    src: "/assets/stickers/pizza-pals.png",
    width: 105,
    height: 160,
    rotate: 4,
  },
  {
    id: "blah-blah",
    label: "blah blah blah",
    src: "/assets/stickers/blah-blah.png",
    width: 156,
    height: 144,
    rotate: -4,
  },
  {
    id: "maya-cake",
    label: "Maya's matcha cake",
    src: "/assets/stickers/matcha-cake.png",
    width: 150,
    height: 155,
    rotate: 3,
  },
  {
    id: "ours",
    label: "roller crew",
    src: "/assets/stickers/roller-crew.png",
    width: 139,
    height: 160,
    rotate: -3,
  },
  {
    id: "crew-high-five",
    label: "crew high five",
    src: "/assets/stickers/crew-high-five.png",
    width: 150,
    height: 148,
    rotate: 4,
  },
  {
    id: "good-vibes",
    label: "skate sun",
    src: "/assets/stickers/skate-sun.png",
    width: 135,
    height: 160,
    rotate: 3,
  },
  {
    id: "tahoe-car",
    label: "Tahoe road trip",
    src: "/assets/stickers/tahoe-car.png",
    width: 160,
    height: 130,
    rotate: -3,
  },
  {
    id: "double-smile",
    label: "cherry duo",
    src: "/assets/stickers/cherry-duo.png",
    width: 129,
    height: 160,
    rotate: -4,
  },
  {
    id: "sparkle-burst",
    label: "moon sparkle",
    src: "/assets/stickers/moon-sparkle.png",
    width: 95,
    height: 160,
    rotate: 5,
  },
];

export function getStickerDefinition(stickerId: unknown) {
  return STICKER_CATALOG.find((sticker) => sticker.id === stickerId);
}
