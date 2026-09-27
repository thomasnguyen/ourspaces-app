import { forwardRef, useState, type ChangeEvent } from "react";
import { updateIdentity } from "../live/identity";
import { playSound } from "../lib/sounds";
import { squareAvatar } from "../lib/avatarPhoto";

/**
 * The hidden file input behind every "my photo" tap. Crops to a 256px
 * square, hands the bytes to `upload`, and puts the url on the identity —
 * cursors, header, rail and (once joined) the account all follow.
 */
export const PhotoInput = forwardRef<
  HTMLInputElement,
  { upload: (photo: Blob) => Promise<string>; onBusy?: (busy: boolean) => void }
>(function PhotoInput({ upload, onBusy }, ref) {
  const [busy, setBusy] = useState(false);
  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    onBusy?.(true);
    try {
      const url = await upload(await squareAvatar(file));
      updateIdentity({ avatarUrl: url });
      playSound("tap");
    } finally {
      setBusy(false);
      onBusy?.(false);
      input.value = "";
    }
  };
  return (
    <input ref={ref} type="file" accept="image/*" hidden onChange={(event) => void onChange(event)} />
  );
});
