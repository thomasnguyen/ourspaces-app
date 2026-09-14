import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import schema from "./schema";
import type { LetterData } from "./widgetData";
import { pollTallies } from "./votes";
import { memberCounts } from "./spaces";
import { SPACES_BY_ID } from "../src/data/spaces";

/**
 * migrations component: stateful, resumable backfills over `widgets`, run
 * once per shape change instead of a hand-rolled cursor loop. Real job:
 * normalize legacy widget data now that widgets.data is a typed union
 * instead of v.any() (see convex/widgetData.ts).
 */
export const migrations = new Migrations(components.migrations, { schema });

// The mail router always sets `unfiled` on letters it creates (inbox.ts
// addLetter), but seeded letters predate that field. Default them to
// "filed" so the unfiled-mail badge (extras.tsx LetterWidget) stays accurate.
export const normalizeLetterUnfiled = migrations.define({
  table: "widgets",
  migrateOne: async (_ctx, widget) => {
    if (widget.type !== "letter") return;
    const data = widget.data as LetterData;
    if (data.unfiled === undefined) {
      return { data: { ...data, unfiled: false } };
    }
  },
});

// One-time backfill: the pollTallies/memberCounts aggregates started empty
// on install, so existing votes/members rows need to be walked in once.
// insertIfDoesNotExist keeps this idempotent if it's re-run.
export const backfillPollTallies = migrations.define({
  table: "votes",
  migrateOne: async (ctx, vote) => {
    await pollTallies.insertIfDoesNotExist(ctx, vote);
  },
});

export const backfillMemberCounts = migrations.define({
  table: "members",
  migrateOne: async (ctx, member) => {
    await memberCounts.insertIfDoesNotExist(ctx, member);
  },
});

// Display names live in the mock catalog (src/data/spaces.ts) and reach the
// database only through seeding — but `seedMissing` skips spaces that already
// exist, so renaming a showcase room there never lands on rows that are
// already live. This walks the seeded rooms and patches `name` to match the
// catalog. Slugs are never touched: they are the ids the whole app routes on,
// and a rename is meant to be display-only.
//
// Written for the 2026-09-13 rename (the crew → the group chat, us two →
// long distance, the build room → the dev guild), but it is a sync, not a
// one-shot: re-run it after any future rename. Idempotent.
export const syncSpaceNames = migrations.define({
  table: "spaces",
  migrateOne: async (_ctx, space) => {
    // An unset ownerId is what marks a seeded/showcase row (see schema.ts).
    // Never rename a space a person made, even if they picked a slug the
    // catalog also uses.
    if (space.ownerId !== undefined) return;
    const meta = SPACES_BY_ID[space.slug ?? ""];
    if (!meta || space.name === meta.name) return;
    return { name: meta.name };
  },
});

export const run = migrations.runner();
export const runBackfills = migrations.runner([
  internal.migrations.backfillPollTallies,
  internal.migrations.backfillMemberCounts,
]);
