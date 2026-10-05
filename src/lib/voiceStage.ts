/* The seam between the voice stage and whatever starts a build.

   The stage is the big dark listening view the dock orb opens into
   (components/VoiceStage.tsx). It closes itself when the ask ends. Anything
   that starts building EARLIER, while the person is still talking, calls
   `releaseVoiceStage()`: the stage lets go at once, the orb flies back to the
   dock and keeps listening there, and the board is in view for the card.
   Safe to call any time; it does nothing when no stage is up. */

const listeners = new Set<() => void>();

/** Release the voice stage now (a build has started). */
export function releaseVoiceStage() {
  listeners.forEach((listener) => listener());
}

/** The stage listens here. Returns the unsubscribe. */
export function onVoiceStageRelease(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
