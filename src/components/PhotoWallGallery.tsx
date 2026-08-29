import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
} from "react";
import type { Widget } from "../data/types";
import { playSound } from "../lib/sounds";

type PhotoMoment = {
  id?: string;
  caption: string;
  date: string;
  rotate?: number;
  by?: string;
  focus?: string;
  src?: string;
  thumbnailSrc?: string;
};

export type PhotoComment = {
  id: string;
  name: string;
  color?: string;
  text: string;
  time?: string;
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

/** Stable per-photo key for comment threads — uploads carry a storage id,
 *  seeded photos fall back to their caption slug. */
export function photoKey(photo: PhotoMoment) {
  return (
    photo.id ?? photo.caption.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  );
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
  comments = {},
  onComment,
  onAddPhoto,
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
  /** Per-photo comment threads, keyed by photoKey(). */
  comments?: Record<string, PhotoComment[]>;
  onComment?: (photoKey: string, text: string) => void;
  onAddPhoto?: (file: File, caption: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightboxBackRef = useRef<HTMLButtonElement>(null);
  const lightboxPrintRef = useRef<HTMLElement>(null);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closingRef = useRef(false);
  /* Lightbox travel bookkeeping: where the print lifted from, and where the
     lifted print was hovering when it gets put back down. */
  const liftRectRef = useRef<DOMRect | null>(null);
  const putBackRectRef = useRef<DOMRect | null>(null);
  const putBackIndexRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [photoDraft, setPhotoDraft] = useState<{
    file: File;
    previewUrl: string;
    caption: string;
  } | null>(null);
  const [pinning, setPinning] = useState(false);
  const photos = readPhotos(widget);
  const title = String(widget.data.title ?? "recent memories");
  const tone = String(widget.data.tone ?? "blush");
  const activePhoto = activeIndex === null ? null : photos[activeIndex];
  const lightboxOpen = activeIndex !== null;
  /* The spread only runs when we know where the pile's prints sit on screen. */
  const [spreading] = useState(
    () => Boolean(printOrigins?.some(Boolean)) && !reduceMotion(),
  );
  const heroKeyRef = useRef<string | null>(photos[0] ? photoKey(photos[0]) : null);

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

  /* A new hero print (someone pinned a photo) pops onto the table. */
  useEffect(() => {
    const nextKey = photos[0] ? photoKey(photos[0]) : null;
    const previousKey = heroKeyRef.current;
    heroKeyRef.current = nextKey;
    if (!nextKey || nextKey === previousKey || lightboxOpen) return;
    if (reduceMotion()) return;
    window.requestAnimationFrame(() => {
      const hero = tileRefs.current[0];
      if (!hero) return;
      hero.animate(
        [
          { transform: "scale(0.55) rotate(-7deg)", opacity: 0 },
          { opacity: 1, offset: 0.4 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 460, easing: POP, fill: "backwards" },
      );
      playSound("place");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos[0] ? photoKey(photos[0]) : null, lightboxOpen]);

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

  /* Fresh photo in the lightbox = photo side up, empty pen. */
  useEffect(() => {
    setFlipped(false);
    setCommentDraft("");
  }, [activeIndex]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === "INPUT") return;
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
    if (photoDraft) URL.revokeObjectURL(photoDraft.previewUrl);
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

  /* While the OS file chooser is up, its dismissal can leak an Esc-like
     `cancel` to the dialog — swallow that one instead of closing the room. */
  const chooserGuardRef = useRef(false);

  const pickFile = () => {
    playSound("tap");
    chooserGuardRef.current = true;
    window.setTimeout(() => {
      chooserGuardRef.current = false;
    }, 60_000);
    fileInputRef.current?.click();
  };

  const startDraft = (file: File | undefined) => {
    chooserGuardRef.current = false;
    if (!file) return;
    if (photoDraft) URL.revokeObjectURL(photoDraft.previewUrl);
    setPhotoDraft({ file, previewUrl: URL.createObjectURL(file), caption: "" });
  };

  const cancelDraft = () => {
    playSound("tap");
    if (photoDraft) URL.revokeObjectURL(photoDraft.previewUrl);
    setPhotoDraft(null);
    setPinning(false);
  };

  const pinDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!photoDraft || !onAddPhoto || pinning) return;
    setPinning(true);
    playSound("tap");
    try {
      await onAddPhoto(photoDraft.file, photoDraft.caption);
      URL.revokeObjectURL(photoDraft.previewUrl);
      setPhotoDraft(null);
    } catch {
      /* leave the draft up so they can retry */
    } finally {
      setPinning(false);
    }
  };

  const sendComment = (event: FormEvent) => {
    event.preventDefault();
    const text = commentDraft.trim();
    if (!text || !onComment || !activePhoto) return;
    playSound("tap");
    onComment(photoKey(activePhoto), text);
    setCommentDraft("");
  };

  const activeComments = activePhoto
    ? comments[photoKey(activePhoto)] ?? []
    : [];

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
        if (chooserGuardRef.current) {
          chooserGuardRef.current = false;
          return;
        }
        if (photoDraft) {
          cancelDraft();
          return;
        }
        if (activeIndex !== null) {
          if (flipped) {
            setFlipped(false);
            return;
          }
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
              <figure
                className={`photo-lightbox-print${flipped ? " is-flipped" : ""}`}
                ref={lightboxPrintRef}
              >
                <div className="photo-lightbox-card3d">
                  <div className="photo-lightbox-face is-front">
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
                      <span className="photo-lightbox-caption-text">
                        <strong id="photo-lightbox-title">{activePhoto.caption}</strong>
                        <span>
                          {activePhoto.by ? `${activePhoto.by} · ` : ""}
                          {activePhoto.date}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="photo-lightbox-flip"
                        onClick={() => {
                          playSound("tap");
                          setFlipped(true);
                        }}
                      >
                        <i aria-hidden="true">✎</i>
                        {activeComments.length > 0
                          ? `${activeComments.length} on the back`
                          : "write on the back"}
                      </button>
                    </figcaption>
                  </div>
                  <div className="photo-lightbox-face is-back" aria-hidden={!flipped}>
                    <header className="photo-back-header">
                      <span>the back of the print</span>
                      <button
                        type="button"
                        className="photo-lightbox-flip"
                        onClick={() => {
                          playSound("tap");
                          setFlipped(false);
                        }}
                        tabIndex={flipped ? 0 : -1}
                      >
                        <i aria-hidden="true">↩</i>
                        photo side
                      </button>
                    </header>
                    <div className="photo-back-notes">
                      {activeComments.length === 0 && (
                        <p className="photo-back-empty">
                          nothing written back here yet — leave the first note.
                        </p>
                      )}
                      {activeComments.map((comment) => (
                        <p className="photo-back-note" key={comment.id}>
                          <b>
                            <i
                              aria-hidden="true"
                              style={{ background: comment.color ?? "#5f5055" }}
                            />
                            {comment.name.toLowerCase()}
                          </b>
                          <span>{comment.text}</span>
                          {comment.time && <small>{comment.time}</small>}
                        </p>
                      ))}
                    </div>
                    {onComment && (
                      <form className="photo-back-pen" onSubmit={sendComment}>
                        <input
                          value={commentDraft}
                          onChange={(event) => setCommentDraft(event.target.value)}
                          placeholder="write on the back…"
                          aria-label="Write a note on the back of this print"
                          tabIndex={flipped ? 0 : -1}
                        />
                        <button type="submit" tabIndex={flipped ? 0 : -1}>
                          →
                        </button>
                      </form>
                    )}
                  </div>
                </div>
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
              <span className="photo-gallery-actions">
                {onAddPhoto && (
                  <button
                    type="button"
                    className="photo-gallery-add-pill"
                    onClick={pickFile}
                  >
                    <i aria-hidden="true">＋</i>
                    pin a moment
                  </button>
                )}
                <span className="photo-gallery-count">
                  {photos.length} {photos.length === 1 ? "moment" : "moments"}
                </span>
              </span>
            </header>

            {photos.length ? (
              <div
                className={`photo-gallery-grid photo-count-${Math.min(photos.length, 5)}${
                  photos.length > 5 ? " has-more" : ""
                }${spreading ? " is-spreading" : ""}`}
              >
                {photos.map((photo, index) => {
                  const noteCount = comments[photoKey(photo)]?.length ?? 0;
                  return (
                    <button
                      ref={(node) => {
                        tileRefs.current[index] = node;
                      }}
                      type="button"
                      key={photoKey(photo)}
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
                        {noteCount > 0 && (
                          <em className="photo-gallery-notes-mark">✎ {noteCount}</em>
                        )}
                        <i aria-hidden="true">↗</i>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="photo-gallery-empty">
                <span aria-hidden="true">✦</span>
                <strong>no moments here yet</strong>
                <p>
                  {onAddPhoto
                    ? "Pin the first one — the wall remembers from there."
                    : "Close the wall and add the first one from the canvas."}
                </p>
                {onAddPhoto && (
                  <button
                    type="button"
                    className="photo-gallery-add-pill"
                    onClick={pickFile}
                  >
                    <i aria-hidden="true">＋</i>
                    pin a moment
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {onAddPhoto && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            startDraft(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      )}

      {photoDraft && (
        <div className="photo-draft-backdrop" onClick={cancelDraft}>
          <form
            className="photo-draft-print"
            onClick={(event) => event.stopPropagation()}
            onSubmit={pinDraft}
          >
            <span className="photo-draft-tape" aria-hidden="true" />
            <span className="photo-draft-frame">
              <img src={photoDraft.previewUrl} alt="New moment preview" />
            </span>
            <div className="photo-draft-chin">
              <input
                value={photoDraft.caption}
                onChange={(event) =>
                  setPhotoDraft((current) =>
                    current ? { ...current, caption: event.target.value } : current,
                  )
                }
                placeholder="name this moment…"
                aria-label="Caption for the new photo"
                maxLength={48}
                autoFocus
                disabled={pinning}
              />
              <div className="photo-draft-actions">
                <button
                  type="button"
                  className="photo-draft-toss"
                  onClick={cancelDraft}
                  disabled={pinning}
                >
                  toss it
                </button>
                <button type="submit" className="photo-draft-pin" disabled={pinning}>
                  {pinning ? "pinning…" : "pin it →"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </dialog>
  );
}
