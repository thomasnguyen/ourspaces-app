import type { ChatMessage } from "../data/chat";
import { getStickerDefinition } from "../data/stickers";
import type { Widget, WidgetType } from "../data/types";

function restoreKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restoreKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => {
    if (!key.startsWith("__unicode_")) return [key, restoreKeys(child)];
    const chars = key.slice("__unicode_".length).split("_").map((code) => String.fromCodePoint(Number.parseInt(code, 16))).join("");
    return [chars, restoreKeys(child)];
  }));
}

export function relTime(createdAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function toWidget(row: {
  _id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  rotate?: number;
  data: unknown;
}): Widget {
  const data = restoreKeys(row.data) as Record<string, unknown>;
  const sticker =
    row.type === "sticker" ? getStickerDefinition(data.stickerId) : undefined;
  const supersededLinkCardSize =
    row.type === "linkCard" &&
    ((row.w === 420 && (row.h === 340 || row.h === 360)) ||
      (row.w === 340 && row.h === 280) ||
      (row.w === 300 && row.h === 250));

  return {
    id: row._id,
    type: row.type as WidgetType,
    x: row.x,
    y: row.y,
    w: sticker?.width ?? (supersededLinkCardSize ? 260 : row.w),
    h: sticker?.height ?? (supersededLinkCardSize ? 220 : row.h),
    z: row.z,
    rotate: sticker?.rotate ?? row.rotate,
    data,
  };
}

export function toChatMessage(row: {
  _id: string;
  authorName: string;
  authorColor?: string;
  authorEmoji?: string;
  authorAvatarUrl?: string;
  text: string;
  createdAt: number;
  promotable?: boolean;
}): ChatMessage {
  return {
    id: row._id,
    from: row.authorName,
    fromColor: row.authorColor,
    fromEmoji: row.authorEmoji,
    fromAvatarUrl: row.authorAvatarUrl,
    text: row.text,
    time: relTime(row.createdAt),
    promotable: row.promotable,
  };
}
