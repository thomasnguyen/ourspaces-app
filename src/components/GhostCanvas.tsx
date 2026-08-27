import type { CSSProperties } from "react";
import { getSpace } from "../data/spaces";
import { wavefrontDelays } from "../lib/entrance";

type GhostPhase = "in" | "leaving";

type GhostStyle = CSSProperties & Record<`--${string}`, string>;

export function GhostCanvas({ spaceId, phase }: { spaceId: string; phase: GhostPhase }) {
  const widgets = getSpace(spaceId).widgets
    .filter((widget) => widget.type !== "sticker")
    .slice(0, 8);
  const delays = wavefrontDelays(widgets);

  return (
    <div className={`ghost-canvas ${phase === "leaving" ? "is-leaving" : ""}`} aria-hidden="true">
      {widgets.map((widget, index) => {
        const isFrame = widget.type === "frame";
        const enterDelay = delays[widget.id] ?? 0;
        const style: GhostStyle = {
          left: widget.x,
          top: widget.y,
          width: widget.w,
          height: widget.h,
          "--enter-delay": `${enterDelay}ms`,
          "--exit-delay": `${enterDelay / 4}ms`,
          "--float-delay": `${index * 120}ms`,
          "--ghost-tilt": `${widget.rotate ?? 0}deg`,
        };

        return (
          <div
            key={widget.id}
            className={`ghost-widget ${isFrame ? "ghost-widget-frame" : ""}`}
            style={style}
          >
            <div className="ghost-widget-body">
              {!isFrame && (
                <>
                  <span className="ghost-widget-title" />
                  <span className="ghost-widget-line" />
                  <span className="ghost-widget-line ghost-widget-line-short" />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
