import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DEFAULT_SPACE_SLUG, normalSpaceHash } from "../lib/routes";
import "./labs.css";

/**
 * The back room — `#/admin`, linked from nowhere (docs/local/admin-reset.md).
 *
 * Rooms are open, so visitors move things, vote, and clear threads. Each room
 * keeps a baseline: the board the way we want it found. Save it when a room
 * looks right; reset replays it and throws away the rest. Members and the
 * inbox are never touched.
 *
 * The key is checked on the server (ADMIN_KEY) — this page has no secret in
 * it. It remembers a working key in localStorage so a reset between demos is
 * two taps.
 */

const KEY_STORAGE = "ourspaces:admin-key";

function readStoredKey() {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

function ago(at: number) {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type Pending = { slug: string; kind: "reset" | "save" } | null;

export function Admin() {
  const [keyInput, setKeyInput] = useState(readStoredKey);
  const [key, setKey] = useState(readStoredKey);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const ok = useQuery(api.admin.check, key ? { key } : "skip");
  const rooms = useQuery(api.admin.overview, ok === true ? { key } : "skip");
  const resetToBaseline = useMutation(api.admin.resetToBaseline);
  const saveBaseline = useMutation(api.admin.saveBaseline);

  useEffect(() => {
    document.title = "back room · ourspaces";
  }, []);

  useEffect(() => {
    if (ok !== true) return;
    try {
      window.localStorage.setItem(KEY_STORAGE, key);
    } catch {
      /* private mode — the key just won't be remembered */
    }
  }, [ok, key]);

  const run = async (slug: string, kind: "reset" | "save") => {
    setPending(null);
    setBusy(`${kind}:${slug}`);
    setError("");
    setNote("");
    try {
      if (kind === "reset") {
        const out = await resetToBaseline({ key, slug });
        setNote(
          `${slug} is back to ${ago(out.savedAt)}'s board — ${out.restored.widgets} widgets, ${out.restored.messages} messages. Cleared ${out.removed.widgets} widgets and ${out.removed.messages} messages.`,
        );
      } else {
        const out = await saveBaseline({ key, slug });
        setNote(`${slug} baseline saved — ${out.widgets} widgets, ${out.messages} messages (${(out.bytes / 1024).toFixed(1)} KB).`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replace(/^.*Error:\s*/s, "") : String(caught));
    } finally {
      setBusy("");
    }
  };

  if (ok !== true) {
    return (
      <main className="admin-lab is-locked">
        <form
          className="admin-gate"
          onSubmit={(event) => {
            event.preventDefault();
            setKey(keyInput.trim());
          }}
        >
          <span className="admin-kicker">back room</span>
          <h1>Key, please.</h1>
          <input
            type="password"
            value={keyInput}
            autoFocus
            placeholder="admin key"
            onChange={(event) => setKeyInput(event.target.value)}
          />
          <button type="submit">open</button>
          {ok === false ? <p className="admin-gate-no">That key doesn't open anything.</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="admin-lab">
      <header className="admin-head">
        <div>
          <span className="admin-kicker">back room</span>
          <h1>Put a room back.</h1>
          <p>
            Every room keeps a baseline — the board the way we want people to find it.
            <b> Reset</b> throws away what visitors did and replays it. Members, the inbox
            and the room's address are never touched.
          </p>
        </div>
        <a className="admin-out" href={normalSpaceHash(DEFAULT_SPACE_SLUG)}>← back to the app</a>
      </header>

      {note ? <p className="admin-say is-good">{note}</p> : null}
      {error ? <p className="admin-say is-bad">{error}</p> : null}

      <ul className="admin-rooms">
        {(rooms ?? []).map((room) => {
          const confirming = pending && pending.slug === room.slug ? pending : null;
          /* The one thing worth seeing at a glance: has anyone touched it
             since we last froze it. Everything else is detail. */
          const drift = room.baseline
            ? (room.live.widgets - room.baseline.widgets) + (room.live.messages - room.baseline.messages)
            : 0;
          return (
            <li
              key={room.slug}
              className={drift !== 0 ? "is-drifted" : undefined}
              style={{ "--room": room.color } as React.CSSProperties}
            >
              <div className="admin-room-id">
                <b aria-hidden="true">{room.icon}</b>
                <div>
                  <strong>{room.name}</strong>
                  <code>{room.slug}</code>
                </div>
              </div>

              <div className="admin-room-counts">
                <p className="admin-room-board">
                  <span>{room.live.widgets}</span> widgets
                  <i aria-hidden="true" /> <span>{room.live.messages}</span> messages
                  {drift !== 0 ? (
                    <em className="admin-drift">{drift > 0 ? `+${drift}` : drift} since baseline</em>
                  ) : null}
                </p>
                <p className="admin-room-sub">
                  {room.baseline ? `baseline saved ${ago(room.baseline.savedAt)}` : "no baseline yet"}
                  {" · "}
                  {room.live.members} members kept
                </p>
              </div>

              <div className="admin-room-actions">
                <button
                  type="button"
                  className="is-reset"
                  disabled={!room.baseline || busy !== ""}
                  onClick={() => setPending({ slug: room.slug, kind: "reset" })}
                >
                  {busy === `reset:${room.slug}` ? "resetting…" : "reset"}
                </button>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => setPending({ slug: room.slug, kind: "save" })}
                >
                  {busy === `save:${room.slug}` ? "saving…" : room.baseline ? "re-freeze" : "freeze"}
                </button>
                <a href={normalSpaceHash(room.slug)}>open ↗</a>
              </div>

              {confirming ? (
                <div className="admin-confirm">
                  <span>
                    {confirming.kind === "reset"
                      ? `Reset ${room.name}? Everything added since the baseline goes.`
                      : `Freeze ${room.name} as it is right now? The old baseline is overwritten.`}
                  </span>
                  <button type="button" className="is-go" onClick={() => run(room.slug, confirming.kind)}>
                    yes, {confirming.kind === "reset" ? "reset it" : "freeze it"}
                  </button>
                  <button type="button" onClick={() => setPending(null)}>never mind</button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {rooms === undefined ? <p className="admin-say">reading the rooms…</p> : null}
    </main>
  );
}
