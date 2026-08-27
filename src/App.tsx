import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Canvas } from "./components/Canvas";

export default function App() {
  const spaces = useQuery(api.spaces.listSpaces);
  const space = spaces?.[0];

  if (spaces === undefined) return <main className="grid h-full place-items-center bg-base text-lg font-extrabold">opening the wall…</main>;
  if (!space) return <main className="grid h-full place-items-center bg-base p-8"><div className="max-w-sm rounded-card bg-crew p-7 text-base"><p className="mb-3 text-sm font-bold">your crew is almost here</p><h1 className="text-4xl font-extrabold tracking-tight">nothing on the wall yet.</h1></div></main>;
  return <main className="h-full overflow-hidden"><Canvas spaceId={space._id} /></main>;
}
