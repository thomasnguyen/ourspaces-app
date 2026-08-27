import type { FrameData } from "../lib/widgets";

type FrameProps = {
  data: FrameData;
};

/**
 * A frame is visual canvas scaffolding: it sits behind the other widgets and
 * deliberately never captures pointer input.
 */
export function Frame({ data }: FrameProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-card border-2 border-dashed border-white/35 bg-black/5"
    >
      <span className="absolute left-4 top-0 -translate-y-1/2 -rotate-2 rounded-pill bg-sticker px-3 py-1.5 text-xs font-extrabold text-white">
        {data.title}
      </span>
    </div>
  );
}

export default Frame;
