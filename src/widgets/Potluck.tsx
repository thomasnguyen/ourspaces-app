import type { PotluckData } from "../lib/widgets";

export type PotluckProps = {
  data: PotluckData;
};

const toneClasses: Record<string, { accent: string; soft: string; fill: string; muted: string }> = {
  mint: { accent: "text-league", soft: "bg-league/10", fill: "bg-league", muted: "text-league/80" },
  blush: { accent: "text-couple", soft: "bg-couple/10", fill: "bg-couple", muted: "text-couple/80" },
  butter: { accent: "text-trip", soft: "bg-trip/10", fill: "bg-trip", muted: "text-trip/80" },
  sky: { accent: "text-fam", soft: "bg-fam/10", fill: "bg-fam", muted: "text-fam/80" },
  violet: { accent: "text-crew", soft: "bg-crew/10", fill: "bg-crew", muted: "text-crew/80" },
};

export function Potluck({ data }: PotluckProps) {
  const tone = toneClasses[data.tone ?? "mint"] ?? toneClasses.mint;
  const coveredCount = data.items.filter(
    (item) => Boolean(item.claimedBy || item.claimedName),
  ).length;
  const openCount = data.items.length - coveredCount;

  return (
    <article className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-card bg-ink p-5 text-base shadow-[5px_5px_0_var(--color-sticker)]">
      <span className={`pointer-events-none absolute right-4 top-3 text-4xl font-extrabold leading-none opacity-25 ${tone.accent}`} aria-hidden="true">
        ✦
      </span>
      <span className={`pointer-events-none absolute right-12 top-10 text-lg font-extrabold leading-none opacity-20 ${tone.accent}`} aria-hidden="true">
        ✦
      </span>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`text-[0.68rem] font-extrabold uppercase tracking-[0.08em] ${tone.muted}`}>
              party prep
            </span>
            <h2 className="mt-1 text-xl font-extrabold leading-tight tracking-[-0.03em]">
              {data.title}
            </h2>
          </div>
          <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-extrabold ${tone.soft} ${tone.muted}`}>
            {coveredCount} covered
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <strong className="font-display text-2xl font-extrabold leading-none tracking-[-0.04em]">
            {coveredCount}/{data.items.length}
          </strong>
          <span className={`text-xs font-bold ${tone.muted}`}>
            {openCount === 0 && data.items.length > 0 ? "all set" : `${openCount} still open`}
          </span>
          <span className="ml-auto flex min-w-16 flex-1 gap-1" aria-hidden="true">
            {Array.from({ length: Math.max(1, data.items.length) }, (_, index) => (
              <i
                key={index}
                className={`h-1.5 min-w-0 flex-1 rounded-pill ${
                  index < coveredCount ? tone.fill : "bg-ink/10"
                }`}
              />
            ))}
          </span>
        </div>

        {data.items.length > 0 ? (
          <ul className="m-0 mt-4 grid min-h-0 flex-1 list-none grid-cols-1 gap-2 overflow-auto p-0 sm:grid-cols-2">
            {data.items.map((item) => {
              const claimed = Boolean(item.claimedBy || item.claimedName);
              return (
                <li
                  key={item.id}
                  className={`flex min-w-0 items-center gap-2 rounded-pill px-2.5 py-2 ${claimed ? tone.soft : "bg-ink/5"}`}
                >
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-md border text-xs font-extrabold ${
                      claimed ? `${tone.accent} border-current` : "border-ink/20 text-muted"
                    }`}
                    aria-hidden="true"
                  >
                    {claimed ? "✓" : "+"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-extrabold">
                    {item.label}
                    {claimed && item.claimedName && (
                      <small className={`block truncate text-[10px] font-semibold ${tone.muted}`}>
                        by {item.claimedName}
                      </small>
                    )}
                  </span>
                  <span className={`shrink-0 rounded-pill bg-sticker px-2 py-1 text-[10px] font-extrabold text-white`}>
                    {claimed ? "covered" : "open"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-card bg-ink/5 p-4 text-center">
            <span className={`text-2xl ${tone.accent}`} aria-hidden="true">✦</span>
            <p className="mt-2 text-sm font-bold text-muted">nothing on the list yet</p>
          </div>
        )}
      </div>
    </article>
  );
}

export default Potluck;
