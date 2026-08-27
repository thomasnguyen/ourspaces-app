import type { DailyQData } from "../lib/widgets";

type DailyQuestionProps = {
  data: DailyQData;
};

const toneClasses: Record<string, { card: string; muted: string }> = {
  butter: { card: "bg-trip text-white", muted: "text-white/75" },
  blush: { card: "bg-couple text-white", muted: "text-white/75" },
  mint: { card: "bg-league text-ink", muted: "text-ink/70" },
  sky: { card: "bg-fam text-white", muted: "text-white/75" },
  violet: { card: "bg-crew text-white", muted: "text-white/75" },
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

export function DailyQuestion({ data }: DailyQuestionProps) {
  const tone = toneClasses[data.tone ?? "butter"] ?? toneClasses.butter;
  const answers = data.answers ?? [];
  const waitingOn = data.waitingOn ?? [];

  return (
    <article
      className={`relative flex h-full min-h-0 flex-col overflow-hidden rounded-card p-5 shadow-[5px_5px_0_var(--color-sticker)] ${tone.card}`}
    >
      <span
        aria-hidden="true"
        className="absolute right-5 top-4 rotate-3 rounded-pill bg-sticker px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white"
      >
        today
      </span>

      <div className="mb-4 flex items-center gap-2 pr-20">
        <span className="h-2 w-2 rounded-full bg-lime" aria-hidden="true" />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-80">
          daily question
        </span>
        {data.streak != null && data.streak > 0 && (
          <span className="rounded-pill bg-black/15 px-2 py-0.5 text-[10px] font-bold">
            {data.streak} day streak 🔥
          </span>
        )}
      </div>

      <h2 className="max-w-[24rem] font-display text-[clamp(1.35rem,1.15rem+0.6vw,1.85rem)] font-extrabold leading-[1.02] tracking-[-0.04em]">
        {data.question}
      </h2>

      <div className="mt-5 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {answers.length === 0 ? (
          <p className={`rounded-card bg-black/10 px-3 py-3 text-sm font-semibold ${tone.muted}`}>
            no one&apos;s answered yet — go first 👀
          </p>
        ) : (
          answers.map((answer) => {
            const reactions = Object.entries(answer.reactions ?? {});

            return (
              <div
                key={`${answer.name}-${answer.text}`}
                className="relative flex items-start gap-2.5 rounded-card bg-black/10 px-3 py-2.5"
              >
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-current bg-sticker text-[9px] font-extrabold text-white"
                  title={answer.name}
                >
                  {initials(answer.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-extrabold uppercase tracking-[0.08em] opacity-70">
                    {answer.name}
                  </span>
                  <span className="mt-0.5 block text-sm font-semibold leading-snug">
                    {answer.text}
                  </span>
                  {reactions.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {reactions.map(([emoji, names]) => (
                        <span
                          key={emoji}
                          className="rounded-pill bg-sticker/20 px-1.5 py-0.5 text-[10px] font-bold"
                          title={names.join(", ")}
                        >
                          {emoji} {names.length > 1 ? names.length : ""}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className={`mt-4 flex min-h-7 items-center gap-2 text-xs font-semibold ${tone.muted}`}>
        {waitingOn.length > 0 ? (
          <>
            <span className="flex -space-x-1.5">
              {waitingOn.slice(0, 3).map((name) => (
                <span
                  key={name}
                  className="grid size-6 place-items-center rounded-full border-2 border-current bg-sticker text-[8px] font-extrabold text-white"
                  title={name}
                >
                  {initials(name)}
                </span>
              ))}
            </span>
            <span className="truncate">waiting on {waitingOn.join(" + ")}</span>
          </>
        ) : (
          <span>{answers.length === 0 ? "your turn" : `${answers.length} answered · everyone's in`}</span>
        )}
      </div>
    </article>
  );
}

export default DailyQuestion;
