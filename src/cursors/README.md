# Cursor styles

Presence cursors are a core part of OurSpaces. Styles live here so we can
prototype many looks without touching the space canvas.

## Add a new style

1. Create a component in `styles.tsx` that takes `CursorProps`
   (`name`, `color`, optional `showFace`).
2. Register it in `registry.ts` (`CURSOR_STYLES` array).
3. Open `/#/cursors` — it appears in the lab automatically.

## Swap the live canvas cursor

Change `DEFAULT_CURSOR_STYLE_ID` in `registry.ts`.

## Prompt for more variants

> Add 10 new cursor styles to `src/cursors/styles.tsx` and register them in
> `registry.ts`. Each must accept `CursorProps`. Match the scrapbook /
> lived-in feel from `docs/the-feel.md`. Don't change the lab page — it
> reads the registry.
