import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Receipt } from "../../convex/tavily";

/** The drawer's lookup section (convex/tavily.ts): what Tavily was asked, where the city came from, each step's
    ms and credits, the places kept with their source line and the ones skipped with why. Dev drawer only. */
export function LookupReceipt({ at, ids }: { at: number; ids: string[] }) {
  const slug = /#\/space\/([^/?]+)/.exec(window.location.hash)?.[1];
  const space = useQuery(api.spaces.getBySlug, slug ? { slug } : "skip");
  const widgetId = ids.find((id) => /^[a-z0-9]{32}$/.test(id));
  const raw = useQuery(api.tavily.receipt, space && widgetId ? { spaceId: space._id, widgetId, since: at - 2000 } : "skip");
  if (!raw) return null;
  const r = JSON.parse(raw) as Partial<Receipt> & { line?: string; status?: string };
  return (
    <section data-testid="dev-context-lookup">
      <h3>the lookup (Tavily)</h3>
      <p>{r.line}</p>
      {r.status === "running" ? (
        <p>running…</p>
      ) : (
        <ol className="dev-context-list">
          <li>
            query: <code>{r.query}</code> · near {r.city} · {r.from}
          </li>
          <li>
            ms: search {r.ms?.search ?? "—"}
            {r.ms?.extract !== undefined && ` · extract ${r.ms.extract}`}
            {r.ms?.pick !== undefined && ` · pick ${r.ms.pick}`} · whole lookup {r.ms?.total} · credits {(r.credits?.search ?? 0) + (r.credits?.extract ?? 0)}
          </li>
          <li>
            picked by {r.pickedBy ?? "—"}
            {r.fact ? ` · used: “${r.fact}”` : ""} · {r.status}
          </li>
          {r.kept?.map((k) => (
            <li key={k.name} data-testid="dev-context-lookup-kept">
              kept <b>{k.name}</b> · {k.source} · <code>{k.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</code>
            </li>
          ))}
          {r.skipped?.slice(0, 8).map((k, i) => (
            <li key={i}>
              skipped {k.name} ({k.host}): {k.why}
            </li>
          ))}
          <li>{r.landed}</li>
        </ol>
      )}
    </section>
  );
}
