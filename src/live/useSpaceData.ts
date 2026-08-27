import { useEffect, useMemo } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Widget } from "../data/types";
import { toWidget } from "./adapt";
import { getDataMode } from "./dataMode";
import { readSpaceSnapshot, writeSpaceSnapshot } from "./snapshot";

export function useSpaceData(slug: string) {
  const mode = getDataMode() === "mock" ? "mock" : "live";
  const snapshot = useMemo(
    () => mode === "live" ? readSpaceSnapshot(slug) : undefined,
    [mode, slug],
  );
  const result = useQuery(api.spaces.getSpaceWithWidgets, mode === "live" ? { slug } : "skip");
  const space = result?.space;
  const liveWidgets: Widget[] | undefined = useMemo(
    () => mode === "live" && result ? result.widgets.map(toWidget) : undefined,
    [mode, result],
  );
  const widgets = result === undefined && snapshot?.widgets.length
    ? snapshot.widgets
    : liveWidgets;

  useEffect(() => {
    if (mode !== "live" || !result?.space) return;

    const timer = window.setTimeout(() => {
      writeSpaceSnapshot(slug, {
        name: result.space.name,
        canvasW: result.space.canvasW,
        canvasH: result.space.canvasH,
        widgets: result.widgets.map(toWidget),
        savedAt: Date.now(),
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [mode, result, slug]);

  return {
    mode,
    space,
    snapshot,
    liveSpaceId: space?._id,
    widgets,
    status: mode === "mock"
      ? "mock" as const
      : result === undefined
        ? snapshot?.widgets.length
          ? "cached" as const
          : "loading" as const
        : result.space === null
          ? "missing" as const
          : liveWidgets?.length
            ? "ready" as const
            : "empty" as const,
  };
}
