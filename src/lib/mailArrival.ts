/* The mail arrival — what an inbound email looks like on the canvas between
   the webhook and the filing (docs/mail-arrival.md). One clock for live (the
   emailEvents row, watched over Convex) and the #/mail lab (the same shape,
   fields landing on timers), so the beat can't drift between them. The
   component that draws it is components/MailArrival.tsx. */

export type MailKind = "receipt" | "booking" | "letter" | "links" | "unfiled" | "spam";

export type MailArrivalEvent = {
  id: string;
  from: string;
  subject: string;
  createdAt: number;
  /** the router started reading (processInbound) */
  readingAt?: number;
  /** the verdict — a MailKind once decided; the stamp word */
  label?: string;
  /** the router's one-line reason, already lowercase and id-free */
  because?: string;
  /** where it filed: the envelope flies to this widget's rect */
  widgetId?: string;
  /** the reply went out — `↩ told holly` */
  repliedAt?: number;
  hasDocument: boolean;
};

/** The narrated wait: opening · reading · deciding. Clocked off `createdAt`;
    the slip holds on the last step until `label` lands. */
export const MAIL_STAGE_AT_MS = [0, 700, 1600];
export const MAIL_SLOW_AFTER_MS = 7000;

export function mailStage(event: MailArrivalEvent, now: number, scale = 1): number {
  const age = (now - event.createdAt) / scale;
  let stage = 0;
  for (let index = 0; index < MAIL_STAGE_AT_MS.length; index += 1) {
    if (age >= MAIL_STAGE_AT_MS[index]) stage = index;
  }
  return stage;
}

export function mailSlow(event: MailArrivalEvent, now: number, scale = 1) {
  return (now - event.createdAt) / scale >= MAIL_SLOW_AFTER_MS;
}

/** `Holly Nguyen <holly@x.com>` → "holly"; bare address → the local part. */
export function mailSender(from: string): string {
  const display = from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim();
  const name = display || from.split("@")[0].replace(/[._-]+/g, " ").trim() || "someone";
  return name.split(/\s+/)[0].toLowerCase();
}

export function mailKind(label?: string): MailKind | null {
  if (!label) return null;
  if (["receipt", "booking", "letter", "links", "unfiled", "spam"].includes(label)) {
    return label as MailKind;
  }
  return "unfiled";
}

export function mailReadingLine(event: MailArrivalEvent, stage: number, slow: boolean) {
  if (slow) return "slow one — still reading";
  if (stage === 0) return "opening it";
  if (stage === 1) return event.hasDocument ? "reading the pdf" : "reading it";
  return "deciding";
}

/** Copy, plain and lowercase, no vendor names on the object. */
export const MAIL_COPY: Record<
  MailKind,
  { stamp: (event: MailArrivalEvent) => string; decided: string; filed: string }
> = {
  receipt: { stamp: () => "receipt", decided: "a receipt", filed: "filing it → expenses" },
  booking: { stamp: () => "booking", decided: "a booking", filed: "filing it → the trip" },
  letter: { stamp: () => "letter", decided: "a letter", filed: "sealed it onto the space" },
  links: {
    stamp: (event) => {
      const count = Number(event.because?.match(/^(\d+) link/)?.[1] ?? 0);
      return count > 0 ? `${count} link${count === 1 ? "" : "s"}` : "links";
    },
    decided: "links inside",
    filed: "→ the pile",
  },
  unfiled: { stamp: () => "not sure", decided: "not sure what this is", filed: "open me" },
  spam: { stamp: () => "spam", decided: "spam", filed: "tossed it" },
};

export function relMailTime(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)}h ago`;
}

/* ── the lab's fixtures: the same shape, fields landing on timers ─────────── */

const MOCK_MAIL: Record<
  MailKind,
  { from: string; subject: string; because?: string; hasDocument: boolean; replies: boolean }
> = {
  receipt: {
    from: "Holly <holly@example.com>",
    subject: "Fwd: Your order is confirmed — #4417",
    because: "it's the receipt for the cake, $126 from holly",
    hasDocument: true,
    replies: true,
  },
  booking: {
    from: "Holly <holly@example.com>",
    subject: "Fwd: booking confirmed — kyoto stay",
    because: "nov 11 has the kyoto stay now",
    hasDocument: false,
    replies: true,
  },
  letter: {
    from: "Thomas <thomas@example.com>",
    subject: "from the train",
    hasDocument: false,
    replies: true,
  },
  links: {
    from: "Sam <sam@example.com>",
    subject: "three for the pile",
    because: "3 links inside",
    hasDocument: false,
    replies: true,
  },
  unfiled: {
    from: "Deb <deb@example.com>",
    subject: "hi from portland",
    because: "not sure who this one is for",
    hasDocument: false,
    replies: true,
  },
  spam: {
    from: "deals@promo-blast.biz",
    subject: "LAST CHANCE: 80% off everything!!!",
    hasDocument: false,
    replies: false,
  },
};

export function mockMailEvent(kind: MailKind, now = Date.now()): MailArrivalEvent {
  const fixture = MOCK_MAIL[kind];
  return {
    id: `mock-mail-${now}`,
    from: fixture.from,
    subject: fixture.subject,
    createdAt: now,
    hasDocument: fixture.hasDocument,
  };
}

export const MOCK_MAIL_DECIDE_MS = 2600;
export const MOCK_MAIL_REPLY_MS = 1200;

/** The backend, faked: reading starts at once, the verdict + reason + widget
    land after ~2.6s, the reply ~1.2s after that. Returns a cancel. */
export function scheduleMockMail(
  event: MailArrivalEvent,
  kind: MailKind,
  apply: (id: string, patch: Partial<MailArrivalEvent>) => void,
  options: { scale?: number; widgetId?: string } = {},
) {
  const scale = options.scale ?? 1;
  const fixture = MOCK_MAIL[kind];
  const timers = [
    window.setTimeout(() => apply(event.id, { readingAt: Date.now() }), 120 * scale),
    window.setTimeout(
      () =>
        apply(event.id, {
          label: kind,
          because: fixture.because,
          widgetId: kind === "spam" ? undefined : options.widgetId,
        }),
      (MOCK_MAIL_DECIDE_MS + Math.random() * 300) * scale,
    ),
  ];
  if (fixture.replies) {
    timers.push(
      window.setTimeout(
        () => apply(event.id, { repliedAt: Date.now() }),
        (MOCK_MAIL_DECIDE_MS + MOCK_MAIL_REPLY_MS + 300) * scale,
      ),
    );
  }
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}
