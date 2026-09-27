import { useEffect, useState } from "react";
import "./labs.css";
import { CREW } from "../data/crew";
import {
  CURSOR_STYLES,
  DEFAULT_CURSOR_STYLE_ID,
  type CursorStyle,
} from "../cursors";

const DEMO_MEMBERS = CREW.members.filter((m) => m.online).slice(0, 3);

/**
 * Cursor lab — compare registered styles side by side.
 * Hash route: /#/cursors
 *
 * Architecture for AI / iteration:
 * - Add a Component in src/cursors/styles.tsx
 * - Register it in src/cursors/registry.ts
 * - It appears here automatically
 */
export function CursorLab() {
  const [activeId, setActiveId] = useState(DEFAULT_CURSOR_STYLE_ID);
  const [followMouse, setFollowMouse] = useState(true);
  const [pos, setPos] = useState({ x: 180, y: 140 });

  const active = CURSOR_STYLES.find((s) => s.id === activeId) ?? CURSOR_STYLES[0];
  const ActiveCursor = active.Component;

  useEffect(() => {
    if (!followMouse) return;

    const onMove = (event: PointerEvent) => {
      const stage = document.getElementById("cursor-lab-stage");
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      setPos({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [followMouse]);

  return (
    <main className="cursor-lab paper-bg space-theme-blush">
      <header className="cursor-lab-header">
        <div className="cursor-lab-nav">
          <a href="#/" className="cursor-lab-back">
            ← space
          </a>
          <a href="#/widgets" className="cursor-lab-back">
            widget lab →
          </a>
        </div>
        <div>
          <p className="cursor-lab-kicker">prototype</p>
          <h1>cursor lab</h1>
          <p className="cursor-lab-lede">
            Presence cursors are a big part of the feel. Pick a style, move
            around the stage, then tell an agent to generate more into{" "}
            <code>src/cursors/</code>.
          </p>
        </div>
      </header>

      <section className="cursor-lab-stage-wrap">
        <div className="cursor-lab-stage-meta">
          <h2>{active.name}</h2>
          <p>{active.description}</p>
          <label className="cursor-lab-toggle">
            <input
              type="checkbox"
              checked={followMouse}
              onChange={(e) => setFollowMouse(e.target.checked)}
            />
            follow mouse
          </label>
        </div>

        <div
          id="cursor-lab-stage"
          className="cursor-lab-stage"
          onPointerDown={() => setFollowMouse(true)}
        >
          <p className="cursor-lab-stage-hint">move here</p>
          <GhostWidgets />

          {DEMO_MEMBERS.map((member, i) => {
            const Style = active.Component;
            const offsets = [
              { x: 120, y: 90 },
              { x: 280, y: 200 },
              { x: 420, y: 130 },
            ];
            const o = offsets[i] ?? offsets[0];
            return (
              <div
                key={member.name}
                className="cursor-lab-ghost"
                style={{ left: o.x, top: o.y }}
              >
                <Style name={member.name} color={member.color} />
              </div>
            );
          })}

          <div
            className="cursor-lab-you"
            style={{ left: pos.x, top: pos.y }}
          >
            <ActiveCursor name="you" color="#111114" showFace={false} />
          </div>
        </div>
      </section>

      <section className="cursor-lab-grid" aria-label="Cursor styles">
        {CURSOR_STYLES.map((style) => (
          <StyleCard
            key={style.id}
            style={style}
            selected={style.id === activeId}
            onSelect={() => setActiveId(style.id)}
          />
        ))}
      </section>

      <footer className="cursor-lab-footer">
        <p>
          Add more: implement a <code>CursorProps</code> component in{" "}
          <code>styles.tsx</code>, register it in <code>registry.ts</code>.
          This page lists whatever is in <code>CURSOR_STYLES</code>.
        </p>
      </footer>
    </main>
  );
}

function StyleCard({
  style,
  selected,
  onSelect,
}: {
  style: CursorStyle;
  selected: boolean;
  onSelect: () => void;
}) {
  const { Component } = style;
  const samples = DEMO_MEMBERS.slice(0, 2);

  return (
    <button
      type="button"
      className={`cursor-lab-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="cursor-lab-card-preview" aria-hidden>
        {samples.map((member, i) => (
          <div
            key={member.name}
            className="cursor-lab-card-sample"
            style={{
              left: 28 + i * 72,
              top: 36 + i * 28,
            }}
          >
            <Component name={member.name} color={member.color} />
          </div>
        ))}
      </div>
      <div className="cursor-lab-card-copy">
        <strong>{style.name}</strong>
        <span>{style.id}</span>
        <p>{style.description}</p>
      </div>
    </button>
  );
}

function GhostWidgets() {
  return (
    <div className="cursor-lab-ghosts" aria-hidden>
      <div className="cursor-lab-ghost-note">cake poll is live</div>
      <div className="cursor-lab-ghost-photo" />
      <div className="cursor-lab-ghost-chat">who's bringing balloons</div>
    </div>
  );
}
