import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  RECAP_LINES,
  RECAP_LINE_MS,
  RECAP_SINCE,
  RECAP_THINKING_MS,
  type RecapLine,
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
}) {
  const [revealed, setRevealed] = useState(0);

  // Lines land one at a time, and each one lights its widget as it arrives.
  useEffect(() => {
    if (!recapOpen) return;
    setRevealed(0);

    const timers = recapLines.map((_, index) =>
      window.setTimeout(
        () => {
          setRevealed(index + 1);
          onRecapReveal(index + 1);
        },
        RECAP_THINKING_MS + index * RECAP_LINE_MS,
      ),
    );

    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapOpen, recapRunId, recapLines]);

  return (
    <nav className="action-dock" aria-label="Space actions">
      {recapOpen && (
        <div className="recap-panel" role="status" aria-live="polite">
          <div className="recap-panel-head">
            <span className="recap-since">{RECAP_SINCE}</span>
            <button
              type="button"
              className="recap-panel-close"
              onClick={onRecapClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {revealed === 0 ? (
            <div className="recap-thinking">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <ul className="recap-list" onMouseLeave={() => onRecapHover(null)}>
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
