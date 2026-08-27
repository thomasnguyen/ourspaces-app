import { useEffect, useMemo, useState } from "react";
import type { CountdownData } from "../lib/widgets";

type CountdownProps = { data: CountdownData };

const DAY_MS = 86_400_000;
const MAX_SEGMENTS = 14;

const toneClasses: Record<string, string> = {
  violet: "bg-crew text-white",
  blush: "bg-couple text-white",
  butter: "bg-trip text-white",
  mint: "bg-league text-white",
  sky: "bg-fam text-white",
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function localMidnight(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).getTime();
}

const pad2 = (value: number) => String(value).padStart(2, "0");

export function Countdown({ data }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const target = useMemo(
    () => (data.targetDate ? localMidnight(data.targetDate) : null),
    [data.targetDate],
  );

  useEffect(() => {
    if (target === null) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [target]);

  const remaining = target === null ? null : target - now;
  const isToday = remaining !== null && remaining <= 0;
  const days =
    remaining === null ? null : Math.max(0, Math.floor(remaining / DAY_MS));
  const display = isToday ? "today" : String(days ?? "—");
  const unit = isToday ? "it's here 🎉" : days === 1 ? "day!" : "days!";
  const remainder = remaining !== null && remaining > 0 ? remaining % DAY_MS : 0;
  const tick = `+ ${pad2(Math.floor(remainder / 3_600_000))}h ${pad2(
    Math.floor((remainder % 3_600_000) / 60_000),
  )}m ${pad2(Math.floor((remainder % 60_000) / 1000))}s`;

  const dateLabel = isToday
    ? "today"
    : target === null
      ? "soon"
      : new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
        })
          .format(target)
          .toLowerCase();

  const segments = useMemo(() => {
    if (!data.startDate || target === null) return null;
    const totalDays = Math.max(
      1,
      Math.round((target - localMidnight(data.startDate)) / DAY_MS),
    );
    const count = Math.min(totalDays, MAX_SEGMENTS);
    const elapsed = Math.min(totalDays, Math.max(0, totalDays - (days ?? 0)));
    const done = isToday ? count : Math.round((elapsed / totalDays) * count);
    return Array.from({ length: count }, (_, index) =>
      index < done ? "done" : index === done && !isToday ? "now" : "todo",
    );
  }, [data.startDate, days, isToday, target]);

  const tone = toneClasses[data.tone ?? "violet"] ?? toneClasses.violet;

  return (
    <article
      className={`relative flex h-full min-h-0 flex-col justify-end overflow-hidden rounded-card px-5 pb-5 pt-4 shadow-lg shadow-black/20 ${tone}${isToday ? " ring-2 ring-lime" : ""}`}
    >
      <span className="pointer-events-none absolute right-4 top-2 text-3xl opacity-25" aria-hidden="true">
        ✦
      </span>
      <span className="pointer-events-none absolute right-10 top-8 text-base opacity-20" aria-hidden="true">
        ✦
      </span>

      <div className="mb-auto flex flex-col items-start gap-1.5">
        {data.event && (
          <span className="-rotate-2 rounded-pill bg-sticker px-2.5 py-1 text-[10px] font-extrabold text-white">
            {data.event}
          </span>
        )}
        <span className="rounded-pill bg-black/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
          {dateLabel}
        </span>
      </div>

      <span className="relative block font-display text-[clamp(4.5rem,10vw,6.5rem)] font-extrabold leading-[0.72] tracking-[-0.06em]">
        {display}
      </span>
      <span className="mt-3 font-display text-2xl font-extrabold leading-none">
        {unit}
      </span>
      {data.targetDate && (
        <span className="mt-1.5 text-[10px] font-bold tabular-nums opacity-75">
          {isToday ? "hope it's a good one" : tick}
        </span>
      )}

      {data.hyped && data.hyped.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <div className="flex -space-x-2">
            {data.hyped.slice(0, 3).map((name, index) => (
              <span
                key={name}
                className={`grid size-6 place-items-center rounded-full border-2 border-current text-[8px] font-extrabold ${
                  ["bg-sticker", "bg-couple", "bg-fam"][index]
                } text-white`}
                title={name}
              >
                {initials(name)}
              </span>
            ))}
          </div>
          <em className="text-[10px] font-bold not-italic opacity-75">
            {data.hyped.length} hyped
          </em>
        </div>
      )}

      {segments && (
        <div className="absolute inset-x-0 bottom-0 flex h-1.5 gap-0.5" aria-hidden="true">
          {segments.map((state, index) => (
            <i
              key={index}
              className={`min-w-0 flex-1 ${
                state === "done"
                  ? "bg-current"
                  : state === "now"
                    ? "bg-lime"
                    : "bg-black/20"
              }`}
            />
          ))}
        </div>
      )}
    </article>
  );
}

export default Countdown;
