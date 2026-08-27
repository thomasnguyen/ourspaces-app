import type { CursorStyle } from "./types";
import {
  ClassicArrow,
  ComicBurst,
  FaceFirst,
  FriendPin,
  NameChip,
  NeonOutline,
  PaperCutout,
  QuietMark,
  SignalFlag,
  SoftOrb,
  SplitTag,
  StickerChrome,
  TapeLabel,
} from "./styles";

/**
 * Cursor style catalog — the lab renders every entry.
 *
 * To prototype more styles:
 * 1. Add a Component in styles.tsx that takes CursorProps
 * 2. Push a CursorStyle object here
 * 3. Refresh /#/cursors — it shows up automatically
 */
export const CURSOR_STYLES: CursorStyle[] = [
  {
    id: "classic-arrow",
    name: "Classic arrow",
    description: "Filled tip + face pill. Current canvas look.",
    Component: ClassicArrow,
  },
  {
    id: "signal-flag",
    name: "Signal flag",
    description: "A crisp pennant planted right at the hotspot.",
    Component: SignalFlag,
  },
  {
    id: "friend-pin",
    name: "Friend pin",
    description: "Presence first: face in the room, name on the pin.",
    Component: FriendPin,
  },
  {
    id: "split-tag",
    name: "Split tag",
    description: "Compact two-tone label with a precise pointer.",
    Component: SplitTag,
  },
  {
    id: "sticker-chrome",
    name: "Sticker chrome",
    description: "Fat bordered arrow with face parked on the tip.",
    Component: StickerChrome,
  },
  {
    id: "name-chip",
    name: "Name chip",
    description: "No pointer — the colored chip is the cursor.",
    Component: NameChip,
  },
  {
    id: "face-first",
    name: "Face first",
    description: "Avatar is the hotspot; name trails in color.",
    Component: FaceFirst,
  },
  {
    id: "comic-burst",
    name: "Comic burst",
    description: "Speech-bubble energy. Loud, a little rude.",
    Component: ComicBurst,
  },
  {
    id: "tape-label",
    name: "Tape label",
    description: "Washi / masking-tape strip. Scrapbook material.",
    Component: TapeLabel,
  },
  {
    id: "neon-outline",
    name: "Neon outline",
    description: "Hollow tip, neon stroke, dark label.",
    Component: NeonOutline,
  },
  {
    id: "soft-orb",
    name: "Soft orb",
    description: "Presence blob more than a mouse arrow.",
    Component: SoftOrb,
  },
  {
    id: "paper-cutout",
    name: "Paper cutout",
    description: "Kraft edge, cream fill — cut from the wall.",
    Component: PaperCutout,
  },
  {
    id: "quiet-mark",
    name: "Quiet mark",
    description: "Black tip, name with a color underline.",
    Component: QuietMark,
  },
];

export function getCursorStyle(id: string): CursorStyle | undefined {
  return CURSOR_STYLES.find((style) => style.id === id);
}

/** Default style for the live space canvas. Swap this when a winner emerges. */
export const DEFAULT_CURSOR_STYLE_ID = "classic-arrow";
