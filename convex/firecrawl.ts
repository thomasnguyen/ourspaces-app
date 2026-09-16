import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { ActionRetrier } from "@convex-dev/action-retrier";
import { ActionCache } from "@convex-dev/action-cache";
import { components, internal } from "./_generated/api";
import { action, internalAction, internalMutation, query } from "./_generated/server";
import { logWork } from "./work";

const firecrawl = new FirecrawlClient(components.firecrawl);
// action-retrier: Firecrawl scrapes hit a real network + a third-party API —
// retry transient failures with backoff instead of failing the save on the
// first blip. Kept behind scrapeLinkRetried's sync-looking contract by
// polling the run to completion.
const retrier = new ActionRetrier(components.actionRetrier, { maxFailures: 2 });
// action-cache: the same URL gets re-saved a lot (a link re-shared into
// another space, a mail-dropped link that was already scraped) — skip the
// retry+network round trip entirely on a cache hit. TTL matches the
// firecrawl.scrape() maxAge below so both layers agree on freshness.
const scrapeCache = new ActionCache(components.actionCache, {
  action: internal.firecrawl.scrapeLinkRetried,
  name: "scrapeLink-v1",
  ttl: 3_600_000,
});

const linkCardScrapeValidator = v.object({
  url: v.string(),
  title: v.string(),
  description: v.string(),
  imageUrl: v.string(),
  siteName: v.string(),
  author: v.string(),
  publishedAt: v.string(),
  discussionUrl: v.string(),
  points: v.number(),
  commentCount: v.number(),
});

