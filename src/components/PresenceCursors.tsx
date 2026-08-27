import type { CSSProperties } from "react";

export type PresenceCursor = {
  _id: string;
  userId: string;
  x: number;
  y: number;
  name: string;
  color: string;
};

type PresenceCursorsProps = {
  cursors: PresenceCursor[];
  meId: string;
};

/** Paints remote pointers in the canvas coordinate space.
 *
 * The wrapper is intentionally pointer-events-none so remote presence never
 * steals a gesture from the canvas underneath it.
 */
export function PresenceCursors({
  cursors,
  meId,
}: PresenceCursorsProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {cursors
        .filter((cursor) => cursor.userId !== meId)
        .map((cursor) => (
          <div
            key={cursor._id}
            className="absolute left-0 top-0 flex items-start gap-1.5 transition-transform duration-150 ease-out"
            style={{
              transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
              ["--cursor-color" as string]: cursor.color,
            } as CSSProperties}
          >
            <svg
              className="mt-px shrink-0 text-[var(--cursor-color)] drop-shadow-[1px_1px_0_var(--color-sticker)]"
              width="18"
              height="22"
              viewBox="0 0 18 22"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 1L16 10.5L9.2 12.2L6.5 20L1 1Z"
                fill="currentColor"
                stroke="var(--color-sticker)"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span className="max-w-40 truncate rounded-pill bg-sticker px-2.5 py-1 text-[10px] font-extrabold leading-none text-white shadow-[2px_2px_0_var(--color-base)]">
              {cursor.name}
            </span>
          </div>
        ))}
    </div>
  );
}
