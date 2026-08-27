import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Canvas } from "./components/Canvas";
import { IdentityGate } from "./components/IdentityGate";
import { getIdentity, type Identity } from "./lib/identity";

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(() => getIdentity());
  const spaces = useQuery(api.spaces.listSpaces);
  const joinSpace = useMutation(api.members.joinSpace);
  const space = spaces?.[0];

  useEffect(() => { if (identity && space) void joinSpace({ spaceId: space._id, ...identity }); }, [identity, joinSpace, space]);

  if (!identity) return <IdentityGate onComplete={setIdentity} />;

  if (spaces === undefined) return <main className="grid h-full place-items-center bg-base text-lg font-extrabold">opening the wall…</main>;
  if (!space) return <main className="grid h-full place-items-center bg-base p-8"><div className="max-w-sm rounded-card bg-crew p-7 text-base"><p className="mb-3 text-sm font-bold">your crew is almost here</p><h1 className="text-4xl font-extrabold tracking-tight">nothing on the wall yet.</h1></div></main>;
  return <main className="h-full overflow-hidden"><Canvas spaceId={space._id} identity={identity} /></main>;
}