function textValue(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function plainSummary(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

type HnStory = {
  discussionUrl: string;
  articleUrl: string;
  title: string;
  author: string;
  publishedAt: string;
  points: number;
  commentCount: number;
};

/** An HN item link points at the comments page; resolve the story it links to. */
async function resolveHnStory(parsed: URL): Promise<HnStory | null> {
  const id = parsed.searchParams.get("id");
  if (parsed.hostname.replace(/^www\./, "") !== "news.ycombinator.com" || !id) {
    return null;
  }
  const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
  if (!response.ok) return null;
  const item = recordValue(await response.json());
  if (!item.title) return null;
  return {
    discussionUrl: `https://news.ycombinator.com/item?id=${id}`,
    articleUrl: textValue(item.url),
    title: textValue(item.title),
    author: textValue(item.by),
    publishedAt: typeof item.time === "number"
      ? new Date(item.time * 1000).toISOString()
      : "",
    points: typeof item.score === "number" ? item.score : 0,
    commentCount: typeof item.descendants === "number" ? item.descendants : 0,
  };
}

/** One URL → a small, stable payload the canvas can persist as a link card.
 * Validates synchronously, then defers to the cache (which itself defers to
 * the retrier on a miss) so this keeps returning a plain value like a
 * normal action — callers (WidgetEditorPanel, the mail-drop router) never
 * see the cache or retry machinery. */
export const scrapeLink = action({
  // `spaceId` is optional and narration-only: pass it and the room says what
  // it is doing while it does it (convex/work.ts); leave it off and this is
  // the same action it always was. The callers that have a room pass one —
  // a link dropped on a canvas, an emailed link — and `batch.ts` (the stale
  // link sweep, which nobody is watching) does not.
  args: { url: v.string(), spaceId: v.optional(v.id("spaces")), runId: v.optional(v.string()) },
  returns: linkCardScrapeValidator,
  handler: async (ctx, args): Promise<{
    url: string;
    title: string;
    description: string;
    imageUrl: string;
    siteName: string;
    author: string;
    publishedAt: string;
    discussionUrl: string;
    points: number;
    commentCount: number;
  }> => {
    const url = args.url.includes("://") ? args.url : `https://${args.url}`;
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Use a webpage link");
    }
    const domain = parsed.hostname.replace(/^www\./, "");
    const spaceId = args.spaceId;
    // Deliberately wraps the cache rather than living inside scrapeLinkOnce:
    // a cache hit is still the board waiting on this call, and moving the
    // narration inside would also change the cached action's args — and so
    // its cache key — for every caller.
    const runId = args.runId ?? `link-${Date.now().toString(36)}`;
    if (spaceId) {
      await logWork(ctx, {
        spaceId, runId, kind: "link", step: "fetch", status: "running",
        line: `fetching ${domain}`, subject: domain,
      });
    }
    try {
      const page = await scrapeCache.fetch(ctx, { url });
      if (spaceId) {
        await logWork(ctx, {
          spaceId, runId, kind: "link", step: "fetch", status: "done",
          line: page.title ? `read “${page.title}”` : `read ${domain}`, subject: domain,
        });
      }
      return page;
    } catch (error) {
      if (spaceId) {
        await logWork(ctx, {
          spaceId, runId, kind: "link", step: "fetch", status: "failed",
          line: `couldn't read ${domain}`, subject: domain,
        });
      }
      throw error;
    }
  },
});

export const scrapeLinkRetried = internalAction({
  args: { url: v.string() },
  returns: linkCardScrapeValidator,
  handler: async (ctx, { url }) => {
    const runId = await retrier.run(ctx, internal.firecrawl.scrapeLinkOnce, { url });
    // A real page scrape (+ retries with backoff on top) can run well past
    // a few seconds — poll generously rather than give up early.
    for (let attempt = 0; attempt < 60; attempt++) {
      const status = await retrier.status(ctx, runId);
      if (status.type === "completed") {
        await retrier.cleanup(ctx, runId);
        if (status.result.type === "success") return status.result.returnValue;
        throw new Error(
          status.result.type === "failed" ? status.result.error : "Scrape canceled",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Scrape timed out");
  },
});

export const scrapeLinkOnce = internalAction({
  args: { url: v.string() },
  returns: linkCardScrapeValidator,
  handler: async (ctx, { url }) => {
    const parsed = new URL(url);

    // HN comment links: scrape the article the story points at, keep the
    // discussion metadata. Text posts (Ask HN) have no article — scrape HN.
    const hn = await resolveHnStory(parsed);
    const targetUrl = hn?.articleUrl || parsed.toString();

    const page = await firecrawl.scrape(ctx, targetUrl, {
      formats: [
        "markdown",
        "summary",
        "images",
        {
          type: "json",
          prompt:
            "Return exactly: title, description (one plain sentence), imageUrl, siteName, author, and publishedAt. Use empty strings when a field is missing.",
        },
      ],
      onlyMainContent: true,
      removeBase64Images: true,
      maxAge: 3_600_000,
    });

    const extracted = recordValue(page.json);
    const metadata = page.metadata ?? {};
    const canonicalUrl = textValue(metadata.sourceURL, metadata.url, targetUrl);
    const canonicalDomain = new URL(canonicalUrl).hostname.replace(/^www\./, "");
    const markdownSummary = plainSummary(page.markdown ?? "");

    return {
      url: canonicalUrl,
      title: textValue(extracted.title, metadata.title, hn?.title, canonicalDomain).slice(0, 140),
      description: plainSummary(textValue(
        extracted.description,
        page.summary,
        metadata.description,
        markdownSummary,
        "Saved for the group. Open it when you’re ready.",
      )),
      imageUrl: textValue(
        extracted.imageUrl,
        extracted.image,
        metadata.ogImage,
        metadata.image,
        page.images?.[0],
      ),
      siteName: textValue(extracted.siteName, metadata.ogSiteName, canonicalDomain),
      // For Ask HN text posts, the submitter is the author.
      author: textValue(extracted.author, metadata.author, hn?.articleUrl ? "" : hn?.author),
      publishedAt: textValue(
        extracted.publishedAt,
        metadata.publishedTime,
        metadata.articlePublishedTime,
        hn?.publishedAt,
      ),
      discussionUrl: hn?.discussionUrl ?? "",
      points: hn?.points ?? 0,
      commentCount: hn?.commentCount ?? 0,
    };
  },
});

/* ── Firecrawl search: "research a topic" → cards for the build room pile ─── */

const searchHitValidator = v.object({
  url: v.string(),
  title: v.string(),
  description: v.string(),
  imageUrl: v.string(),
  siteName: v.string(),
});

/** One query → up to `limit` web results, shaped like the link cards the pile
 *  already renders. Uses firecrawl.search (web-search-then-clean) — a different
 *  Firecrawl surface than the single-URL scrape above. */
export const searchTopic = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    spaceId: v.optional(v.id("spaces")), // narration only, see scrapeLink
  },
  returns: v.array(searchHitValidator),
  handler: async (ctx, { query, limit, spaceId }) => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const runId = `search-${Date.now().toString(36)}`;
    if (spaceId) {
      await logWork(ctx, {
        spaceId, runId, kind: "search", step: "search", status: "running",
        line: `searching the web for “${trimmed}”`, subject: trimmed,
      });
    }
    // Clamped: `limit` is caller-supplied and Firecrawl bills per credit.
    const response = await firecrawl.search(ctx, trimmed, {
      limit: Math.min(20, Math.max(1, limit ?? 8)),
    });
    const hits = (response.web ?? []).map((raw) => {
      const item = recordValue(raw);
      const url = textValue(item.url);
      if (!url) return null;
      let domain = "";
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
      const metadata = recordValue(item.metadata);
      return {
        url,
        title: textValue(item.title, metadata.title, domain).slice(0, 140),
        description: plainSummary(
          textValue(item.description, item.summary, metadata.description),
        ),
        imageUrl: textValue(metadata.ogImage, metadata.image),
        siteName: textValue(metadata.ogSiteName, domain),
      };
    });
    const found = hits.filter((hit): hit is NonNullable<typeof hit> => hit !== null);
    if (spaceId) {
      await logWork(ctx, {
        spaceId, runId, kind: "search", step: "search", status: "done",
        line: found.length === 0
          ? `nothing good for “${trimmed}”`
          : `found ${found.length} page${found.length === 1 ? "" : "s"} on “${trimmed}”`,
        subject: trimmed,
      });
    }
    return found;
  },
});

