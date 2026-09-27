import type { LinkQuestion } from "../lib/linkQuestions";

/** The reading circle: each AI conversation starter is its own thread.
 * Rendered at the top of the thread dock when a web post is zoomed. */
export function LinkQuestionStrip({
  questions,
  activeId,
  counts,
  onPick,
}: {
  questions: LinkQuestion[];
  activeId: string;
  counts: Record<string, number>;
  onPick: (questionId: string) => void;
}) {
  if (questions.length === 0) return null;

  // One starter needs no tabs — show it as the thread's standing question.
  if (questions.length === 1) {
    return (
      <div className="thread-question-strip">
        <span className="thread-question-kicker">
          <i aria-hidden="true">✦</i> conversation starter
        </span>
        <p className="thread-question-single">
          <i aria-hidden="true">q1</i>
          <span>{questions[0].text}</span>
        </p>
      </div>
    );
  }

  const activeIndex = questions.findIndex((question) => question.id === activeId);
  return (
    <div className="thread-question-strip">
      <span className="thread-question-kicker">
        <i aria-hidden="true">✦</i> conversation starters
      </span>
      {questions.map((question, index) => {
        const count = counts[question.id] ?? 0;
        return (
          <button
            key={question.id}
            type="button"
            className={question.id === activeId ? "is-active" : ""}
            onClick={() => onPick(question.id)}
          >
            <i aria-hidden="true">q{index + 1}</i>
            <span>{question.text}</span>
            <em>{count > 0 ? count : "go first"}</em>
          </button>
        );
      })}
      {activeIndex >= 0 ? (
        <span className="thread-question-scope">
          ↳ takes on q{activeIndex + 1}
        </span>
      ) : null}
    </div>
  );
}
