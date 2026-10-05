/**
 * The group-photo jigsaw: a photo from the room breaks into pieces on a mat
 * on the board and everyone puts it back together at once. A held piece
 * wears its holder's colour and name; the space's hand helps and waits its
 * turn (the ghost). `JigsawWorld` is the board's overlay (the mat, the
 * photo's empty place, the slip it leaves); `JigsawSheet` is a phone's play
 * surface; `JigsawInvite` is how the room finds out.
 *
 * Motion is `lib/jigsaw/engine.ts` writing transforms on rAF. React draws
 * who holds what and the discrete beats.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { LiveCursor } from "../../cursors";
import { ROOM_JIGSAW, type JigsawPhoto } from "../../data/jigsaw";
import { cutPicture, gridFor, type Cut, type CutPiece } from "../../lib/jigsaw/cut";
import { clock, JigsawEngine, SPACE_NAME, type JigsawResult, type Layout, type Person, type Rect, type RemotePiece, type Snap } from "../../lib/jigsaw/engine";
import { JIGSAW_WIDGET_ID, useJigsaw, type JigsawApi, type JigsawDone, type JigsawOptions } from "../../lib/jigsaw/useMockJigsaw";
import { playSound } from "../../lib/sounds";
import { byStyle, GameFace, inkOn, nameList, useNoticeAside } from "./parts";
import "./games.css";
import "./jigsaw.css";

const DESK: Layout = {
  W: 900,
  H: 612,
  frame: { x: 230, y: 162, w: 440, h: 330 },
  zones: [
    { x: 190, y: 104, w: 520, h: 8 },
    { x: 190, y: 546, w: 520, h: 10 },
    { x: 68, y: 116, w: 84, h: 430 },
    { x: 748, y: 116, w: 84, h: 430 },
  ],
  phone: false,
};

function phoneLayout(): Layout {
  const H = Math.max(620, Math.round((window.innerHeight / window.innerWidth) * 390));
  return { W: 390, H, frame: { x: 15, y: 84, w: 360, h: 270 }, zones: [{ x: 62, y: 424, w: 266, h: Math.max(60, H - 424 - 96) }], phone: true };
}

const lower = (name: string, me: Person) => (name === me.name && me.name === "You" ? "you" : name.toLowerCase());

/* ------------------------------------------------------------------ */
/* one piece                                                           */
/* ------------------------------------------------------------------ */