/* ── Firecrawl streaming crawl: "add a whole site" → pages stream in live ──── */

/** Start a durable crawl. Pages land in the Firecrawl component's own tables;
 *  the UI subscribes reactively via listCrawlPages/getCrawlStatus below rather
 *  than copying every page into one widget doc. */
export const crawlSite = action({
  args: {
    url: v.string(),
    limit: v.optional(v.number()),
    spaceId: v.optional(v.id("spaces")), // narration only, see scrapeLink
  },
  returns: v.object({ crawlId: v.string() }),
  handler: async (ctx, { url, limit, spaceId }) => {
    const normalized = url.includes("://") ? url : `https://${url}`;
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Use a website link");
    }
    if (spaceId) {
      const domain = parsed.hostname.replace(/^www\./, "");
      // Only the start: the crawl is durable and its pages already stream
      // into CrawlStrip reactively, so a line per page would be the board
      // narrating something the board is already showing.
      await logWork(ctx, {
        spaceId,
        runId: `crawl-${Date.now().toString(36)}`,
        kind: "crawl",
        step: "crawl",
        status: "running",
        line: `walking ${domain}`,
        subject: domain,
      });
    }
    const { crawlId } = await firecrawl.startCrawl(ctx, {
      url: normalized,
      options: {
        // Clamped for the same reason as searchTopic: the app never passes
        // `limit`, so an unclamped value only helps a caller that isn't us.
        limit: Math.min(50, Math.max(1, limit ?? 25)),
        scrapeOptions: { formats: ["markdown", "summary"], onlyMainContent: true },
      },
      onComplete: internal.firecrawl.crawlComplete,
    });
    return { crawlId };
  },
});

/** Terminal signal for a crawl. The live UI already reflects pages as they
 *  arrive, so this just logs completion for the flagship flow. */
