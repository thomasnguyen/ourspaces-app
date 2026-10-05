/**
 * STAND-IN, NOT A MODEL. Mock mode (`?mock=1`) has no backend, so a voice ask
 * there gets this one fixed answer instead of a Nemotron call. The room still
 * runs the real path on it (guess, skeleton, parseDeal → applyCard →
 * placeCards), so shots and takes work without a key. Nothing is sent and
 * nothing is measured: the dev readout says so.
 */
export const STAND_IN_ANSWER = `{"card":"poll","settings":{"question":"saturday dinner?","options":["tacos","pho","pizza"]}}`;
