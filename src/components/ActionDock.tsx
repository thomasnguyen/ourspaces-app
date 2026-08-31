import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { MemberFace } from "./MemberFace";
import {
  RECAP_LINES,
  RECAP_LINE_MS,
  RECAP_SINCE,
  RECAP_STREAM_CHARS,
  RECAP_STREAM_MS,
  RECAP_THINKING_MS,
  type RecapLine,
  type RecapTurn,
} from "../data/recap";
import {
  getRadioSnapshot,
  stationById,
  stopRadio,
  subscribeRadio,
} from "../lib/radio";

/** The radio lives in a widget that scrolls off canvas — the dock keeps it in view. */
function DockNowPlaying() {
  const radio = useSyncExternalStore(subscribeRadio, getRadioSnapshot, getRadioSnapshot);
  const on = Boolean(radio.stationId && !radio.error && (radio.playing || radio.waiting));
  if (!on) return null;

  const station = stationById(radio.stationId ?? undefined);
  const track = radio.stationId ? radio.tracks[radio.stationId] : undefined;
  const label = radio.waiting
    ? "tuning…"
    : track
      ? `${track.title} — ${track.artist}`
      : station.name;

  return (
    <>
      <span className="action-dock-divider" aria-hidden="true" />
      <button
        type="button"
        className={`action-dock-radio${radio.waiting ? " is-tuning" : ""}`}
        onClick={stopRadio}
        title={`${label} · ${station.name} — click to stop`}
        aria-label={`Now playing ${label} on ${station.name}. Click to stop.`}
      >
        <span className="action-dock-radio-eq" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="action-dock-radio-track">{label}</span>
      </button>
    </>
  );
}

