import { DEFAULT_SPACE_SLUG } from "../lib/routes";
import { Fragment, type CSSProperties } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { getDataMode } from "../live/dataMode";
import { useIdentity } from "../live/identity";
import { SPACES, SPACES_BY_ID } from "../data/spaces";
import type { SpaceMeta } from "../data/types";

/** presence component: "· N here" in the tooltip, separate from the
 * hand-rolled canvas presence system — see convex/roomPresence.ts. Its own
 * component (not a hook called in a .map()) so each space's subscription
 * is an independent instance, not a variable-length hook call. */
function OnlineCountSuffix({ spaceId }: { spaceId: string }) {
  const count =
    useQuery(api.roomPresence.onlineCountForSpace, { spaceId }) ?? 0;
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
  const { userId } = useIdentity();
  const count =
    useQuery(api.roomPresence.onlineCountForSpace, {
      spaceId,
      excludeUserId: userId,
    }) ?? 0;
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
  return (
    <aside className="space-rail">
      <a className="rail-brand" href="/" aria-label="OurSpaces home">
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

        <div
          className="space-link-wrap"
          style={{ "--i": SPACES.length } as CSSProperties}
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
  );
}
