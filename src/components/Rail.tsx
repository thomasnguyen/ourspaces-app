import { DEFAULT_SPACE_SLUG, rememberSpaceSlug } from "../lib/routes";
import { Fragment, type CSSProperties } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { getDataMode } from "../live/dataMode";
import { getPresenceId } from "../live/identity";
import { SPACES, SPACES_BY_ID } from "../data/spaces";
import type { SpaceMeta } from "../data/types";

/** presence component: "· N here" in the tooltip, separate from the
 * hand-rolled canvas presence system — see convex/roomPresence.ts. Its own
 * component (not a hook called in a .map()) so each space's subscription
 * is an independent instance, not a variable-length hook call.
 *
 * The args here are IDENTICAL to OnlineDotLive's below, and that is the
 * point: same query + same args is one subscription in the query cache, not
 * two. Passing `excludeUserId` to only one of them is what used to double
 * the rail's presence traffic. */
function OnlineCountSuffix({ spaceId }: { spaceId: string }) {
  /* The tab's presence id, not the person's — the same key the cursors use,
     so "N here" and the number of cursors on the canvas can never disagree. */
  const userId = getPresenceId();
  const count =
    useQuery(api.roomPresence.onlineForSpace, { spaceId, userId })?.total ?? 0;
  if (count <= 0) return null;
  return <> · {count} here</>;
}

/* The rail renders in mock mode too, where main.tsx mounts a bare <App/> with
   no ConvexQueryCacheProvider — and the cache hook throws outright when its
   context is missing, which took the whole tree down and painted ?mock=1 as a
   blank canvas. There is no live occupancy to show without a backend anyway,
   so mock mode simply doesn't ask. */
function OnlineCount({ spaceId }: { spaceId: string }) {
  if (getDataMode() !== "live") return null;
  return <OnlineCountSuffix spaceId={spaceId} />;
}

/* Lime dot on the tile when someone ELSE is in that space — the caller is
   excluded, so the room you're standing in never lights up for you. */
function OnlineDotLive({ spaceId }: { spaceId: string }) {
  const userId = getPresenceId();
  const count =
    useQuery(api.roomPresence.onlineForSpace, { spaceId, userId })?.others ?? 0;
  if (count <= 0) return null;
  return <span className="space-link-dot" aria-hidden="true" />;
}

function OnlineDot({ spaceId }: { spaceId: string }) {
  if (getDataMode() !== "live") return null;
  return <OnlineDotLive spaceId={spaceId} />;
}

/** The first N spaces in SPACES are the worked examples; the rail draws a
 * rule under them (no label) and everything below is what a reviewer makes. */
const EXAMPLE_COUNT = 3;

const SPACE_COVERS: Record<string, string> = {
  crew: "/assets/the-crew-snapshot-thumb.jpg",
  couple: "/assets/space-covers/us-two.png",
  house: "/assets/space-covers/the-house.png",
  league: "/assets/space-covers/game-day.png",
};

/** Spaces you made, or were invited into. Live only — see OnlineCount. */
function YoursGroupLive({
  activeId,
  onSelectSpace,
  offset,
}: {
  activeId: string;
  onSelectSpace?: (id: string) => void;
  offset: number;
}) {
  const mine = useQuery(api.spaces.listMine, {}) ?? [];
  if (mine.length === 0) return null;

  return (
    <>
      <div
        className="rail-divider"
        aria-hidden="true"
        style={{ "--i": offset } as CSSProperties}
      />
      {mine.map((space, i) => {
        const slug = space.slug ?? "";
        const active = slug === activeId;
        return (
          <div
            key={space._id}
            className="space-link-wrap"
            style={{ "--i": offset + i + 1 } as CSSProperties}
          >
            <button
              type="button"
              className={`space-link ${active ? "is-active" : ""}`}
              style={{ backgroundColor: space.color }}
              aria-label={space.name}
              aria-current={active ? "page" : undefined}
              onClick={() => slug && onSelectSpace?.(slug)}
            >
              <span>{`${space.icon}\uFE0E`}</span>
              <OnlineDot spaceId={space._id} />
            </button>
            <span className="space-tooltip">
              {space.name}
              {space.isOwner ? " · yours" : ""}
              <OnlineCount spaceId={space._id} />
            </span>
          </div>
        );
      })}
    </>
  );
}

function YoursGroup(props: {
  activeId: string;
  onSelectSpace?: (id: string) => void;
  offset: number;
}) {
  if (getDataMode() !== "live") return null;
  return <YoursGroupLive {...props} />;
}

export function Rail({
  activeId = DEFAULT_SPACE_SLUG,
  activeSpaceOverride,
  onSelectSpace,
  onCreateClick,
}: {
  activeId?: string;
  activeSpaceOverride?: Partial<SpaceMeta>;
  onSelectSpace?: (id: string) => void;
  onCreateClick?: () => void;
}) {
  const rememberCurrentSpace = () => {
    if (activeId) rememberSpaceSlug(activeId);
  };

  return (
    <>
    <aside className="space-rail">
      {/* The mark opens the story; room tiles handle all space navigation. */}
      <a
        className="rail-brand"
        href="#/about"
        title="about ourspaces"
        aria-label="About OurSpaces"
        onClick={rememberCurrentSpace}
      >
        <img src="/assets/ourspace-mark.png" alt="" />
      </a>

      <div className="space-list">
        {SPACES.map((space, i) => {
          const active = space.id === activeId;
          const displaySpace = active
            ? { ...space, ...activeSpaceOverride }
            : space;
          const spaceCover = SPACE_COVERS[space.id];
          const hasSpace = Boolean(SPACES_BY_ID[space.id]);

          return (
            <Fragment key={space.id}>
              {i === EXAMPLE_COUNT && (
                <div
                  className="rail-divider"
                  aria-hidden="true"
                  style={{ "--i": i } as CSSProperties}
                />
              )}
              <div
                className="space-link-wrap"
                style={{ "--i": i } as CSSProperties}
              >
                <button
                  type="button"
                  className={`space-link ${active ? "is-active" : ""} ${
                    spaceCover ? "has-photo" : ""
                  }`}
                  style={{
                    backgroundColor: displaySpace.color,
                    backgroundImage: spaceCover
                      ? `url('${spaceCover}')`
                      : undefined,
                  }}
                  aria-label={displaySpace.name}
                  aria-current={active ? "page" : undefined}
                  onClick={() => hasSpace && onSelectSpace?.(space.id)}
                  disabled={!hasSpace}
                >
                  {/* U+FE0E keeps ♥ a text glyph (white ink) instead of the emoji */}
                  {!spaceCover && <span>{`${displaySpace.icon}\uFE0E`}</span>}
                  {hasSpace && <OnlineDot spaceId={space.id} />}
                </button>
                <span className="space-tooltip">
                  {displaySpace.name}
                  {displaySpace.preview ? ` · ${displaySpace.preview}` : ""}
                  {hasSpace && <OnlineCount spaceId={space.id} />}
                </span>
              </div>
            </Fragment>
          );
        })}

        <YoursGroup
          activeId={activeId}
          onSelectSpace={onSelectSpace}
          offset={SPACES.length}
        />

        <div
          className="space-link-wrap"
          style={{ "--i": SPACES.length + 1 } as CSSProperties}
        >
          <button
            type="button"
            className="create-space-button"
            aria-label="Create a new space"
            onClick={onCreateClick}
          >
            <span>+</span>
          </button>
          <span className="space-tooltip">new space</span>
        </div>
      </div>
    </aside>
    <a className="app-about-link" href="#/about" onClick={rememberCurrentSpace}>about <span>↗</span></a>
    </>
  );
}