export const crawlComplete = internalMutation({
  args: {
    crawlId: v.string(),
    jobId: v.optional(v.string()),
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    pageCount: v.number(),
    unstored: v.optional(v.number()),
    error: v.optional(v.string()),
    // `unknown` in the component's own onComplete payload type.
    context: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (_ctx, { crawlId, status, pageCount }) => {
    console.log(`crawl ${crawlId} ${status} — ${pageCount} pages`);
    return null;
  },
});

// Mirrors the component's exported `Crawl` type (@firecrawl/firecrawl-convex).
// `context` is `unknown` upstream — passthrough we never read — so v.any()
// here is the honest shape, not a missing validator.
const crawlValidator = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  jobId: v.optional(v.string()),
  url: v.string(),
  status: v.union(
    v.literal("scraping"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  mode: v.union(v.literal("webhook"), v.literal("poll")),
  storeContent: v.boolean(),
  total: v.optional(v.number()),
  completed: v.optional(v.number()),
  pageCount: v.number(),
  creditsUsed: v.optional(v.number()),
  unstored: v.optional(v.number()),
  error: v.optional(v.string()),
  context: v.optional(v.any()),
  finalized: v.boolean(),
  startedAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
});

// Mirrors the component's exported `CrawledPage` type. `json`,
// `changeTracking` and `metadata` are loose upstream too.
const crawledPageValidator = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  crawlId: v.string(),
  url: v.string(),
  markdown: v.optional(v.string()),
  html: v.optional(v.string()),
  rawHtml: v.optional(v.string()),
  summary: v.optional(v.string()),
  screenshot: v.optional(v.string()),
  links: v.optional(v.array(v.string())),
  json: v.optional(v.any()),
  changeTracking: v.optional(v.any()),
  metadata: v.optional(v.any()),
  truncated: v.boolean(),
  scrapedAt: v.number(),
});

/** Live crawl status (scraping/completed/…, page counts) for the results panel. */
export const getCrawlStatus = query({
  args: { crawlId: v.string() },
  returns: v.union(crawlValidator, v.null()),
  handler: async (ctx, { crawlId }) => await firecrawl.getCrawl(ctx, crawlId),
});

/** Paginated, reactive stream of crawled pages — feeds usePaginatedQuery. */
export const listCrawlPages = query({
  args: { crawlId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(crawledPageValidator),
  handler: async (ctx, { crawlId, paginationOpts }) =>
    await firecrawl.listPages(ctx, { crawlId, paginationOpts }),
});

/* ── Firecrawl parse: emailed documents → text the mail router can read ───── */

// Firecrawl's `/parse` endpoint wants a multipart upload; `/scrape` detects the
// file type and parses it identically when you already have a public URL. We
// always have a URL (AgentMail hands back a short-lived `download_url`), so
// this is a scrape with a pdf parser attached, not a separate surface.
const PARSEABLE = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "text/html",
];

/** Is this attachment worth spending a Firecrawl credit on? */
export function isParseable(contentType: string, filename: string): boolean {
  const type = contentType.toLowerCase().split(";")[0].trim();
  if (PARSEABLE.includes(type)) return true;
  return /\.(pdf|docx?|xlsx?|csv|txt|html?)$/i.test(filename);
}

/** One document URL → its text. Returns "" rather than throwing: a receipt we
 *  couldn't read must still route on the email body, never drop the email. */
export const parseDocument = internalAction({
  args: { url: v.string(), maxPages: v.optional(v.number()) },
  returns: v.object({ text: v.string(), title: v.string() }),
  handler: async (ctx, { url, maxPages }) => {
    try {
      const doc = await firecrawl.scrape(ctx, url, {
        formats: ["markdown"],
        parsers: [{ type: "pdf", mode: "auto", maxPages: maxPages ?? 10 }],
        onlyMainContent: true,
        removeBase64Images: true,
        maxAge: 0, // presigned URLs are single-use; a cached hit would be a lie
      });
      return {
        text: plainDocument(doc.markdown ?? ""),
        title: textValue(doc.metadata?.title),
      };
    } catch (error) {
      console.warn(`parseDocument failed for ${url.slice(0, 80)}: ${String(error)}`);
      return { text: "", title: "" };
    }
  },
});

/** Like plainSummary, but keeps the whole document — receipts are mostly
 *  numbers in tables and the router needs the amounts, not a 240-char teaser. */
function plainDocument(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8_000);
}
