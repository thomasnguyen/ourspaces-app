const FIRST_RUN_KEY = "ourspaces:buildclub-first-run";
const VISITOR_COUNT_KEY = "ourspaces:buildclub-visitors";
const BASE_VISITORS = 312;

let firstRunPending: boolean | null = null;
let visitorCount: number | null = null;

export function getBuildClubFirstRunPending(): boolean {
  if (firstRunPending !== null) return firstRunPending;
  if (typeof window === "undefined") return false;

  firstRunPending = window.localStorage.getItem(FIRST_RUN_KEY) !== "done";
  return firstRunPending;
}

export function completeBuildClubFirstRun(): void {
  firstRunPending = false;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(FIRST_RUN_KEY, "done");
  }
}

export function getBuildClubVisitorCount(): number {
  if (visitorCount !== null) return visitorCount;
  if (typeof window === "undefined") return BASE_VISITORS;

  const stored = window.localStorage.getItem(VISITOR_COUNT_KEY);
  visitorCount = stored ? Number.parseInt(stored, 10) : BASE_VISITORS;
  return visitorCount;
}

export function incrementBuildClubVisitorCount(): number {
  const next = getBuildClubVisitorCount() + 1;
  visitorCount = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VISITOR_COUNT_KEY, String(next));
  }
  return next;
}
