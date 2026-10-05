import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { VoiceLanded, VoiceReceipt, VoiceShell } from "../live/useVoiceBuild";

/** The shell's stopwatch: ms since speech ended, the same clock the receipt
    reads. Written straight to the node so a tick never re-renders the room. */
function ShellClock({ t0 }: { t0: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) ref.current.textContent = `${Math.round(performance.now() - t0).toLocaleString()} ms`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [t0]);
  return <span className="voice-shell-clock" ref={ref} />;
}

/**
 * What a voice ask looks like while it builds (src/live/useVoiceBuild.ts):
 * the shell where the card will land (with a running clock when a model is
 * dealing), and the slip on the card that landed: who said it, and the
 * receipt (model + measured ms, live only). A miss has no card to sit on, so
 * its receipt shows above the dock. Typographic on purpose.
 */
export function VoiceBuildLayer({
  shell,
  landed,
  receipt,
  leaving,
  color,
  by,
  model,
}: {
  shell: VoiceShell | null;
  landed: VoiceLanded | null;
  receipt: VoiceReceipt | null;
  leaving: boolean;
  /** The maker's colour. */
  color: string;
  by: string;
  /** Who is dealing, shown on the shell; null in mock (no model runs). */
  model: string | null;
}) {
  const tint = { "--maker": color } as CSSProperties;
  const receiptLine = receipt && (
    <p
      key={receipt.key}
      className={`voice-receipt ${receipt.ok ? "" : "is-miss"} ${!receipt.ok && leaving ? "is-leaving" : ""}`}
      data-testid="voice-receipt"
      data-ms={receipt.ok && receipt.ms !== null ? receipt.ms : undefined}
      style={tint}
      role="status"
    >
      {receipt.ok ? (
        <>
          {receipt.cards.length > 1 && <span>{receipt.cards.join(" + ")}</span>}
          {receipt.model ? (
            <>
              <span>{receipt.model}</span>
              {receipt.ms !== null && <b>{receipt.ms.toLocaleString()} ms</b>}
            </>
          ) : (
            <span>stand-in</span>
          )}
        </>
      ) : (
        "couldn't place that"
      )}
    </p>
  );
  return (
    <>
      {shell &&
        createPortal(
          <div
            className="voice-shell"
            data-testid="voice-shell"
            data-phase={shell.phase}
            style={{ ...tint, left: shell.x, top: shell.y, width: shell.w, height: shell.h }}
            aria-live="polite"
          >
            <span className="voice-shell-kicker">
              {model ? `${model} · dealing` : "dealing"}
              {model && shell.phase === "dealing" && <ShellClock t0={shell.t0} />}
            </span>
            <q className="voice-shell-said">{shell.said}</q>
          </div>,
          shell.host,
        )}
      {landed &&
        createPortal(
          <div className={`voice-slip ${leaving ? "is-leaving" : ""}`} style={{ ...tint, left: landed.x, top: landed.y }}>
            <span className="voice-landed" data-testid="voice-landed" data-widget-ref={landed.widgetId}>
              {by} said it
            </span>
            {receipt?.ok && receiptLine}
          </div>,
          landed.host,
        )}
      {receipt && !receipt.ok && receiptLine}
    </>
  );
}
