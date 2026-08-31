import type { Widget } from "../data/types";
import { getStickerDefinition } from "../data/stickers";

export function widgetLabel(widget: Widget): string {
  switch (widget.type) {
    case "frame":
      return String(widget.data.title ?? "frame");
    case "sticker":
      return getStickerDefinition(widget.data.stickerId)?.label ?? "sticker";
    case "poll":
      return String(widget.data.question ?? "poll");
    case "countdown":
      return String(
        widget.data.event ?? `${widget.data.value ?? "?"} ${widget.data.unit ?? "days left"}`,
      );
    case "potluck":
      return String(widget.data.title ?? "potluck");
    case "rsvp":
      return String(widget.data.title ?? "rsvp");
    case "dailyQ":
      return String(widget.data.question ?? "daily q");
    case "media":
      return String(widget.data.caption ?? "photo");
    case "photoWall":
      return "photo wall";
    case "note":
      return String(widget.data.text ?? "note").slice(0, 32);
    case "chat":
      return "space chat";
    case "sports":
      return "live score";
    case "itinerary":
      return String(widget.data.title ?? "itinerary");
    case "availability":
      return String(widget.data.title ?? "availability");
    case "linkShelf":
      return String(widget.data.title ?? "saved links");
    case "linkCard":
      return String(widget.data.title || widget.data.siteName || "web post");
    case "jokeRegistry":
      return String(widget.data.title ?? "inside jokes");
    case "expenseSplit":
      return String(widget.data.title ?? "expense split");
    case "playlist":
      return String(widget.data.title ?? "playlist");
    case "weather":
      return String(widget.data.event ?? "weather");
    case "decision":
      return String(widget.data.title ?? "decision receipt");
    case "quote":
      return "quote of the week";
    case "backendLive":
      return "live backend";
    case "wheel":
      return String(widget.data.title ?? "spin wheel");
    case "dualClock":
      return String(widget.data.title ?? "two clocks");
    case "cozyColor":
      return String(widget.data.title ?? "color together");
    case "linkPile":
      return String(widget.data.title ?? "the pile");
    case "hotLinks":
      return String(widget.data.title ?? "hot now");
    case "shipPost":
      return String(widget.data.title ?? "ship post");
    case "roundtable":
      return String(widget.data.title ?? "roundtable");
    case "letter":
      return String(widget.data.subject ?? "letter");
    default:
      return widget.type;
  }
}
