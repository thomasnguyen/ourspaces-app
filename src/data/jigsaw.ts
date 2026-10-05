/**
 * MOCK FIXTURES for the jigsaw (`?mock=1`): which photos in a room can be a
 * puzzle, and where the puzzle's mat lies on that room's board. A live room
 * would let you pick any photo widget and place the mat like any new card.
 */

export type JigsawPhoto = {
  key: string;
  /** the photo widget the picture leaves and comes back to */
  widgetId: string;
  src: string;
  caption: string;
};

export type RoomJigsaw = {
  /** the mat's corner on the board */
  mat: { x: number; y: number };
  /** who starts it when the viewer is the invitee */
  starter: string;
  photos: JigsawPhoto[];
};

export const ROOM_JIGSAW: Record<string, RoomJigsaw> = {
  crew: {
    mat: { x: 384, y: 16 },
    starter: "Maya",
    photos: [
      { key: "friday", widgetId: "media", src: "/photos/crew/friday-at-mayas.jpg", caption: "friday at maya's" },
      { key: "tahoe", widgetId: "photo-wall", src: "/photos/crew/tahoe-sunrise.jpg", caption: "tahoe sunrise" },
    ],
  },
};

export const hasJigsaw = (room: string) => Boolean(ROOM_JIGSAW[room]);
