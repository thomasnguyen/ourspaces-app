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

type Pending = { slug: string; kind: "reset" | "save" | "all" } | null;

/** The master reset is not a room, so it needs a slug no room can have. */
const EVERY_ROOM = "*";

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
  const resetAll = useMutation(api.admin.resetAll);
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

  const run = async (slug: string, kind: "reset" | "save" | "all") => {
    setPending(null);
    setBusy(`${kind}:${slug}`);
    setError("");
    setNote("");
    try {
      if (kind === "all") {
        const out = await resetAll({ key });
        setNote(
          `Every room is back: ${out.rooms.length} rooms, ${out.rooms.reduce((n, r) => n + r.widgets, 0)} widgets, ${out.rooms.reduce((n, r) => n + r.messages, 0)} messages. Cleared ${out.cleared} things visitors left.${out.skipped.length ? ` Skipped (no baseline): ${out.skipped.join(", ")}.` : ""}`,
        );
      } else if (kind === "reset") {
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

  /* Which rooms no longer match what we froze — the master strip's whole
     reason to exist, and the per-row badge reads off the same sum. */
  const drifted = (rooms ?? []).filter(
    (room) =>
      room.baseline &&
      room.live.widgets - room.baseline.widgets + (room.live.messages - room.baseline.messages) !== 0,
  );

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

      {rooms && rooms.length > 0 ? (
        <section className={drifted.length > 0 ? "admin-master is-drifted" : "admin-master"}>
          <div>
            <strong>Put everything back</strong>
            <p>
              {drifted.length > 0
                ? `${drifted.length} of ${rooms.length} rooms have changed since they were frozen.`
                : `All ${rooms.length} rooms match their baselines right now.`}
            </p>
          </div>
          {pending?.kind === "all" ? (
            <div className="admin-master-confirm">
              <span>Reset all {rooms.length} rooms? Everything visitors did goes.</span>
              <button type="button" className="is-go" onClick={() => run(EVERY_ROOM, "all")}>
                yes, reset everything
              </button>
              <button type="button" onClick={() => setPending(null)}>never mind</button>
            </div>
          ) : (
            <button
              type="button"
              className="admin-master-key"
              disabled={busy !== ""}
              onClick={() => setPending({ slug: EVERY_ROOM, kind: "all" })}
            >
              {busy === `all:${EVERY_ROOM}` ? "resetting every room…" : "reset every room"}
            </button>
          )}
        </section>
      ) : null}

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
