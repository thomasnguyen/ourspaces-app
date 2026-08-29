import { v } from "convex/values";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { components } from "./_generated/api";
import { action } from "./_generated/server";

const firecrawl = new FirecrawlClient(components.firecrawl);

const linkCardScrapeValidator = v.object({
  url: v.string(),
  title: v.string(),
  description: v.string(),
  imageUrl: v.string(),
  siteName: v.string(),
  author: v.string(),
  publishedAt: v.string(),
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

/** One URL → a small, stable payload the canvas can persist as a link card. */
export const scrapeLink = action({
  args: { url: v.string() },
  returns: linkCardScrapeValidator,
  handler: async (ctx, args) => {
    const url = args.url.includes("://") ? args.url : `https://${args.url}`;
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Use a webpage link");
    }

    const page = await firecrawl.scrape(ctx, parsed.toString(), {
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
    const canonicalUrl = textValue(metadata.sourceURL, metadata.url, url);
    const canonicalDomain = new URL(canonicalUrl).hostname.replace(/^www\./, "");
    const markdownSummary = plainSummary(page.markdown ?? "");

    return {
      url: canonicalUrl,
      title: textValue(extracted.title, metadata.title, canonicalDomain).slice(0, 140),
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
      author: textValue(extracted.author, metadata.author),
      publishedAt: textValue(
        extracted.publishedAt,
        metadata.publishedTime,
        metadata.articlePublishedTime,
      ),
    };
  },
});
