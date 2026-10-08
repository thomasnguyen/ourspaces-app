import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { LinkReceipt } from "../../convex/tavily";
import { PicLine } from "./LookupReceipt";
import "./lookup.css";

const short = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, "").replace(/\/$/, "");

/** A pasted link's receipt (convex/tavily.ts readRun): each read with its link, ms and credits, the search
    between them and why the site won, then what the card shows and what landed. */
export function LinkReadReceipt({ widgetId, since }: { widgetId: string; since: number }) {
  const slug = /#\/space\/([^/?]+)/.exec(window.location.hash)?.[1];
  const space = useQuery(api.spaces.getBySlug, slug ? { slug } : "skip");
  const raw = useQuery(api.tavily.receipt, space ? { spaceId: space._id, widgetId, since } : "skip");
  if (!raw) return null;
  const r = JSON.parse(raw) as Partial<LinkReceipt> & { line?: string; status?: string };
  const credits = (r.credits?.extract ?? 0) + (r.credits?.search ?? 0);
  return (
    <section className="lookup-receipt link-read-receipt" data-testid="dev-context-lookup">
      <h3>the post vs the page (Tavily)</h3>
      <p className="lookup-receipt-line">{r.shown ? <>{r.venue} · {r.shown}{r.struck && <> · <s>{r.struck}</s></>}</> : r.line}</p>
      {r.status === "running" ? (
        <p>running…</p>
      ) : (
        <>
          <dl className="lookup-receipt-facts">
            <dt>took</dt>
            <dd>
              <b>{r.ms?.total} ms</b>
              <span className="lookup-receipt-dim"> · paste to card, the whole chain</span>
            </dd>
            <dt>credits</dt>
            <dd>
              {credits}
              <span className="lookup-receipt-dim"> · extract {r.credits?.extract ?? 0} · search {r.credits?.search ?? 0}</span>
            </dd>
            <dt>picked by</dt>
            <dd>
              {r.pickedBy} <span className="lookup-receipt-dim">· no model writes a name or a number</span>
              {r.status && r.status !== "ok" && <span className="dev-context-bad"> · {r.status}</span>}
            </dd>
          </dl>
          <h4>reads · {r.reads?.length ?? 0}</h4>
          <ol className="lookup-receipt-kept link-read-reads">
            {(r.reads ?? []).map((x, i) => (
              <li key={i} data-testid="dev-context-read" data-role={x.role}>
                <b>
                  {i + 1} · {x.role === "post" ? "the post" : "the site"}
                  {x.fee !== undefined && <span className={x.role === "post" && r.struck ? "link-read-lost" : "link-read-won"}> {x.fee === 0 ? "free" : `$${x.fee}`}{x.cash ? " cash" : ""} sat</span>}
                </b>
                <span>
                  <span className="lookup-receipt-src">
                    extract {x.ms} ms · {x.credits ?? 0} credit{x.credits === 1 ? "" : "s"}
                  </span>
                  <a href={x.url} target="_blank" rel="noreferrer">
                    {short(x.url)}
                  </a>
                  {x.said && <q className="link-read-said">{x.said}</q>}
                </span>
              </li>
            ))}
          </ol>
          {r.search && (
            <>
              <h4>search between them</h4>
              <dl className="lookup-receipt-facts">
                <dt>asked</dt>
                <dd>“{r.query}”</dd>
                <dt>took</dt>
                <dd>
                  {r.search.ms} ms · {r.search.credits ?? 0} credit{r.search.credits === 1 ? "" : "s"}
                </dd>
                <dt>kept</dt>
                <dd>{r.search.picked ? <>{short(r.search.picked)} <span className="lookup-receipt-dim">· the venue's own domain</span></> : "none"}</dd>
                {r.search.skipped.length > 0 && (
                  <>
                    <dt>skipped</dt>
                    <dd>
                      {r.search.skipped.map((s, i) => (
                        <span key={i}>
                          {i > 0 && ", "}
                          <s>{s.host}</s>
                        </span>
                      ))}
                      <span className="lookup-receipt-dim"> · not its own domain</span>
                    </dd>
                  </>
                )}
              </dl>
            </>
          )}
          {r.why && <p className="lookup-receipt-dim link-read-why">{r.why}</p>}
          {(r.img || r.emoji) && (
            <p className="link-read-why">
              <PicLine img={r.img?.url} from={r.img?.from} emoji={r.emoji} />
            </p>
          )}
          {r.landed && <p className="lookup-receipt-landed">{r.landed}</p>}
        </>
      )}
    </section>
  );
}
