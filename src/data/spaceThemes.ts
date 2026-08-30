import type { CSSProperties } from "react";
import type { SpaceMeta } from "./types";

export type SpaceThemeId =
  | "blush"
  | "lagoon"
  | "spruce"
  | "nightwall"
  | "white"
  | "violet"
  | "cobalt"
  | "mint"
  | "midnight"
  | "butter"
  | "custom";

export type SpaceCustomization = Pick<SpaceMeta, "name" | "tagline" | "icon" | "kind"> & {
  theme: SpaceThemeId;
  customBackground: string;
  accent: string;
};

export const SPACE_THEME_PRESETS: {
  id: Exclude<SpaceThemeId, "custom">;
  name: string;
  background: string;
  ink: string;
}[] = [
  { id: "blush", name: "blush", background: "#ffdad6", ink: "#111114" },
  { id: "lagoon", name: "lagoon", background: "#12a594", ink: "#ffffff" },
  { id: "spruce", name: "spruce", background: "#0f5c50", ink: "#ffffff" },
  { id: "nightwall", name: "night wall", background: "#211922", ink: "#ffffff" },
  { id: "white", name: "clean", background: "#f4f4f2", ink: "#111114" },
  { id: "violet", name: "violet", background: "#b7a7ff", ink: "#1b1532" },
  { id: "cobalt", name: "cobalt", background: "#3f70ff", ink: "#ffffff" },
  { id: "mint", name: "mint", background: "#bfe9dc", ink: "#102e27" },
  { id: "midnight", name: "midnight", background: "#1f1b2d", ink: "#ffffff" },
  { id: "butter", name: "butter", background: "#ffe9c2", ink: "#111114" },
];

export const SPACE_ACCENTS = [
  { name: "violet", value: "#7853ff" },
  { name: "pink", value: "#e9369d" },
  { name: "cobalt", value: "#3f70ff" },
  { name: "orange", value: "#ff7c42" },
  { name: "teal", value: "#13b8a6" },
  { name: "lime", value: "#c9ff3d" },
];

export function defaultSpaceCustomization(space: SpaceMeta): SpaceCustomization {
  const theme =
    space.id === "crew"
      ? "lagoon"
      : space.id === "buildclub"
      ? "cobalt"
      : space.id === "league"
        ? "mint"
        : space.id === "couple"
          ? "violet"
          : space.id === "house"
            ? "butter"
            : space.id === "trip"
              ? "midnight"
              : "blush";

  return {
    name: space.name,
    tagline: space.tagline,
    icon: space.icon,
    kind: space.kind,
    theme,
    customBackground: "#211922",
    accent: space.color,
  };
}

function readableInk(color: string) {
  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#111114";

  const [red, green, blue] = [0, 2, 4].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.58 ? "#111114" : "#ffffff";
}

type SpaceStyle = CSSProperties & Record<`--space-${string}`, string>;

export function spaceCustomizationStyle(customization: SpaceCustomization): SpaceStyle {
  const preset = SPACE_THEME_PRESETS.find((theme) => theme.id === customization.theme);
  const background =
    customization.theme === "custom"
      ? customization.customBackground
      : (preset?.background ?? "#211922");
  const ink =
    customization.theme === "custom"
      ? readableInk(customization.customBackground)
      : (preset?.ink ?? "#111114");

  return {
    "--space-heading-color": ink,
    "--space-muted-color": ink === "#ffffff" ? "rgba(255, 255, 255, 0.72)" : "#5f5055",
    "--space-accent": customization.accent,
    "--space-accent-ink": readableInk(customization.accent),
    ...(customization.theme === "custom"
      ? { backgroundColor: background, backgroundImage: "none" }
      : {}),
  };
}
