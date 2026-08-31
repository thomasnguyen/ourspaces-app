import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

const CREW_MEMORY_SOURCES: Record<
  string,
  { src: string; thumbnailSrc: string }
> = {
  "roof dusk": {
    src: "/photos/crew/roof-dusk.jpg",
    thumbnailSrc: "/photos/thumbs/crew/roof-dusk.jpg",
  },
  "paint night": {
    src: "/photos/crew/paint-night.jpg",
    thumbnailSrc: "/photos/thumbs/crew/paint-night.jpg",
  },
};

/** Client uploads the image bytes straight to storage via this URL. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/** Uploaded bytes → a public url any widget can persist in its data. */
export const storageUrl = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { storageId }) => await ctx.storage.getUrl(storageId),
});

/* Each new print lands with its own tilt so the pile stays organic. */
const PIN_TILTS = [-3, 2, -2, 3, -4, 4];

/** Pin an uploaded photo to the front of a memory wall — it becomes the
 *  cover of the pile and the hero of the room on every screen at once. */
export const addPhoto = mutation({
  args: {
    widgetId: v.id("widgets"),
    storageId: v.id("_storage"),
    caption: v.string(),
    by: v.string(),
  },
  handler: async (ctx, { widgetId, storageId, caption, by }) => {
    const widget = await ctx.db.get(widgetId);
    if (!widget || widget.type !== "photoWall") {
      throw new Error("Not a photo wall");
    }
    const src = await ctx.storage.getUrl(storageId);
    if (!src) throw new Error("Uploaded file not found");

    const photos = Array.isArray(widget.data?.photos) ? widget.data.photos : [];
    const date = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    })
      .format(new Date(Date.now()))
      .toLowerCase();

    const photo = {
      id: storageId,
      caption: caption.trim() || "new moment",
      date,
      by,
      rotate: PIN_TILTS[photos.length % PIN_TILTS.length],
      src,
      thumbnailSrc: src,
      addedAt: Date.now(),
    };
    await ctx.db.patch(widget._id, {
      data: { ...widget.data, photos: [photo, ...photos] },
    });
    return null;
  },
});

/** Replace the two early file-storage test uploads with the final camera-roll
 * assets. Keep each photo's storage id so its existing note thread survives. */
export const backfillCrewMemorySources = internalMutation({
  args: {},
  returns: v.object({ patchedWidgets: v.number(), patchedPhotos: v.number() }),
  handler: async (ctx) => {
    const crew = await ctx.db
      .query("spaces")
      .withIndex("by_slug", (q) => q.eq("slug", "crew"))
      .unique();
    if (!crew) return { patchedWidgets: 0, patchedPhotos: 0 };

    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_space", (q) => q.eq("spaceId", crew._id))
      .collect();
    let patchedWidgets = 0;
    let patchedPhotos = 0;

    for (const widget of widgets) {
      if (widget.type !== "photoWall") continue;
      const photos = Array.isArray(widget.data?.photos) ? widget.data.photos : [];
      let changed = false;
      const nextPhotos = photos.map((photo: unknown) => {
        if (!photo || typeof photo !== "object") return photo;
        const fields = photo as Record<string, unknown>;
        const caption = String(fields.caption ?? "").trim().toLowerCase();
        const source = CREW_MEMORY_SOURCES[caption];
        if (!source) return photo;
        if (
          fields.src === source.src &&
          fields.thumbnailSrc === source.thumbnailSrc
        ) {
          return photo;
        }
        changed = true;
        patchedPhotos += 1;
        return { ...fields, ...source };
      });

      if (!changed) continue;
      await ctx.db.patch(widget._id, {
        data: { ...widget.data, photos: nextPhotos },
      });
      patchedWidgets += 1;
    }

    return { patchedWidgets, patchedPhotos };
  },
});
