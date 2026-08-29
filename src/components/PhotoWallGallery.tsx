import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import type { Widget } from "../data/types";
import { playSound } from "../lib/sounds";

type PhotoMoment = {
  caption: string;
  date: string;
  rotate?: number;
  by?: string;
  focus?: string;
  src?: string;
  thumbnailSrc?: string;
};

type PrintOrigin = { x: number; y: number; w: number; h: number };

const FALLBACK_PHOTO = "/assets/the-crew-snapshot.jpg";

const GLIDE = "cubic-bezier(0.16, 1, 0.3, 1)";
const POP = "cubic-bezier(0.2, 0.9, 0.3, 1.18)";

/* Table scatter: each print's resting tilt + jitter in the spread room.
   The hero (index 0) tilts least — big prints swing corners far. */
const SCATTER_TILT = [-1.2, 2.1, -1.6, 1.8, -2.2, 1.4, -1.8, 2.3];
const SCATTER_JOG = [
  [2, -2],
  [-3, 2],
  [3, 2],
  [-2, -3],
  [2, 3],
  [-3, -1],
  [1, 3],
  [-2, 2],
];

function readPhotos(widget: Widget): PhotoMoment[] {
  return Array.isArray(widget.data.photos)
    ? (widget.data.photos as PhotoMoment[])
    : [];
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function centerOf(rect: { x: number; y: number; w: number; h: number }) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function PhotoWallGallery({
  widget,
  spaceName,
  origin,
  printOrigins,
  onClose,
}: {
  widget: Widget;
  spaceName: string;
  origin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  printOrigins?: Array<PrintOrigin | null>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightboxBackRef = useRef<HTMLButtonElement>(null);
  const lightboxPrintRef = useRef<HTMLElement>(null);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closingRef = useRef(false);
  /* Lightbox travel bookkeeping: where the print lifted from, and where the
     lifted print was hovering when it gets put back down. */
  const liftRectRef = useRef<DOMRect | null>(null);
  const putBackRectRef = useRef<DOMRect | null>(null);
  const putBackIndexRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const photos = readPhotos(widget);
  const title = String(widget.data.title ?? "recent memories");
  const tone = String(widget.data.tone ?? "blush");
  const activePhoto = activeIndex === null ? null : photos[activeIndex];
  const lightboxOpen = activeIndex !== null;
  /* The spread only runs when we know where the pile's prints sit on screen. */
  const [spreading] = useState(
    () => Boolean(printOrigins?.some(Boolean)) && !reduceMotion(),
  );

  const pileCenter = () => {
    if (!origin) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    return {
      x: origin.left + (window.innerWidth - origin.right - origin.left) / 2,
      y: origin.top + (window.innerHeight - origin.bottom - origin.top) / 2,
    };
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  /* The spread: the pile's visible prints fly to their table spots; the ones
     buried underneath deal out from the pile's center, staggered. */
  useEffect(() => {
    if (!spreading) return;
    const pile = pileCenter();
    let dealt = 0;
    tileRefs.current.forEach((tile, index) => {
      if (!tile) return;
      const finalRect = tile.getBoundingClientRect();
      const finalCenter = {
        x: finalRect.x + finalRect.width / 2,
        y: finalRect.y + finalRect.height / 2,
      };
      const scatter = SCATTER_TILT[index % SCATTER_TILT.length];
      const from = printOrigins?.[index];
      if (from) {
        const pileTilt =
          index === 0
            ? 0
            : Math.max(-4, Math.min(4, photos[index]?.rotate ?? 0));
        tile.animate(
          [
            {
              transform: `translate(${centerOf(from).x - finalCenter.x}px, ${
                centerOf(from).y - finalCenter.y
              }px) scale(${from.w / finalRect.width}, ${
                from.h / finalRect.height
              }) rotate(${pileTilt - scatter}deg)`,
            },
            { transform: "none" },
          ],
          {
            duration: 520,
            easing: GLIDE,
            delay: 30 + index * 60,
            fill: "backwards",
          },
        );
      } else {
        dealt += 1;
        tile.animate(
          [
            {
              transform: `translate(${pile.x - finalCenter.x}px, ${
                pile.y - finalCenter.y
              }px) scale(0.2) rotate(${(index % 2 ? -12 : 9) - scatter}deg)`,
              opacity: 0,
            },
            { opacity: 1, offset: 0.4 },
            { transform: "none", opacity: 1 },
          ],
          {
            duration: 560,
            easing: POP,
            delay: 210 + dealt * 70,
            fill: "backwards",
          },
        );
      }
    });
    const landing = window.setTimeout(() => playSound("place"), 520);
    return () => window.clearTimeout(landing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Picking a print up: it flies from its table spot into the lightbox. */
  useEffect(() => {
    if (!lightboxOpen) return;
    lightboxBackRef.current?.focus();
    const lift = liftRectRef.current;
    liftRectRef.current = null;
    const print = lightboxPrintRef.current;
    if (!lift || !print || reduceMotion() || activeIndex === null) return;
    const finalRect = print.getBoundingClientRect();
    const scatter = SCATTER_TILT[activeIndex % SCATTER_TILT.length];
    print.animate(
      [
        {
          transform: `translate(${lift.x + lift.width / 2 - (finalRect.x + finalRect.width / 2)}px, ${
            lift.y + lift.height / 2 - (finalRect.y + finalRect.height / 2)
          }px) scale(${lift.width / finalRect.width}, ${
            lift.height / finalRect.height
          }) rotate(${scatter}deg)`,
        },
        { transform: "none" },
      ],
      { duration: 380, easing: GLIDE, fill: "backwards" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen]);

  /* Putting it back: the lifted print flies down into its table spot. */
  useEffect(() => {
    if (lightboxOpen) return;
    const fromRect = putBackRectRef.current;
    const index = putBackIndexRef.current;
    putBackRectRef.current = null;
    putBackIndexRef.current = null;
    if (!fromRect || index === null || reduceMotion()) return;
    window.requestAnimationFrame(() => {
      const tile = tileRefs.current[index];
      if (!tile) return;
      const finalRect = tile.getBoundingClientRect();
      const scatter = SCATTER_TILT[index % SCATTER_TILT.length];
      tile.animate(
        [
          {
            transform: `translate(${fromRect.x + fromRect.width / 2 - (finalRect.x + finalRect.width / 2)}px, ${
              fromRect.y + fromRect.height / 2 - (finalRect.y + finalRect.height / 2)
            }px) scale(${fromRect.width / finalRect.width}, ${
              fromRect.height / finalRect.height
            }) rotate(${-scatter}deg)`,
          },
          { transform: "none" },
        ],
        { duration: 320, easing: GLIDE, fill: "backwards" },
      );
    });
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((current) =>
          current === null ? null : (current - 1 + photos.length) % photos.length,
        );
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((current) =>
          current === null ? null : (current + 1) % photos.length,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, photos.length]);

  /* Close = gather: the spread prints fly back into the pile while the room
     clips back down to the tile. Exits glide — no overshoot on the way out. */
  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    playSound("tap");
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (reduceMotion() || lightboxOpen) {
      dialog.close();
      return;
    }
    dialog.classList.add("is-closing");
    const pile = pileCenter();
    tileRefs.current.forEach((tile, index) => {
      if (!tile) return;
      const rect = tile.getBoundingClientRect();
      tile.animate(
        [
          { transform: "none", opacity: 1 },
          {
            transform: `translate(${pile.x - (rect.x + rect.width / 2)}px, ${
              pile.y - (rect.y + rect.height / 2)
            }px) scale(0.12) rotate(${index % 2 ? 7 : -6}deg)`,
            opacity: 0.85,
          },
        ],
        {
          duration: 290,
          easing: GLIDE,
          delay: Math.min(index, 5) * 20,
          fill: "forwards",
        },
      );
    });
    window.setTimeout(() => dialog.close(), 380);
  };

  const openPhoto = (index: number) => {
    playSound("tap");
    liftRectRef.current =
      tileRefs.current[index]?.getBoundingClientRect() ?? null;
    setActiveIndex(index);
  };

  const closePhoto = () => {
    const returnIndex = activeIndex;
    playSound("tap");
    putBackRectRef.current =
      lightboxPrintRef.current?.getBoundingClientRect() ?? null;
    putBackIndexRef.current = returnIndex;
    setActiveIndex(null);
    window.requestAnimationFrame(() => {
      if (returnIndex !== null) tileRefs.current[returnIndex]?.focus();
    });
  };

  const movePhoto = (direction: -1 | 1) => {
    playSound("tap");
    setActiveIndex((current) =>
      current === null ? null : (current + direction + photos.length) % photos.length,
    );
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) requestClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`photo-gallery-dialog photo-wall-tone-${tone}`}
      style={
        origin
          ? ({
              "--photo-gallery-origin-top": `${origin.top}px`,
              "--photo-gallery-origin-right": `${origin.right}px`,
              "--photo-gallery-origin-bottom": `${origin.bottom}px`,
              "--photo-gallery-origin-left": `${origin.left}px`,
            } as CSSProperties)
          : undefined
      }
      aria-labelledby={activePhoto ? "photo-lightbox-title" : "photo-gallery-title"}
      onClose={() => {
        /* StrictMode's simulated unmount close()s the dialog, but the close
           event lands after the remount reopens it — ignore that phantom. */
        if (dialogRef.current?.open) return;
        onClose();
      }}
      onClick={closeFromBackdrop}
      onCancel={(event) => {
        event.preventDefault();
        if (activeIndex !== null) {
          closePhoto();
          return;
        }
        requestClose();
      }}
    >
      <div className={`photo-gallery-shell${spreading ? " is-spreading" : ""}`}>
        {activePhoto && activeIndex !== null ? (
          <section className="photo-lightbox" aria-label={`Viewing ${activePhoto.caption}`}>
            <header className="photo-lightbox-header">
              <button
                ref={lightboxBackRef}
                type="button"
                className="photo-gallery-back"
                onClick={closePhoto}
              >
                <span aria-hidden="true">←</span>
                all moments
              </button>
              <span className="photo-lightbox-position" aria-live="polite">
                {activeIndex + 1} / {photos.length}
              </span>
              <button
                type="button"
                className="photo-gallery-close"
                onClick={requestClose}
                aria-label="Close memory wall"
              >
                ×
              </button>
            </header>

            <div className="photo-lightbox-stage">
              <button
                type="button"
                className="photo-lightbox-nav is-previous"
                onClick={() => movePhoto(-1)}
                aria-label="Previous photo"
              >
                ←
              </button>
              <figure className="photo-lightbox-print" ref={lightboxPrintRef}>
                <span className="photo-lightbox-frame">
                  <img
                    key={activePhoto.src ?? activePhoto.caption}
                    src={activePhoto.src ?? FALLBACK_PHOTO}
                    alt={activePhoto.caption}
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = FALLBACK_PHOTO;
                    }}
                  />
                </span>
                <figcaption className="photo-lightbox-caption">
                  <strong id="photo-lightbox-title">{activePhoto.caption}</strong>
                  <span>
                    {activePhoto.by ? `${activePhoto.by} · ` : ""}
                    {activePhoto.date}
                  </span>
                </figcaption>
              </figure>
              <button
                type="button"
                className="photo-lightbox-nav is-next"
                onClick={() => movePhoto(1)}
                aria-label="Next photo"
              >
                →
              </button>
            </div>
          </section>
        ) : (
          <section className="photo-gallery-overview">
            <header className="photo-gallery-header">
              <button
                type="button"
                className="photo-gallery-back"
                onClick={requestClose}
                aria-label={`Back to ${spaceName}`}
              >
                <span aria-hidden="true">←</span>
                {spaceName}
              </button>
              <div className="photo-gallery-heading">
                <span className="photo-gallery-kicker">
                  <i aria-hidden="true" />
                  memory wall
                </span>
                <h2 id="photo-gallery-title">{title}</h2>
              </div>
              <span className="photo-gallery-count">
                {photos.length} {photos.length === 1 ? "moment" : "moments"}
              </span>
            </header>

            {photos.length ? (
              <div
                className={`photo-gallery-grid photo-count-${Math.min(photos.length, 5)}${
                  photos.length > 5 ? " has-more" : ""
                }${spreading ? " is-spreading" : ""}`}
              >
                {photos.map((photo, index) => (
                  <button
                    ref={(node) => {
                      tileRefs.current[index] = node;
                    }}
                    type="button"
                    key={`${photo.caption}-${index}`}
                    className="photo-gallery-item"
                    style={
                      {
                        "--photo-index": index,
                        "--scatter": `${SCATTER_TILT[index % SCATTER_TILT.length]}deg`,
                        "--jog-x": `${SCATTER_JOG[index % SCATTER_JOG.length][0]}px`,
                        "--jog-y": `${SCATTER_JOG[index % SCATTER_JOG.length][1]}px`,
                      } as CSSProperties
                    }
                    onClick={() => openPhoto(index)}
                    aria-label={`Open ${photo.caption}`}
                  >
                    {index === 0 && (
                      <span className="photo-gallery-item-tape" aria-hidden="true" />
                    )}
                    <span className="photo-gallery-media">
                      <img
                        src={photo.src ?? FALLBACK_PHOTO}
                        alt=""
                        loading={index > 4 ? "lazy" : undefined}
                        style={{ objectPosition: photo.focus ?? "center" }}
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = FALLBACK_PHOTO;
                        }}
                      />
                    </span>
                    <span className="photo-gallery-item-caption">
                      <span>
                        <strong>{photo.caption}</strong>
                        <small>
                          {photo.by ? `${photo.by} · ` : ""}
                          {photo.date}
                        </small>
                      </span>
                      <i aria-hidden="true">↗</i>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="photo-gallery-empty">
                <span aria-hidden="true">✦</span>
                <strong>no moments here yet</strong>
                <p>Close the wall and add the first one from the canvas.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </dialog>
  );
}
