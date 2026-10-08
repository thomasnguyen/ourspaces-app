import { useEffect, useRef, useState } from "react";
import "./web-pic.css";

/* The picture a web row or a read plan card leads with (convex/tavily.ts): the emoji on a soft tile is always
   there, a fixed box, and the place's own photo fades in over it once it loads. No image, or one that fails:
   the emoji stays. `data-pic` says which one is showing. */
export function WebPic({ img, emoji, className = "" }: { img?: string; emoji: string; className?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // a cached image can finish before the listener is on
    const el = ref.current;
    setState(el?.complete ? (el.naturalWidth > 0 ? "loaded" : "failed") : "loading");
  }, [img]);
  const show = !!img && state !== "failed";
  return (
    <span className={`web-pic ${className}`} data-testid="web-pic" data-pic={show && state === "loaded" ? "img" : "emoji"} aria-hidden="true">
      <span className="web-pic-emoji">{emoji}</span>
      {show && (
        <img
          ref={ref}
          src={img}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          className={state === "loaded" ? "is-loaded" : undefined}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      )}
    </span>
  );
}
