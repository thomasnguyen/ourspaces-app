import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Your photo goes straight to Convex storage; the url it hands back is what
 * rides the identity (presence, members, cursors) and, once joined, the
 * `users` row. Live only — the mock page keeps a data url instead.
 */
export function useAvatarUpload() {
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const storageUrl = useMutation(api.photos.storageUrl);
  return useCallback(
    async (photo: Blob) => {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": photo.type },
        body: photo,
      });
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      const url = await storageUrl({ storageId });
      if (!url) throw new Error("no url for upload");
      return url;
    },
    [generateUploadUrl, storageUrl],
  );
}