const Piece = memo(function Piece(p: { c: CutPiece; cut: Cut; frame: Rect; src: string; uid: string; engine: JigsawEngine; state: string; holder: string | null; color: string; tag: string }) {
  const { c, cut, frame, engine } = p;
  const bw = cut.cw + cut.pad * 2, bh = cut.ch + cut.pad * 2;
  const origin = `${cut.pad + cut.cw / 2}px ${cut.pad + cut.ch / 2}px`;
  const attach = useCallback((el: HTMLDivElement | null) => engine.attachPiece(c.id, el), [engine, c.id]);
  const clip = `jgc-${p.uid}-${c.id}`;
  return (
    <div
      ref={attach}
      className={`jg-p is-${p.state}`}
      data-piece={c.id}
      data-testid="jigsaw-piece"
      data-state={p.state}
      data-holder={p.holder ?? ""}
      style={{ width: bw, height: bh, transformOrigin: origin, "--by": p.color, "--on": inkOn(p.color) } as CSSProperties}
    >
      <div className="jg-in" style={{ transformOrigin: origin }}>
        <svg width={bw} height={bh} viewBox={`0 0 ${bw} ${bh}`}>
          <defs>
            <clipPath id={clip}>
              <path d={c.d} />
            </clipPath>
          </defs>
          <path className="jg-shadow" d={c.d} />
          <path className="jg-halo" d={c.d} />
          <image href={p.src} x={cut.pad - c.col * cut.cw} y={cut.pad - c.row * cut.ch} width={frame.w} height={frame.h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
          <path className="jg-edge" d={c.d} />
        </svg>
      </div>
      {p.holder && p.holder !== SPACE_NAME && (
        <span className="jg-tag" style={{ left: cut.pad + cut.cw / 2, top: cut.pad - 10 }}>
          {p.tag}
        </span>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* the mat                                                             */
/* ------------------------------------------------------------------ */

type MatProps = {
  layout: Layout;
  photo: JigsawPhoto;
  options: JigsawOptions;
  me: Person;
  sims: Person[];
  startedBy: Person;
  already: number;
  skipIntro: boolean;
  /** where the photo hangs, in the mat's own coordinates (the fly out and back) */
  home: Rect | null;
  onTouch: () => void;
  onPlaced: (n: number) => void;
  onFinish: (result: JigsawResult) => void;
  onClose: () => void;
  /** a phone: put the sheet away, the puzzle goes on */
  onLeave?: () => void;
  /** a live room: the server's pieces in, your moves out (no simulated hands, no space hand) */
  live?: JigsawApi["live"];
};

type Stage = "fly" | "play" | "whole" | "return";

const JigsawMat = memo(function JigsawMat(p: MatProps) {
  const { layout, photo, options, me, sims } = p;
  const uid = useMemo(() => Math.random().toString(36).slice(2, 7), []);
  const cut = useMemo(() => {
    const g = gridFor(options.pieces);
    return cutPicture(layout.frame.w, layout.frame.h, g.cols, g.rows, options.seed);
  }, [layout, options.pieces, options.seed]);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [stage, setStage] = useState<Stage>(p.skipIntro || !p.home ? "play" : "fly");
  const [result, setResult] = useState<JigsawResult | null>(null);
  const live = useRef(p);
  live.current = p;
  const mat = useRef<HTMLDivElement | null>(null);
  const whole = useRef<HTMLImageElement | null>(null);
  const box = useRef<{ left: number; top: number; k: number; at: number } | null>(null);

  const engineRef = useRef<JigsawEngine | null>(null);
  const [engine] = useState(
    () =>
      new JigsawEngine({
        layout, cut, seed: options.seed, you: me, youMode: options.you, sims, beat: options.beat,
        already: p.already, skipIntro: p.skipIntro,
        ...(p.live
          ? { live: { onLocal: (m) => void Promise.resolve(live.current.live?.onLocal(m)).then((r) => r === "wait" && engineRef.current?.yieldPiece(m.id)) } }
          : {}),
        onChange: (s) => setSnap(s),
        onFinish: (r) => setResult(r),
        sound: () => playSound("place"),
      }),
  );

  /* the photo leaves the wall and lands in the frame; then the engine cuts it */
  useLayoutEffect(() => {
    (window as unknown as { __jig?: JigsawEngine }).__jig = engine; // for takes and the perf probe
    if (stage !== "fly" || !p.home) {
      engine.start();
      return () => engine.stop();
    }
    const { frame } = layout, h = p.home;
    const from = `translate(${h.x - frame.x}px, ${h.y - frame.y}px) scale(${h.w / frame.w}, ${h.h / frame.h}) rotate(-2deg)`;
    const fly = whole.current?.animate([{ transform: from }, { transform: "none" }], { duration: 760, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" });
    const t = window.setTimeout(() => {
      setStage("play");
      engine.start();
    }, 800);
    return () => {
      window.clearTimeout(t);
      fly?.cancel();
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  engineRef.current = engine;
  /* live: what the server says about every touched piece (a lease past its end is no hold) */
  const rows = p.live?.rows;
  useEffect(() => {
    if (!rows) return;
    const apply = () => engine.applyRemote(rows.map((r) => ((r as RemotePiece & { until?: number }).until ?? 0) > Date.now() || r.placed ? r : { ...r, holder: null }), (name) => sims.find((s) => s.name === name)?.color ?? "var(--color-sticker)");
    apply();
    const t = window.setInterval(apply, 1000);
    return () => window.clearInterval(t);
  }, [engine, rows, sims]);
  /* live: the space's hand waiting on someone (convex/puzzles.ts helper → the one door) */
  const helper = p.live?.helper;
  useEffect(() => {
    if (p.live) engine.remoteGhost(helper ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, helper?.piece, helper?.on]);
  useEffect(() => {
    document.body.classList.add("jg-on");
    return () => document.body.classList.remove("jg-on");
  }, []);

  useEffect(() => {
    if (snap) live.current.onPlaced(snap.placed);
  }, [snap?.placed]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the finish: whole, then home */
  useEffect(() => {
    if (!result) return;
    setStage("whole");
    live.current.onFinish(result);
    if (layout.phone || !live.current.home) return;
    const t = window.setTimeout(() => setStage("return"), 2100);
    return () => window.clearTimeout(t);
  }, [result, layout.phone]);

  useLayoutEffect(() => {
    if (stage !== "return") return;
    const h = live.current.home;
    const { frame } = layout;
    if (!h || !whole.current) return live.current.onClose();
    const to = `translate(${h.x - frame.x}px, ${h.y - frame.y}px) scale(${h.w / frame.w}, ${h.h / frame.h}) rotate(-2deg)`;
    const fly = whole.current.animate([{ transform: "none" }, { transform: to }], { duration: 820, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" });
    const t = window.setTimeout(() => live.current.onClose(), 840);
    return () => {
      window.clearTimeout(t);
      fly.cancel();
    };
  }, [stage, layout]);

  /* ---------- your pointer ---------- */
  const at = (e: ReactPointerEvent) => {
    const now = performance.now();
    if (!box.current || now - box.current.at > 400) {
      const r = mat.current!.getBoundingClientRect();
      box.current = { left: r.left, top: r.top, k: r.width / layout.W, at: now };
    }
    return [(e.clientX - box.current.left) / box.current.k, (e.clientY - box.current.top) / box.current.k] as const;
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (options.you !== "real") return;
    const el = (e.target as Element).closest<HTMLElement>("[data-piece]");
    if (!el) return;
    box.current = null;
    const [x, y] = at(e);
    const d = engine.grab(Number(el.dataset.piece), x, y);
    if (d?.kind !== "go") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current.onTouch();
  };
  const moved = (e: ReactPointerEvent) => {
    if (options.you !== "real") return;
    const [x, y] = at(e);
    engine.point(x, y);
  };
  const up = () => options.you === "real" && engine.release();

  /* one ref callback per hand, kept: a fresh one each render would detach and re-attach it */
  const refMap = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const refs = (name: string) => {
    if (!refMap.current.has(name)) refMap.current.set(name, (el) => engine.attachAgent(name, el));
    return refMap.current.get(name)!;
  };
  const clockRef = useCallback((el: HTMLSpanElement | null) => engine.attachClock(el), [engine]);
  const total = cut.pieces.length;
  const colorOf = (name: string | null) => (name === me.name ? me.color : sims.find((s) => s.name === name)?.color ?? "var(--color-sticker)");
  const ghost = snap?.ghost;
  const ghostPiece = ghost ? cut.pieces[ghost.piece] : null;
  const bw = cut.cw + cut.pad * 2, bh = cut.ch + cut.pad * 2;
  const people = [me, ...sims];
  const frameStyle = { left: layout.frame.x, top: layout.frame.y, width: layout.frame.w, height: layout.frame.h };
  const drawYou = options.hand && options.you !== "none";

  return (
    <div
      ref={mat}
      className={`jg-mat ${layout.phone ? "is-phone" : ""}`}
      data-testid="jigsaw-mat"
      data-widget-id={JIGSAW_WIDGET_ID}
      data-stage={stage}
      data-phase={snap?.phase ?? "cut"}
      data-placed={snap?.placed ?? 0}
      data-helper={snap?.helper ?? "idle"}
      data-waits={snap?.waits ?? 0}
      data-refusals={snap?.refusals ?? 0}
      style={{ width: layout.W, height: layout.H, ...byStyle(p.startedBy) }}
      onPointerDown={down}
      onPointerMove={moved}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="jg-card">
        <header className="jg-head">
          <span className="jg-kicker">
            <i aria-hidden="true">▶</i> puzzle · {photo.caption}
          </span>
          <span className="jg-faces">
            {people.map((person) => (
              <span key={person.name} className="jg-who" style={byStyle(person)}>
                <GameFace person={person} />
                <b>{snap?.counts[person.name] ?? 0}</b>
              </span>
            ))}
            <span className="jg-who is-space">
              <i aria-hidden="true" />
              <b>{snap?.counts[SPACE_NAME] ?? 0}</b>
            </span>
          </span>
          <span className="jg-tally">
            <b data-testid="jigsaw-count">
              {snap?.placed ?? p.already} of {total}
            </b>
            <span ref={clockRef}>0:00</span>
          </span>
          {p.onLeave && (
            <button type="button" className="jg-leave" data-testid="jigsaw-sheet-leave" onPointerDown={(e) => e.stopPropagation()} onClick={p.onLeave}>
              board ↗
            </button>
          )}
        </header>
        <div className="jg-frame" style={frameStyle} />
      </div>

      {ghost && ghostPiece && (
        <div
          key={ghost.piece}
          className={`jg-ghost ${ghost.leaving ? "is-leaving" : ""} ${ghost.on ? "" : "is-go"}`}
          data-testid="jigsaw-ghost"
          style={{ left: layout.frame.x + ghostPiece.col * cut.cw - cut.pad, top: layout.frame.y + ghostPiece.row * cut.ch - cut.pad, width: bw, height: bh }}
        >
          <svg width={bw} height={bh} viewBox={`0 0 ${bw} ${bh}`}>
            <path d={ghostPiece.d} />
          </svg>
        </div>
      )}
      {ghost && ghostPiece && (ghost.on || ghost.leaving) && (
        <div
          key={`words-${ghost.piece}`}
          className={`jg-ghost is-words ${ghost.leaving ? "is-leaving" : ""}`}
          style={{ left: layout.frame.x + ghostPiece.col * cut.cw - cut.pad, top: layout.frame.y + ghostPiece.row * cut.ch - cut.pad, width: bw, height: bh }}
        >
          <span className="jg-ghost-tag" style={{ left: cut.pad + cut.cw / 2, top: cut.pad + cut.ch + 8, "--by": colorOf(ghost.on) } as CSSProperties}>
            {ghost.leaving ? (
              "all yours"
            ) : (
              <>
                waiting on <b>{lower(ghost.on ?? "", me)}</b>
              </>
            )}
          </span>
        </div>
      )}

      {cut.pieces.map((c) => {
        const holder = snap?.holders[c.id] ?? null;
        return (
          <Piece
            key={c.id}
            c={c}
            cut={cut}
            frame={layout.frame}
            src={photo.src}
            uid={uid}
            engine={engine}
            state={snap?.states[c.id] ?? "loose"}
            holder={holder}
            color={colorOf(holder)}
            tag={holder === me.name ? "you have this" : `${(holder ?? "").toLowerCase()} has this`}
          />
        );
      })}

      <img ref={whole} className="jg-whole" src={photo.src} alt="" draggable={false} style={frameStyle} />
      {stage === "whole" && <span className="jg-flash" style={frameStyle} />}
      {stage === "whole" && result && (
        <div className="jg-done" data-testid="jigsaw-done" style={{ top: layout.frame.y + layout.frame.h + 18 }}>
          <strong>{clock(result.ms)}</strong>
          <span>put together by {nameList(result.by.map((x) => lower(x.name, me)))}</span>
          {layout.phone && (
            <button type="button" className="gm-go" data-testid="jigsaw-sheet-close" onClick={p.onClose}>
              back to the board →
            </button>
          )}
        </div>
      )}

      {!p.live && sims.map((sim) => (
        <LiveCursor key={sim.name} motionRef={refs(sim.name)} name={sim.name} color={sim.color} active={snap?.holders.includes(sim.name) ?? false} className="jg-cursor" />
      ))}
      {drawYou && <LiveCursor motionRef={refs(me.name)} name={me.name} color={me.color} label={me.name === "You" ? "you" : `${me.name} (you)`} active={snap?.holders.includes(me.name) ?? false} className="jg-cursor" />}
      {!p.live && <div className="jg-hand" ref={refs(SPACE_NAME)} data-testid="jigsaw-helper" data-state={snap?.helper ?? "idle"}>
        <svg width="26" height="28" viewBox="0 0 26 28" aria-hidden="true">
          <path d="M4 3l17 9.5-7.6 2.1L10 23z" />
        </svg>
        <span className="jg-hand-tag">
          <i aria-hidden="true" />
          {snap?.line ?? "the space"}
        </span>
      </div>}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* on the board                                                        */
/* ------------------------------------------------------------------ */

/** Where a photo hangs on the board, in board coordinates. */
function photoRect(world: HTMLElement, photo: JigsawPhoto): Rect | null {
  const group = document.querySelector<HTMLElement>(`.widget-group[data-widget-id="${photo.widgetId}"]`);
  const file = photo.src.split("/").pop() ?? "";
  const el = group?.querySelector<HTMLElement>(`img[src*="${file}"]`) ?? group?.querySelector<HTMLElement>("img") ?? group;
  if (!el) return null;
  const wr = world.getBoundingClientRect(), r = el.getBoundingClientRect();
  const k = wr.width / world.offsetWidth || 1;
  const w = el.offsetWidth, h = el.offsetHeight;
  return { x: (r.left + r.width / 2 - wr.left) / k - w / 2, y: (r.top + r.height / 2 - wr.top) / k - h / 2, w, h };
}

function Slip({ done, me, rect }: { done: JigsawDone; me: Person; rect: Rect }) {
  return (
    <aside className="jg-slip" data-testid="jigsaw-slip" style={{ left: rect.x + rect.w - 196, top: rect.y + rect.h - 14 }}>
      <b>
        put together by {nameList(done.by.map((x) => lower(x.name, me)))} in {clock(done.ms)}
      </b>
      <span>
        the space placed {done.space.placed} · waited its turn {done.space.waits}×
      </span>
    </aside>
  );
}

export function JigsawWorld() {
  const api = useJigsaw();
  const world = useRef<HTMLDivElement | null>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const run = api?.run;
  const on = run && run.phase === "on";
  const last = api?.done[api.done.length - 1];
  const need = [on ? run.photo : null, last?.photo].filter((x): x is JigsawPhoto => Boolean(x));
  const needKey = need.map((x) => x.key).join(",");
  useLayoutEffect(() => {
    if (!world.current || need.length === 0) return;
    const next: Record<string, Rect> = {};
    for (const photo of need) {
      const r = photoRect(world.current, photo);
      if (r) next[photo.key] = r;
    }
    setRects((prev) => ({ ...prev, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needKey]);
  const stable = useRef(api);
  stable.current = api;
  const onTouch = useCallback(() => !stable.current?.run?.joined && stable.current?.join(), []);
  const onPlaced = useCallback((n: number) => stable.current?.report(n), []);
  const onFinish = useCallback((r: JigsawResult) => stable.current?.finish(r), []);
  const onClose = useCallback(() => stable.current?.close(), []);
  const spot = api ? ROOM_JIGSAW[api.room]?.mat : undefined;
  const out = on ? rects[run.photo.key] : null;
  /* stable while the puzzle runs: the mat is memo'd and must not re-render on the room's clock */
  const home = useMemo(() => (out && spot ? { x: out.x - spot.x, y: out.y - spot.y, w: out.w, h: out.h } : null), [out, spot]);
  if (!api || !spot) return null;
  return (
    <div className="jg-world" ref={world}>
      {on && out && (
        <span className="jg-out" style={{ left: out.x, top: out.y, width: out.w, height: out.h }}>
          out for a puzzle
        </span>
      )}
      {on && !api.phone && (out || run.skipIntro) && (
        <div className="jg-spot" style={{ left: spot.x, top: spot.y }}>
          <JigsawMat key={run.id} layout={DESK} photo={run.photo} options={api.options} me={api.me} sims={api.sims} startedBy={run.startedBy} already={run.already} skipIntro={run.skipIntro} home={home} onTouch={onTouch} onPlaced={onPlaced} onFinish={onFinish} onClose={onClose} live={api.live} />
        </div>
      )}
      {last && !on && rects[last.photo.key] && <Slip done={last} me={api.me} rect={rects[last.photo.key]} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* a phone: the picture on top, the tray under it                      */
/* ------------------------------------------------------------------ */

export function JigsawSheet() {
  const api = useJigsaw();
  const [layout] = useState(phoneLayout);
  const stable = useRef(api);
  stable.current = api;
  const noop = useCallback(() => {}, []);
  const onPlaced = useCallback((n: number) => stable.current?.report(n), []);
  const onFinish = useCallback((r: JigsawResult) => stable.current?.finish(r), []);
  const onClose = useCallback(() => stable.current?.close(), []);
  const onLeave = useCallback(() => stable.current?.closeSheet(), []);
  const run = api?.run;
  if (!api || !run || run.phase !== "on" || !api.phone || !api.sheetOpen) return null;
  /* a phone that opens it late drops into roughly where the room has got to */
  const already = run.skipIntro ? run.already : Math.min(api.options.pieces - 3, Math.floor((Date.now() - run.startedAt - 4000) / 2600));
  return (
    <div className="jg-sheet" data-testid="jigsaw-sheet" style={{ "--k": window.innerWidth / layout.W } as CSSProperties}>
      <JigsawMat key={run.id} layout={layout} photo={run.photo} options={api.options} me={api.me} sims={api.sims} startedBy={run.startedBy} already={Math.max(0, already)} skipIntro={already > 0} home={null} onTouch={noop} onPlaced={onPlaced} onFinish={onFinish} onClose={onClose} onLeave={onLeave} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* how the room finds out                                              */
/* ------------------------------------------------------------------ */

export function JigsawInvite() {
  const api = useJigsaw();
  const run = api?.run;
  const showing = Boolean(api && run && run.phase === "on" && !run.result && !run.joined && !api.inviteHidden);
  useNoticeAside(showing);
  if (!api || !run || !showing) return null;
  const total = api.options.pieces;
  return (
    <aside className="gmi" style={byStyle(run.startedBy)} data-testid="jigsaw-invite" key={run.id}>
      <GameFace person={run.startedBy} />
      <p>
        <b>{run.startedBy.name.toLowerCase()} started a puzzle</b>
        <span>
          {run.photo.caption} · {api.placed} of {total} in, jump in
        </span>
      </p>
      <button type="button" className="gmi-join" data-testid="jigsaw-invite-join" onClick={api.join}>
        join →
      </button>
      <button type="button" className="gmi-hide" data-testid="jigsaw-invite-hide" aria-label="not now" onClick={api.hideInvite}>
        ×
      </button>
    </aside>
  );
}

/** The scoreboard's second way in. */
export function JigsawStart() {
  const api = useJigsaw();
  if (!api || !ROOM_JIGSAW[api.room]) return null;
  const on = api.run?.phase === "on";
  return (
    <button type="button" className="gm-ghost jg-start" data-testid="jigsaw-start" onClick={() => api.start()}>
      {on ? "the puzzle is on. go →" : "puzzle the group photo →"}
    </button>
  );
}

/** Mock mode says what it is: the helper is scripted. Frame time rides along. */
export function JigsawDev() {
  const api = useJigsaw();
  const el = useRef<HTMLSpanElement | null>(null);
  const on = api?.run?.phase === "on";
  useEffect(() => {
    if (!on) return;
    let last = performance.now(), raf = 0;
    const frames: number[] = [];
    const loop = (now: number) => {
      frames.push(now - last);
      last = now;
      if (frames.length >= 60) {
        const avg = frames.reduce((a, b) => a + b, 0) / frames.length, max = Math.max(...frames);
        if (el.current) el.current.textContent = `${avg.toFixed(1)} ms/frame · worst ${max.toFixed(0)}`;
        (window as unknown as { __jigFrames?: number[] }).__jigFrames = [...((window as unknown as { __jigFrames?: number[] }).__jigFrames ?? []), ...frames].slice(-1200);
        frames.length = 0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  if (!api || !on) return null;
  const o = api.options;
  if (api.live)
    return (
      <p className="jg-dev" data-testid="jigsaw-dev">
        jigsaw · live · {api.sims.length + 1} real players, nobody simulated · the space's hand: code picks the next loose piece every 7 s, no model, through the Right of Way gate (waits on a held piece, never the last) · leases 4 s · {o.pieces} pieces · <span ref={el}>…</span>
      </p>
    );
  return (
    <p className="jg-dev" data-testid="jigsaw-dev">
      jigsaw · mock · the space's hand is scripted, not a model; the yield is the real rule (rightOfWay.ts) · seed {o.seed} · {o.pieces} pieces · {api.sims.length} simulated · <span ref={el}>…</span>
    </p>
  );
}
