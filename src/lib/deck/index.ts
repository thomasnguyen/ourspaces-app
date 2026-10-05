/** The deck: what a model can deal, how a card becomes a widget, where it lands. */
export { CATALOG, CARD_IDS, cardSize, footprint, getCard } from "./catalog";
export type { Card, CardContext, CardId, DealtCard } from "./catalog";
export { applyCard, checkCard } from "./apply";
export type { Applied, CardCheck } from "./apply";
export { placeCards } from "./place";
export type { PlaceRoom, Placement, Rect } from "./place";
export { catalogJson, dealTurn, deckPrompt, parseDeal } from "./prompt";
export type { Deal, DealItem } from "./prompt";
