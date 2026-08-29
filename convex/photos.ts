import { mutation } from "./_generated/server";
import { v } from "convex/values";

/** Client uploads the image bytes straight to storage via this URL. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
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
