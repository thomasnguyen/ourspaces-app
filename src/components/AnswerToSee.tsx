/**
 * "answer to see", drawn: what's hidden sits face down as paper slips until
 * the lock in `lib/answerToSee.ts` opens, then turns over once. The caller
 * decides what the slips are (one per player, one per rank) and what's under.
 */
import type { CSSProperties, ReactNode } from "react";
import { seeState, type SeeFacts, type SeeLock } from "../lib/answerToSee";
import "./answer-to-see.css";

export function AnswerToSee({
  lock,
  facts,
  cover,
  action,
  children,
  className = "",
  testId,
}: {
  lock: SeeLock;
  facts: SeeFacts;
  /** the face-down side: slips, usually */
  cover: ReactNode;
  /** the one thing to do about it ("play one →"), if any */
  action?: ReactNode;
  /** the face-up side */
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const state = seeState(lock, facts);
  return (
    <div className={`ats ${state.open ? "is-open" : "is-locked"} ${className}`} data-hides={lock.hides} data-by={state.by ?? undefined} data-testid={testId}>
      {state.open ? (
        <div className="ats-shown">{children}</div>
      ) : (
        <div className="ats-cover">
          {cover}
          <p className="ats-line">{state.line}</p>
          {action}
        </div>
      )}
    </div>
  );
}

/** One face-down slip. `down` = turned in; otherwise still an empty place. */
export function SeeSlip({ down, mark = "?", children, i = 0 }: { down: boolean; mark?: string; children?: ReactNode; i?: number }) {
  return (
    <span className={`ats-slip ${down ? "is-down" : "is-out"}`} style={{ "--i": i } as CSSProperties}>
      {children}
      <i aria-hidden="true">{down ? mark : ""}</i>
    </span>
  );
}
