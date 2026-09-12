import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SPACE_TEMPLATES } from "../data/templates";
import type { SpaceTemplate } from "../data/types";
import { useCreateSpace } from "../live/useCreateSpace";
import { useAccount, useJoin } from "../live/useJoin";
import { CodeSlots } from "./CodeSlots";

/**
 * "start a new space" — one sheet, three beats.
 *
 *   1. pick a shape: the sheet drenches in that template's colour and the
 *      mini board fills with its widgets, so you see the room before it's real.
 *   2. call it something (or don't — the shape's name is the default).
 *   3. keep it: joined people press one button. A guest gets the email + code
 *      right here, and the sixth digit is the last thing they touch — the
 *      space is made and opened on its own, no "you're in" pit stop.
 *
 * The order matters. The old flow asked for an email before you'd picked or
 * named anything, which read as a login wall over a title that said "start".
 * Investment first, the gate last, and the gate is one line.
 */

// Resting tilts for the preview tiles — a sticker wall, not a grid.
const TILTS = [-2.2, 1.6, -1.1, 2.4, -1.8, 1.2];

export function SpaceMaker({
  open,
  onClose,
  onMade,
}: {
  open: boolean;
  onClose: () => void;
  onMade: (slug: string) => void;
}) {
  const [template, setTemplate] = useState<SpaceTemplate>(SPACE_TEMPLATES[0]);
  const [name, setName] = useState("");
  // Guests only: the keep-it panel is folded until they press the button.
  const [keeping, setKeeping] = useState(false);
  const [draft, setDraft] = useState("");
  // Set once the code lands. The account query flips to `joined` a beat
  // later, and only then is the mutation sent with a registered identity.
  const [makeWhenJoined, setMakeWhenJoined] = useState(false);

  const account = useAccount();
  const join = useJoin();
  const maker = useCreateSpace();
  const madeRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const make = async () => {
    if (madeRef.current) return;
    madeRef.current = true;
    const slug = await maker.create(template, name);
    if (slug) onMade(slug);
    else madeRef.current = false;
  };

  useEffect(() => {
    if (makeWhenJoined && account.joined) {
      setMakeWhenJoined(false);
      void make();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeWhenJoined, account.joined]);

  if (!open) return null;

  const shownName = name.trim() || template.name;
  const onCode = join.stage === "code";
  const settingUp = maker.busy || makeWhenJoined;

  return (
    <div className="widget-picker-backdrop" onClick={onClose} role="presentation">
      <div
        className="widget-picker space-maker"
        style={{ "--maker-color": template.color } as CSSProperties}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Start a new space"
      >
        <header>
          <div>
            <h2>start a new space</h2>
          </div>
          <button
            type="button"
            className="widget-picker-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {/* The board. Keyed on the template so the tiles re-land on every pick. */}
        <div className="space-maker-board" key={template.id}>
          <div className="space-maker-board-head">
            <span className="space-maker-board-icon">{`${template.icon}\uFE0E`}</span>
            <strong className={`space-maker-board-name${name.trim() ? "" : " is-default"}`}>
              {shownName}
            </strong>
          </div>
          <ul className="space-maker-tiles">
            {template.widgets.map((item, i) => (
              <li
                key={item.type}
                className="space-maker-tile"
                style={
                  {
                    "--i": i,
                    "--tilt": `${TILTS[i % TILTS.length]}deg`,
                  } as CSSProperties
                }
              >
                <em aria-hidden="true">{item.emoji}</em>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          {settingUp && <span className="join-stamp space-maker-stamp">yours</span>}
        </div>

        <div className="space-maker-body">
          <ul className="space-maker-shapes">
            {SPACE_TEMPLATES.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === template.id ? "is-picked" : ""}
                  style={{ "--shape-color": item.color } as CSSProperties}
                  disabled={settingUp}
                  onClick={() => setTemplate(item)}
                >
                  <span aria-hidden="true">{`${item.icon}\uFE0E`}</span>
                  {item.name}
                </button>
              </li>
            ))}
          </ul>

          <label className="space-maker-name">
            call it
            <input
              className="claim-name-input"
              value={name}
              maxLength={28}
              placeholder={template.name}
              disabled={settingUp}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (account.joined) void make();
                else setKeeping(true);
              }}
            />
          </label>

          {account.joined ? (
            <div className="space-maker-foot">
              <span className="space-maker-hint">
                {settingUp ? "setting the room up…" : `${shownName} — yours, from today.`}
              </span>
              <button
                type="button"
                className="claim-done"
                disabled={settingUp}
                onClick={() => void make()}
              >
                make it <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <>
              {!keeping && (
                <div className="space-maker-foot">
                  <span className="space-maker-hint">
                    one code to your email, so it's still yours next week.
                  </span>
                  <button
                    type="button"
                    className="claim-done"
                    onClick={() => setKeeping(true)}
                  >
                    keep it <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}

              <div className={`space-maker-keep-wrap${keeping ? " is-open" : ""}`}>
                <div>
                  <form
                    className="join-form space-maker-keep"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (join.busy || settingUp) return;
                      void (onCode ? join.verify(draft) : join.sendCode(draft));
                    }}
                  >
                    <span className="claim-card-kicker">
                      {onCode ? "check your email" : "keep this"}
                    </span>
                    <p className="join-form-reason">
                      {settingUp
                        ? `you're in. setting ${shownName} up…`
                        : onCode
                          ? `six numbers, on their way to ${join.email}. the last one opens the room.`
                          : "no password. one code, and the space is yours on any browser."}
                    </p>

                    {onCode ? (
                      <CodeSlots
                        value={draft}
                        onChange={setDraft}
                        onComplete={(code) => {
                          void join.verify(code).then((ok) => {
                            if (ok) setMakeWhenJoined(true);
                          });
                        }}
                        disabled={join.busy || settingUp}
                      />
                    ) : (
                      <input
                        className="claim-name-input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        maxLength={64}
                        placeholder="you@email.com"
                        aria-label="Your email"
                        autoFocus={keeping}
                      />
                    )}

                    {(join.error || maker.error) && (
                      <span className="join-form-error">{join.error ?? maker.error}</span>
                    )}

                    {!onCode && (
                      <div className="space-maker-foot">
                        <button
                          type="button"
                          className="join-form-back"
                          onClick={() => setKeeping(false)}
                        >
                          not yet
                        </button>
                        <button type="submit" className="claim-done" disabled={join.busy}>
                          {join.busy ? "sending…" : "send me a code"}
                        </button>
                      </div>
                    )}
                    {onCode && !settingUp && (
                      <button
                        type="button"
                        className="join-form-back"
                        onClick={() => {
                          setDraft("");
                          join.restart();
                        }}
                      >
                        use a different email
                      </button>
                    )}
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
