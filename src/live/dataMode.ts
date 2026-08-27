export type DataMode = "live" | "mock" | "missing";

export function explicitMockRequested() {
  const search = new URLSearchParams(window.location.search);
  const hashSearch = new URLSearchParams(
    window.location.hash.split("?")[1] ?? "",
  );

  return (
    search.get("mock") === "1" ||
    hashSearch.get("mock") === "1" ||
    import.meta.env.VITE_DATA_MODE === "mock"
  );
}

export function getDataMode(): DataMode {
  if (explicitMockRequested()) return "mock";
  return import.meta.env.VITE_CONVEX_URL ? "live" : "missing";
}