export function ActionDock({
  recapOpen,
  recapRunId,
  onRecapReveal,
  onRecapClose,
  onRecapHover,
  onRecapJump,
  chatOpen,
  messageCount,
  soundEnabled,
  onRecapToggle,
  onChatToggle,
  onSoundToggle,
  nav,
  recapLines = RECAP_LINES,
  recapSince = RECAP_SINCE,
  recapTurns = [],
  recapLoading = false,
  recapAsking = false,
  recapCached = true,
  recapTurnsReady = true,
  onRecapRefresh,
  onRecapAsk,
}: {
  recapOpen: boolean;
  recapRunId: number;
  onRecapReveal: (count: number) => void;
  onRecapClose: () => void;
  onRecapHover: (widgetId: string | null) => void;
  onRecapJump: (messageId: string) => void;
  chatOpen: boolean;
  messageCount: number;
  soundEnabled: boolean;
  onRecapToggle: () => void;
  onChatToggle: () => void;
  onSoundToggle: () => void;
  nav?: ReactNode;
  recapLines?: RecapLine[];
  recapSince?: string;
  recapTurns?: RecapTurn[];
  recapLoading?: boolean;
  recapAsking?: boolean;
  recapCached?: boolean;
  recapTurnsReady?: boolean;
  onRecapRefresh?: () => void;
  onRecapAsk?: (text: string) => void;
}) {
  const [revealed, setRevealed] = useState(0);
  const [draft, setDraft] = useState("");
  const [turnsReady, setTurnsReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [stream, setStream] = useState<{ id: string; at: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const settledTurns = useRef<Set<string>>(new Set());

  // FLIP the resize: measure, swap the class synchronously, animate the delta
  // from the panel's anchored corner so it grows instead of snapping.
  const toggleExpanded = () => {
    const panel = panelRef.current;
    const first = panel?.getBoundingClientRect();
    flushSync(() => setExpanded((value) => !value));
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
    const last = panel?.getBoundingClientRect();
    if (!panel || !first || !last) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sx = first.width / last.width;
    const sy = first.height / last.height;
    if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
    panel.animate(
      [
        { transform: `scale(${sx}, ${sy})`, transformOrigin: "0 100%" },
        { transform: "scale(1, 1)", transformOrigin: "0 100%" },
      ],
      { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  };

  const recapKey = recapLines.map((line) => line.text).join("\n");

  // Lines land one at a time, and each one lights its widget as it arrives.
  // Cached opens skip the thinking wait — that wait is only for a live ↻.
  useEffect(() => {
    if (!recapOpen || recapLoading) {
      setRevealed(0);
      return;
    }
    setRevealed(0);

    const delay = recapCached ? 0 : RECAP_THINKING_MS;
    const timers = recapLines.map((_, index) =>
      window.setTimeout(
        () => {
          setRevealed(index + 1);
          onRecapReveal(index + 1);
        },
        delay + index * RECAP_LINE_MS,
      ),
    );

    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapOpen, recapRunId, recapKey, recapLoading, recapCached]);

  useEffect(() => {
    if (!recapOpen) {
      settledTurns.current.clear();
      setTurnsReady(false);
      setStream(null);
      return;
    }
    if (!recapTurnsReady || turnsReady) return;
    recapTurns.forEach((turn) => settledTurns.current.add(turn.id));
    setTurnsReady(true);
  }, [recapOpen, recapTurns, recapTurnsReady, turnsReady]);

  const incoming = turnsReady
    ? recapTurns.find((turn) => turn.isRecap && !settledTurns.current.has(turn.id))
    : undefined;

  useEffect(() => {
    if (!recapOpen || !incoming) return;
    const full = incoming.text;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !full) {
      settledTurns.current.add(incoming.id);
      setStream(null);
      return;
    }

    let at = 0;
    let timer = 0;
    setStream({ id: incoming.id, at: 0 });
    const tick = () => {
      at = Math.min(full.length, at + RECAP_STREAM_CHARS);
      setStream({ id: incoming.id, at });
      if (at >= full.length) {
        settledTurns.current.add(incoming.id);
        setStream(null);
        return;
      }
      timer = window.setTimeout(tick, RECAP_STREAM_MS);
    };
    timer = window.setTimeout(tick, RECAP_STREAM_MS);
    return () => window.clearTimeout(timer);
  }, [incoming?.id, incoming?.text, recapOpen]);

  // The scrollable box is .recap-body (the ul never overflows on its own),
  // so that's what stays pinned to the newest turn.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || recapTurns.length === 0) return;
    body.scrollTo({ top: body.scrollHeight, behavior: stream ? "auto" : "smooth" });
  }, [recapTurns.length, recapAsking, stream?.at]);

  const streaming = stream !== null || Boolean(incoming);
  const showLooking = recapAsking && !incoming;

  const ask = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || recapAsking || recapLoading || streaming) return;
    onRecapAsk?.(text);
    setDraft("");
  };

  const thinking = recapLoading;

  return (
    <nav className="action-dock" aria-label="Space actions">
      {recapOpen && (
        <div
          className={`recap-panel${expanded ? " is-expanded" : ""}`}
          role="status"
          aria-live="polite"
          ref={panelRef}
        >
          <div className="recap-panel-head">
            <span className="recap-head-id">
              <span className="recap-badge" aria-hidden="true">
                ✦
              </span>
              <span className="recap-since">{recapSince}</span>
            </span>
            <span className="recap-panel-actions">
              <button
                type="button"
                className={`recap-expand${expanded ? " is-active" : ""}`}
                onClick={toggleExpanded}
                aria-label={expanded ? "Shrink chat" : "Expand chat"}
                title={expanded ? "shrink" : "expand"}
              >
                {expanded ? "⤡" : "⤢"}
              </button>
              {onRecapRefresh && (
                <button
                  type="button"
                  className={`recap-refresh${recapLoading ? " is-busy" : ""}`}
                  onClick={onRecapRefresh}
                  disabled={recapLoading}
                  aria-label="Refresh recap"
                >
                  ↻
                </button>
              )}
              <button
                type="button"
                className="recap-panel-close"
                onClick={onRecapClose}
                aria-label="Close"
              >
                ×
              </button>
            </span>
          </div>

          <div className="recap-body" ref={bodyRef}>
            {thinking ? (
              <div className="recap-thinking">
                <span />
                <span />
                <span />
              </div>
            ) : recapLines.length === 0 ? (
              <p className="recap-empty">
                {recapCached
                  ? "nothing moved — the board looks like you left it"
                  : "no briefing yet — tap ↻ to make one"}
              </p>
            ) : (
              <ul className="recap-list" onMouseLeave={() => onRecapHover(null)}>
                <li className="recap-kicker" aria-hidden="true">
                  what moved
                </li>
                {recapLines.slice(0, revealed).map((line) => (
                  <li
                    key={line.text}
                    className={line.messageId ? "is-unrescued" : ""}
                    onMouseEnter={() => onRecapHover(line.widgetId ?? null)}
                  >
                    <span className="recap-dot" aria-hidden="true" />
                    {line.messageId ? (
                      <button
                        type="button"
                        className="recap-jump"
                        onClick={() => onRecapJump(line.messageId!)}
                      >
                        {line.text}
                        <span className="recap-jump-hint">go find it →</span>
                      </button>
                    ) : (
                      <p>{line.text}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!thinking && (recapTurns.length > 0 || showLooking) && (
              <ul className="recap-thread">
                {recapTurns.map((turn) => {
                  const at = stream?.id === turn.id ? stream.at : null;
                  const text = at === null
                    ? turn.isRecap && incoming?.id === turn.id
                      ? ""
                      : turn.text
                    : turn.text.slice(0, at);
                  const live = at !== null || incoming?.id === turn.id;
                  return (
                    <li
                      key={turn.id}
                      className={`${turn.isRecap ? "is-recap" : "is-you"}${live ? " is-live" : ""}`}
                      style={turn.fromColor ? { "--recap-face": turn.fromColor } as never : undefined}
                    >
                      {turn.isRecap ? (
                        <span className="recap-spark" aria-hidden="true">✦</span>
                      ) : (
                        <b>
                          <MemberFace
                            name={turn.from}
                            emoji={turn.fromEmoji}
                            color={turn.fromColor}
                            avatarUrl={turn.fromAvatarUrl}
                            size="xs"
                          />
                          {turn.from.toLowerCase()}
                        </b>
                      )}
                      <p>
                        {text}
                        {live && <span className="recap-caret" aria-hidden="true" />}
                      </p>
                    </li>
                  );
                })}
                {showLooking && (
                  <li className="is-recap is-thinking">
                    <span className="recap-spark" aria-hidden="true">✦</span>
                    <p className="recap-typing">
                      <span />
                      <span />
                      <span />
                    </p>
                  </li>
                )}
              </ul>
            )}
          </div>

          {onRecapAsk && (
            <form className="recap-composer" onSubmit={ask}>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="ask about the board"
                disabled={recapLoading || recapAsking || streaming}
                maxLength={240}
                autoFocus
              />
              <button type="submit" disabled={!draft.trim() || recapLoading || recapAsking || streaming}>
                →
              </button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        className={`action-dock-ai ${recapOpen ? "is-active" : ""}`}
        onClick={onRecapToggle}
        aria-expanded={recapOpen}
      >
        <span aria-hidden="true">✦</span>
        catch me up
      </button>
      <span className="action-dock-divider" aria-hidden="true" />
      <button
        type="button"
        className={`action-dock-chat ${chatOpen ? "is-active" : ""}`}
        onClick={onChatToggle}
        aria-pressed={chatOpen}
      >
        <span aria-hidden="true">●</span>
        chat
        <span className="action-dock-count">{messageCount}</span>
      </button>
      {nav && (
        <>
          <span className="action-dock-divider" aria-hidden="true" />
          <div className="action-dock-nav">{nav}</div>
        </>
      )}
      <DockNowPlaying />
      <span className="action-dock-divider" aria-hidden="true" />
      <button
        type="button"
        className={`action-dock-sound ${soundEnabled ? "" : "is-muted"}`}
        onClick={onSoundToggle}
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? "Mute interface sounds" : "Turn on interface sounds"}
        title={soundEnabled ? "Mute sounds" : "Turn on sounds"}
      >
        <span aria-hidden="true">♪</span>
      </button>
    </nav>
  );
}
