import type { CSSProperties } from "react";
import type { NoteData } from "../lib/widgets";

type NoteProps = {
  data: NoteData;
};

const toneClasses: Record<string, string> = {
  crew: "bg-crew text-white",
  warm: "bg-ink text-base",
  white: "bg-ink text-base",
};

export default function Note({ data }: NoteProps) {
  const tone = data.tone ?? "white";
  const isCrew = tone === "crew";
  const isWarm = tone === "warm";
  const promoted = Boolean(data.promoted);
  const author = data.authorName ?? "someone";
  const surface = toneClasses[tone] ?? toneClasses.white;
  const rotation = data.rotation == null ? undefined : `${data.rotation}deg`;
  const style: CSSProperties | undefined = rotation
    ? { transform: `rotate(${rotation})` }
    : undefined;

  if (isCrew) {
    return (
      <article
        className={`relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-card p-5 shadow-[5px_5px_0_var(--color-sticker)] ${promoted ? "note-pop" : ""} ${surface}`}
        style={style}
      >
        <span className="absolute right-4 top-4 -rotate-3 rounded-pill bg-sticker px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-white">
          {promoted ? "saved from chat" : "today"}
        </span>
        <div className="max-w-[22rem] pr-16">
          <p className="font-sans text-[clamp(1.05rem,1rem+0.35vw,1.35rem)] font-extrabold leading-[1.15] tracking-[-0.02em]">
            {data.text}
          </p>
          <span className="mt-3 block text-sm font-semibold opacity-80">— {author}</span>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs font-semibold">
          <span className="opacity-80">answer on the wall →</span>
          <span className="shrink-0 rounded-pill bg-sticker px-3 py-1.5 text-white">note</span>
        </div>
      </article>
    );
  }

  if (isWarm) {
    return (
      <article
        className={`relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-card p-5 shadow-[5px_5px_0_var(--color-sticker)] ${promoted ? "note-pop" : ""} ${surface}`}
        style={style}
      >
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-0 h-5 w-20 -translate-x-1/2 -translate-y-1/3 rotate-2 bg-lime/80"
        />
        <span className="absolute left-4 top-3 text-4xl font-extrabold leading-none text-ink/20">“</span>
        <span className="relative mt-2 pr-8 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">
          {promoted ? "saved from chat" : data.kicker ?? "a thing to remember"}
        </span>
        <p className="relative mt-3 flex-1 font-sans text-[clamp(1.05rem,1rem+0.35vw,1.35rem)] font-extrabold leading-[1.15] tracking-[-0.02em]">
          {data.text}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs font-semibold text-muted">
          <span>— {author}</span>
          <span className="rounded-pill bg-sticker px-3 py-1.5 text-white">remember this</span>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-card p-5 shadow-[5px_5px_0_var(--color-sticker)] ${promoted ? "note-pop" : ""} ${surface}`}
      style={style}
    >
      <div>
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted">
          {promoted ? "saved from chat" : data.kicker ?? "summer maybe?"}
        </span>
        <p className="mt-3 font-sans text-[clamp(1.05rem,1rem+0.35vw,1.35rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink">
          {data.text}
        </p>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>— {author}</span>
        <span className="rounded-pill bg-sticker px-3 py-1.5 text-white">remember this</span>
      </div>
    </article>
  );
}
