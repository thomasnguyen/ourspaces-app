import { useSpaceData } from "./useSpaceData";

export function useLiveSpace(slug = "crew") {
  const data = useSpaceData(slug);
  return { ...data, widgets: data.widgets ?? [] };
}
