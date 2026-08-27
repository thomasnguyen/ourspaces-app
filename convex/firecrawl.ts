import { v } from "convex/values";
import { FirecrawlClient } from "@firecrawl/firecrawl-convex";
import { components } from "./_generated/api";
import { action } from "./_generated/server";

const firecrawl = new FirecrawlClient(components.firecrawl);

/** One URL → { title, description, image, price/hours/address if present, markdown }. */
export const scrapeLink = action({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    return await firecrawl.scrape(ctx, url, {
      formats: [
        "markdown",
        {
          type: "json",
          prompt:
            "Return title, description (one sentence), image url, and if present: price, hours, address.",
        },
      ],
      onlyMainContent: true,
      maxAge: 3_600_000,
    });
  },
});
