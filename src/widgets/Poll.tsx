import type { PollData } from "../lib/widgets";

type PollResults = Record<string, { count: number; voterNames: string[] }>;

export type PollProps = {
  data: PollData;
  results?: PollResults;
};

const toneClasses: Record<string, { card: string; muted: string; fill: string }> = {
  blush: {
    card: "bg-couple text-white",
    muted: "text-white/75",
    fill: "bg-sticker/20",
  },
  butter: {
    card: "bg-trip text-ink",
    muted: "text-ink/70",
    fill: "bg-ink/15",
  },
  mint: {
    card: "bg-league text-ink",
    muted: "text-ink/70",
    fill: "bg-ink/15",
  },
  sky: {
    card: "bg-fam text-white",
    muted: "text-white/75",
    fill: "bg-sticker/20",
  },
  violet: {
    card: "bg-crew text-white",
    muted: "text-white/75",
    fill: "bg-sticker/20",
  },
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Poll({ data, results = {} }: PollProps) {
  const tone = toneClasses[data.tone ?? "blush"] ?? toneClasses.blush;
  const totalVotes = data.options.reduce(
    (total, option) => total + (results[option.id]?.count ?? 0),
    0,
  );
  const leadingVotes = Math.max(
    0,
    ...data.options.map((option) => results[option.id]?.count ?? 0),
  );

  return (
    <article className={`relative flex h-full min-h-0 flex-col rounded-card p-5 ${tone.card}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="max-w-[75%] text-xl font-extrabold leading-tight tracking-[-0.03em]">
          {data.question}
        </h2>
        <span className="sticker-pill inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-sticker px-2.5 py-1 text-xs font-bold text-white">
          <i className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
          live
        </span>
      </div>

      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 p-0">
        {data.options.map((option) => {
          const result = results[option.id];
          const votes = result?.count ?? 0;
          const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const leading = totalVotes > 0 && votes === leadingVotes && votes > 0;
          const voters = result?.voterNames ?? [];

          return (
            <li key={option.id} className="min-h-0 flex-1">
              <div
                className={`relative flex h-full min-h-12 items-center gap-2 overflow-hidden rounded-pill bg-black/10 px-3 py-2 ${
                  leading ? "ring-2 ring-current" : ""
                }`}
              >
                <span
                  className={`absolute inset-y-0 left-0 ${tone.fill} transition-[width] duration-300`}
                  style={{ width: `${percent}%` }}
                  aria-hidden="true"
                />
                <span className="relative z-10 h-4 w-4 shrink-0 rounded-full border-2 border-current opacity-80" aria-hidden="true" />
                <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-bold">
                  {option.label}
                </span>
                {voters.length > 0 && (
                  <span className="relative z-10 flex shrink-0 -space-x-1.5" aria-label={`${voters.length} voters`}>
                    {voters.slice(0, 3).map((name) => (
                      <span
                        key={name}
                        className="grid h-6 w-6 place-items-center rounded-full border-2 border-current bg-sticker text-[9px] font-extrabold text-white"
                        title={name}
                      >
                        {initials(name)}
                      </span>
                    ))}
                    {voters.length > 3 && (
                      <span className="grid h-6 min-w-6 place-items-center rounded-full border-2 border-current bg-sticker px-1 text-[9px] font-extrabold text-white">
                        +{voters.length - 3}
                      </span>
                    )}
                  </span>
                )}
                {totalVotes > 0 && (
                  <span className="relative z-10 min-w-7 text-right text-sm font-extrabold tabular-nums">
                    {votes}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className={`mt-4 text-xs font-semibold ${tone.muted}`}>
        {totalVotes === 0 ? "no votes yet" : `${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}`}
      </p>
    </article>
  );
}

export default Poll;
