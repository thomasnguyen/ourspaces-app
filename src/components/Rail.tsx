import { DEFAULT_SPACE_SLUG } from "../lib/routes";
import type { CSSProperties } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { SPACES, SPACES_BY_ID } from "../data/spaces";
import type { SpaceMeta } from "../data/types";

/** presence component: "· N here" in the tooltip, separate from the
 * hand-rolled canvas presence system — see convex/roomPresence.ts. Its own
 * component (not a hook called in a .map()) so each space's subscription
 * is an independent instance, not a variable-length hook call. */
function OnlineCountSuffix({ spaceId }: { spaceId: string }) {
  const count = useQuery(api.roomPresence.onlineCountForSpace, { spaceId }) ?? 0;
  if (count <= 0) return null;
  return <> · {count} here</>;
}

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
          const displaySpace = active ? { ...space, ...activeSpaceOverride } : space;
          const spaceCover = SPACE_COVERS[space.id];
          const hasSpace = Boolean(SPACES_BY_ID[space.id]);

          return (
            <div
              key={space.id}
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
                  backgroundImage: spaceCover ? `url('${spaceCover}')` : undefined,
                }}
                aria-label={displaySpace.name}
                aria-current={active ? "page" : undefined}
                onClick={() => hasSpace && onSelectSpace?.(space.id)}
                disabled={!hasSpace}
              >
                {/* U+FE0E keeps ♥ a text glyph (white ink) instead of the emoji */}
                {!spaceCover && <span>{`${displaySpace.icon}\uFE0E`}</span>}
              </button>
              <span className="space-tooltip">
                {displaySpace.name}
                {displaySpace.preview ? ` · ${displaySpace.preview}` : ""}
                {hasSpace && <OnlineCountSuffix spaceId={space.id} />}
              </span>
            </div>
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
