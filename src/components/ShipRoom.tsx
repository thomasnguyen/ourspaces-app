import { useRef, useState } from "react";
import type { Widget } from "../data/types";
import { playSound } from "../lib/sounds";
import { CanvasRoom, type RoomOrigin } from "./CanvasRoom";
import { MemberFace } from "./MemberFace";
import type { RoomReply } from "./ReadingRoom";

/** Free text with bare URLs turned into links — no markdown, just the useful bit. */
function Body({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>
          {paragraph.split(/(https?:\/\/[^\s)]+)/g).map((chunk, chunkIndex) =>
            /^https?:\/\//.test(chunk) ? (
              <a key={chunkIndex} href={chunk} target="_blank" rel="noreferrer">
                {chunk.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            ) : (
              chunk
            ),
          )}
        </p>
      ))}
    </>
  );
}

export function ShipRoom({
  widget,
  replies,
  origin,
  onReply,
  onAddImage,
  onClose,
}: {
  widget: Widget;
  replies: RoomReply[];
  origin?: RoomOrigin;
  onReply?: (text: string) => void;
  onAddImage?: (file: File) => Promise<void> | void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const title = String(widget.data.title ?? "untitled ship");
  const by = String(widget.data.by ?? "someone");
  const date = String(widget.data.date ?? "");
  const imageUrl = String(widget.data.imageUrl ?? "");
  const body = String(widget.data.body ?? "");
  const projectUrl = String(widget.data.projectUrl ?? "");
  const feedbackWanted = Boolean(widget.data.feedbackWanted);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    playSound("place");
    onReply?.(text);
    setDraft("");
  };

  return (
    <CanvasRoom
      className="ship-room"
      origin={origin}
      label="back to the build room"
      onClose={onClose}
    >
      <div className="ship-room-body">
        <section className="sr-shot" aria-label={title}>
          {imageUrl ? (
            <img src={imageUrl} alt="" draggable={false} />
          ) : (
            <button
              type="button"
              className="sr-shot-empty"
              onClick={() => fileRef.current?.click()}
            >
              <span aria-hidden="true">+</span>
              add a screenshot
            </button>
          )}
          {feedbackWanted && <span className="sr-flag">feedback wanted</span>}
          {onAddImage && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setUploading(true);
                  try {
                    await onAddImage(file);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <button
                type="button"
                className="sr-replace"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "uploading…" : imageUrl ? "replace image" : "add image"}
              </button>
            </>
          )}
        </section>

        <aside className="sr-detail">
          <header className="sr-head">
            <h2>{title}</h2>
            <span>
              by {by}
              {date ? ` · ${date}` : ""}
            </span>
            {projectUrl && (
              <a href={projectUrl} target="_blank" rel="noreferrer">
                open it ↗
              </a>
            )}
          </header>

          <div className="sr-copy">
            {body ? <Body text={body} /> : <p className="sr-copy-empty">no write-up yet.</p>}
          </div>

          <ul className="sr-replies">
            {replies.map((reply) => (
              <li key={reply.id}>
                <MemberFace
                  name={reply.from}
                  color={reply.color}
                  avatarUrl={reply.avatarUrl}
                  size="sm"
                />
                <div>
                  <span className="sr-reply-who">
                    {reply.from.toLowerCase()}
                    {reply.time ? <em>{reply.time}</em> : null}
                  </span>
                  <p>{reply.text}</p>
                </div>
              </li>
            ))}
            {replies.length === 0 && (
              <li className="sr-replies-empty">
                <p>no feedback yet. go first.</p>
              </li>
            )}
          </ul>

          <form
            className="sr-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="give feedback…"
            />
            <button type="submit">send</button>
          </form>
        </aside>
      </div>
    </CanvasRoom>
  );
}
