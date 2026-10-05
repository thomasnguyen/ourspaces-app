import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { SpaceTemplate } from "../data/types";
import { createDemoWidget } from "../lib/widgetDefaults";
import { getIdentity } from "./identity";

/** A made room starts with nobody else's words in it: the template cards'
 *  sample people (the crew's Maya, Jules, Sam) come out (N1). */
function ownRoomData(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  if (Array.isArray(out.messages)) out.messages = [];
  if (Array.isArray(out.members)) out.members = [];
  if (Array.isArray(out.vibes)) out.vibes = [];
  if (typeof out.playedBy === "string") out.playedBy = "";
  if (Array.isArray(out.items)) out.items = (out.items as Record<string, unknown>[]).map((item) => ({ ...item, by: null, claimed: false }));
  return out;
}

/**
 * Make a space from a template.
 *
 * The template's widgets get laid out immediately, because a brand-new space
 * with nothing on the board is the worst first impression this product can
 * make — the whole pitch is that a space is already alive when you walk in.
 *
 * The server decides the owner and the slug (convex/spaces.ts). Guests are
 * refused there, not here; the UI just offers to fix that first.
 */
export function useCreateSpace() {
  const createSpace = useMutation(api.spaces.createSpace);
  const createWidget = useMutation(api.widgets.createWidget);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (template: SpaceTemplate, name: string) => {
    setBusy(true);
    setError(null);
    try {
      const { spaceId, slug } = await createSpace({
        name: name.trim() || template.name,
        type: "ongoing",
        icon: template.icon,
        color: template.color,
      });

      const createdBy = getIdentity().userId;
      // A loose three-across grid. Deliberately not the tuned layouts the
      // seeded spaces use — this just has to look inhabited, and the owner
      // drags things where they want them anyway.
      for (const [index, item] of template.widgets.entries()) {
        const blueprint = createDemoWidget(item.type);
        await createWidget({
          spaceId,
          type: item.type,
          x: 90 + (index % 3) * 400,
          y: 90 + Math.floor(index / 3) * 320,
          w: blueprint.w,
          h: blueprint.h,
          z: index + 1,
          data: ownRoomData(blueprint.data as Record<string, unknown>),
          createdBy,
        });
      }
      return slug;
    } catch {
      setError("couldn't make that one. try again?");
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { create, busy, error };
}
