/** The deck: what a model can deal, how a card becomes a widget, where it lands. */
export { CATALOG, CARD_IDS, cardSize, footprint, getCard } from "./catalog";
export type { Card, CardContext, CardId, DealtCard } from "./catalog";
export { applyCard, checkCard } from "./apply";
export type { Applied, CardCheck } from "./apply";
export { placeCards, placeReason, stackParts } from "./place";
export type { PlaceRoom, Placement, Rect } from "./place";
export { catalogJson, dealTurn, deckPrompt, parseDeal, roomContext } from "./prompt";
export type { Deal, DealItem } from "./prompt";
export { guessCard, parsePartialCard, sentenceHangs, skeletonWidget, titleFromWords } from "./guess";
export {
  BOARD_LETTERS, cardLine, dealTurnV2, deckPromptV2, decideMessages, DECIDE_CHOICES, DECIDE_LETTERS, parseDealResolved, routeAsk, scrubTokens, tokenMenu,
} from "./promptV2";
export type { AskRoute, ResolvedItem } from "./promptV2";
export { resolveCard } from "./resolve";
export type { Resolved, ResolveNote, RoomFacts } from "./resolve";
export { boardItems, existingFor, titleOfWidget } from "./existing";
export type { BoardItem, ExistingCheck } from "./existing";
