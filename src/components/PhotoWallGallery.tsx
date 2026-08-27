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

const FALLBACK_PHOTO = "/assets/the-crew-snapshot.jpg";

function readPhotos(widget: Widget): PhotoMoment[] {
  return Array.isArray(widget.data.photos)
    ? (widget.data.photos as PhotoMoment[])
    : [];
}

export function PhotoWallGallery({
  widget,
  spaceName,
  origin,
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
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightboxBackRef = useRef<HTMLButtonElement>(null);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const photos = readPhotos(widget);
  const title = String(widget.data.title ?? "recent memories");
  const tone = String(widget.data.tone ?? "blush");
  const activePhoto = activeIndex === null ? null : photos[activeIndex];
  const lightboxOpen = activeIndex !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    lightboxBackRef.current?.focus();
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

  const requestClose = () => {
    playSound("tap");
    dialogRef.current?.close();
  };

  const openPhoto = (index: number) => {
    playSound("tap");
    setActiveIndex(index);
  };

  const closePhoto = () => {
    const returnIndex = activeIndex;
    playSound("tap");
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
      onClose={onClose}
      onClick={closeFromBackdrop}
      onCancel={(event) => {
        if (activeIndex === null) return;
        event.preventDefault();
        closePhoto();
      }}
    >
      <div className="photo-gallery-shell">
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
              <div className="photo-lightbox-media">
                <img
                  key={activePhoto.src ?? activePhoto.caption}
                  src={activePhoto.src ?? FALLBACK_PHOTO}
                  alt={activePhoto.caption}
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = FALLBACK_PHOTO;
                  }}
                />
              </div>
              <button
                type="button"
                className="photo-lightbox-nav is-next"
                onClick={() => movePhoto(1)}
                aria-label="Next photo"
              >
                →
              </button>
            </div>

            <footer className="photo-lightbox-caption">
              <strong id="photo-lightbox-title">{activePhoto.caption}</strong>
              <span>
                {activePhoto.by ? `${activePhoto.by} · ` : ""}
                {activePhoto.date}
              </span>
            </footer>
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
                }`}
              >
                {photos.map((photo, index) => (
                  <button
                    ref={(node) => {
                      tileRefs.current[index] = node;
                    }}
                    type="button"
                    key={`${photo.caption}-${index}`}
                    className="photo-gallery-item"
                    style={{ "--photo-index": index } as CSSProperties}
                    onClick={() => openPhoto(index)}
                    aria-label={`Open ${photo.caption}`}
                  >
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
