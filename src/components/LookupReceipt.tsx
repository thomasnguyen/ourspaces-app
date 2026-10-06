import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Receipt } from "../../convex/tavily";
import "./lookup.css";

const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, "");

/** The drawer's lookup section (convex/tavily.ts), laid out as a receipt: the line, then what Tavily was asked,
    where the city came from, the time per step and credits, who picked and the fact it used; each place kept
    with the row's own line and its page; the skipped ones grouped by why; what landed. Dev drawer only. */
export function LookupReceipt({ at, ids }: { at: number; ids: string[] }) {
  const slug = /#\/space\/([^/?]+)/.exec(window.location.hash)?.[1];
  const space = useQuery(api.spaces.getBySlug, slug ? { slug } : "skip");
  const widgetId = ids.find((id) => /^[a-z0-9]{32}$/.test(id));
  const raw = useQuery(api.tavily.receipt, space && widgetId ? { spaceId: space._id, widgetId, since: at - 2000 } : "skip");
  if (!raw) return null;
  const r = JSON.parse(raw) as Partial<Receipt> & { line?: string; status?: string };
  const credits = (r.credits?.search ?? 0) + (r.credits?.extract ?? 0);
  const steps = [r.ms?.search !== undefined && `search ${r.ms.search}`, r.ms?.extract !== undefined && `extract ${r.ms.extract}`, r.ms?.pick !== undefined && `pick ${r.ms.pick}`].filter(Boolean).join(" · ");
  // skipped, grouped by why, in the order the reasons first appear
  const skipped = new Map<string, string[]>();
  for (const k of r.skipped ?? []) skipped.set(k.why, [...(skipped.get(k.why) ?? []), k.name]);
  return (
    <section className="lookup-receipt" data-testid="dev-context-lookup">
      <h3>the lookup (Tavily)</h3>
      <p className="lookup-receipt-line">{r.line}</p>
      {r.status === "running" ? (
        <p>running…</p>
      ) : (
        <>
          <dl className="lookup-receipt-facts">
            <dt>asked</dt>
            <dd>“{r.query}”</dd>
            <dt>near</dt>
            <dd>
              {r.city} <span className="lookup-receipt-dim">· {r.from}</span>
            </dd>
            <dt>took</dt>
            <dd>
              <b>{r.ms?.total} ms</b>
              {steps && <span className="lookup-receipt-dim"> · {steps}</span>}
            </dd>
            <dt>credits</dt>
            <dd>
              {credits}
              <span className="lookup-receipt-dim">
                {" "}
                · search {r.credits?.search ?? 0} · extract {r.credits?.extract ?? 0}
              </span>
            </dd>
            <dt>picked by</dt>
            <dd>
              {r.pickedBy ?? "—"}
              {r.fact && <span className="lookup-receipt-dim"> · used “{r.fact}”</span>}
              {r.status && r.status !== "ok" && <span className="dev-context-bad"> · {r.status}</span>}
            </dd>
          </dl>
          {(r.kept?.length ?? 0) > 0 && (
            <>
              <h4>kept · {r.kept!.length}</h4>
              <ol className="lookup-receipt-kept">
                {r.kept!.map((k) => (
                  <li key={k.name} data-testid="dev-context-lookup-kept">
                    <b>{k.name}</b>
                    <span>
                      <span className="lookup-receipt-src">
                        {k.rating !== undefined && <b>{k.rating}</b>}
                        {k.rating !== undefined && " "}
                        {k.reviews !== undefined && `${k.reviews.toLocaleString("en-US")} reviews · `}
                        {k.host}
                      </span>
                      <a href={k.url} target="_blank" rel="noreferrer">
                        {short(k.url)}
                      </a>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {skipped.size > 0 && (
            <>
              <h4>skipped · {r.skipped!.length}</h4>
              <ol className="lookup-receipt-skipped">
                {[...skipped].map(([why, names]) => (
                  <li key={why}>
                    <span>{why}</span>
                    <span>
                      {names.slice(0, 4).map((n, i) => (
                        <span key={n}>
                          {i > 0 && ", "}
                          <s>{n.length > 34 ? `${n.slice(0, 32)}…` : n}</s>
                        </span>
                      ))}
                      {names.length > 4 && <span className="lookup-receipt-dim"> +{names.length - 4}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {r.landed && <p className="lookup-receipt-landed">{r.landed}</p>}
        </>
      )}
    </section>
  );
}
