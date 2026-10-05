import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { VoiceLanded, VoiceReceipt, VoiceShell } from "../live/useVoiceBuild";

/**
 * What a voice ask looks like while it builds (src/live/useVoiceBuild.ts):
 * the shell where the card will land, a tag on the card that landed, and the
 * receipt above the dock. Typographic on purpose; a design pass follows.
 */
export function VoiceBuildLayer({
  shell,
  landed,
  receipt,
  color,
  by,
  model,
}: {
  shell: VoiceShell | null;
  landed: VoiceLanded | null;
  receipt: VoiceReceipt | null;
  /** The maker's colour. */
  color: string;
  by: string;
  /** Who is dealing, shown on the shell; null in mock (no model runs). */
  model: string | null;
}) {
  const tint = { "--maker": color } as CSSProperties;
  return (
    <>
      {shell &&
        createPortal(
          <div
            className="voice-shell"
            data-testid="voice-shell"
            style={{ ...tint, left: shell.x, top: shell.y, width: shell.w, height: shell.h }}
            aria-live="polite"
          >
            <span className="voice-shell-kicker">{model ? `${model} · dealing` : "dealing"}</span>
            <q className="voice-shell-said">{shell.said}</q>
          </div>,
          shell.host,
        )}
      {landed &&
        createPortal(
          <span
            className="voice-landed"
            data-testid="voice-landed"
            data-widget-ref={landed.widgetId}
            style={{ ...tint, left: landed.x, top: landed.y }}
          >
            {by} said it
          </span>,
          landed.host,
        )}
      {receipt && (
        <p
          key={receipt.key}
          className={`voice-receipt ${receipt.ok ? "" : "is-miss"}`}
          data-testid="voice-receipt"
          data-ms={receipt.ok && receipt.ms !== null ? receipt.ms : undefined}
          style={tint}
          role="status"
        >
          {receipt.ok ? (
            <>
              <b>{receipt.cards.join(" + ")}</b>
              {receipt.model ? (
                <>
                  <span>{receipt.model}</span>
                  {receipt.ms !== null && <span>{receipt.ms.toLocaleString()} ms</span>}
                </>
              ) : (
                <span>stand-in</span>
              )}
            </>
          ) : (
            "couldn't place that"
          )}
        </p>
      )}
    </>
  );
}
