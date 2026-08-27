import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const seedCrew = internalMutation({
  args: {},
  returns: v.union(v.id("spaces"), v.null()),
  handler: async (ctx) => {
    const existing = await ctx.db.query("spaces").withIndex("by_name", (q) => q.eq("name", "the crew")).unique();
    if (existing) return null;

    const now = Date.now();
    const spaceId = await ctx.db.insert("spaces", {
      name: "the crew", type: "ongoing", icon: "✦", color: "crew", createdAt: now, lastActivityAt: now,
    });
    const people = [
      ["maya", "Maya", "crew"], ["jules", "Jules", "couple"], ["sam", "Sam", "fam"],
      ["rio", "Rio", "trip"], ["kenji", "Kenji", "league"], ["ash", "Ash", "lime"],
    ];
    for (const [id, name, color] of people) {
      await ctx.db.insert("members", { spaceId, userId: `seed:${id}`, name, color, lastSeen: now });
    }
    const addWidget = async (type: string, x: number, y: number, w: number, h: number, z: number, data: unknown) =>
      await ctx.db.insert("widgets", { spaceId, type, x, y, w, h, z, data, createdBy: "seed:maya", createdAt: now });

    await addWidget("note", 70, 100, 280, 180, 3, {
      text: "remember when Rio got locked out in socks", authorName: "Ash", kicker: "inside joke hall of fame", tone: "warm", rotation: -2,
    });
    const summerPollId = await addWidget("poll", 70, 320, 330, 260, 3, {
      question: "where are we going this summer?", tone: "sky", options: [
        { id: "tahoe", label: "Tahoe" }, { id: "mexico", label: "Mexico City" }, { id: "coast", label: "the coast" },
      ],
    });
    await addWidget("dailyQuestion", 70, 630, 360, 260, 3, {
      question: "what would your walk-on song be?", tone: "blush", streak: 4,
      answers: [{ name: "Maya", text: "Dancing Queen, loudly." }, { name: "Kenji", text: "Anything with a bass line." }], waitingOn: ["Jules", "Rio", "Ash"],
    });
    const frameId = await addWidget("frame", 500, 80, 860, 620, 0, { title: "Maya's bday" });
    void frameId;
    await addWidget("countdown", 540, 150, 220, 260, 2, {
      targetDate: daysFromNow(5), startDate: daysFromNow(-2), event: "Maya's bday 🎂", tone: "violet", hyped: ["Maya", "Jules", "Sam", "Kenji"],
    });
    const cakePollId = await addWidget("poll", 790, 150, 320, 260, 3, {
      question: "cake flavor?", tone: "butter", options: [
        { id: "matcha", label: "matcha" }, { id: "chocolate", label: "chocolate" }, { id: "tres-leches", label: "tres leches" },
      ],
    });
    await addWidget("potluck", 540, 450, 570, 180, 3, {
      title: "birthday potluck", tone: "mint", items: [
        { id: "snacks", label: "snacks + chips", claimedBy: "seed:jules", claimedName: "Jules" },
        { id: "drinks", label: "something bubbly" }, { id: "candles", label: "candles" },
      ],
    });
    for (const [widgetId, userId, optionId] of [
      [summerPollId, "seed:maya", "tahoe"], [summerPollId, "seed:jules", "mexico"], [summerPollId, "seed:sam", "tahoe"],
      [cakePollId, "seed:maya", "matcha"], [cakePollId, "seed:jules", "matcha"], [cakePollId, "seed:sam", "chocolate"], [cakePollId, "seed:kenji", "matcha"], [cakePollId, "seed:rio", "tres-leches"],
    ] as const) await ctx.db.insert("votes", { widgetId, userId, optionId });
    return spaceId;
  },
});
