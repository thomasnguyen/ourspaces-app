import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { playSound } from "../lib/sounds";

/** Live view of a Firecrawl durable crawl: pages stream in reactively via the
 *  component's own listPages, each keepable into the build room pile. The strip
 *  is the realtime showcase — pages appear as Firecrawl finds them. */
type CrawlPage = {
  _id: string;
  url: string;
  summary?: string;
  metadata?: ({ title?: string; description?: string } & Record<string, unknown>) | null;
};

export function CrawlStrip({
  crawlId,
  onKeep,
  onClose,
}: {
  crawlId: string;
  onKeep: (hit: { url: string; title: string; description: string }) => void;
  onClose: () => void;
}) {
  const status = useQuery(api.firecrawl.getCrawlStatus, { crawlId }) as
    | { status?: string; pageCount?: number; url?: string }
    | null
    | undefined;
  const { results } = usePaginatedQuery(
    api.firecrawl.listCrawlPages,
    { crawlId },
    { initialNumItems: 40 },
  );
  const pages = results as CrawlPage[];
  const done = Boolean(status?.status && status.status !== "scraping");
  const count = status?.pageCount ?? pages.length;

  return (
    <div className="crawl-strip" role="dialog" aria-label="Crawl results">
      <header className="crawl-strip-head">
        <span>
          <b className={done ? "" : "is-live"} aria-hidden="true">
            {done ? "✓" : "◴"}
          </b>{" "}
          <strong>{done ? "crawled" : "crawling"}</strong> {status?.url ?? "site"}
          <em> · {count} page{count === 1 ? "" : "s"}</em>
        </span>
        <button type="button" onClick={onClose}>
          done
        </button>
      </header>
      <ul className="crawl-strip-list">
        {pages.map((page) => {
          const title = page.metadata?.title || page.url;
          const desc = page.summary || page.metadata?.description || "";
          return (
            <li key={page._id}>
              <span className="crawl-strip-row">
                <strong>{title}</strong>
                {desc && <em>{desc}</em>}
              </span>
              <button
                type="button"
                onClick={() => {
                  onKeep({ url: page.url, title, description: desc });
                  playSound("place");
                }}
              >
                + pile
              </button>
            </li>
          );
        })}
        {pages.length === 0 && <li className="crawl-strip-empty">reaching the site…</li>}
      </ul>
    </div>
  );
}
