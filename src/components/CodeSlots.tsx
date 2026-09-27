import { useEffect, useRef, useState } from "react";

/**
 * Six slots, not a text field. Typing a code is the one moment in joining
 * where your hands are on the product, so it gets to feel like something:
 * each digit lands with a pop, and the sixth submits on its own.
 *
 * One real input underneath, six painted boxes on top — the input carries the
 * caret and the paste, the boxes carry the personality.
 */
export function CodeSlots({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Which slot just received a digit, so only that one animates — animating
  // all six on every keystroke reads as noise.
  const [landed, setLanded] = useState(-1);
  const fired = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (value.length === 6 && !fired.current) {
      fired.current = true;
      onComplete(value);
    }
    if (value.length < 6) fired.current = false;
  }, [value, onComplete]);

  const slots = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  const cursor = Math.min(value.length, 5);

  return (
    <div
      className="code-slots"
      onClick={() => inputRef.current?.focus()}
      role="presentation"
    >
      <input
        ref={inputRef}
        className="code-slots-input"
        value={value}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
          if (digits.length > value.length) setLanded(digits.length - 1);
          onChange(digits);
        }}
        aria-label="The six-digit code from your email"
      />
      {slots.map((digit, i) => (
        <span
          key={i}
          className={`code-slot${digit ? " is-filled" : ""}${
            i === cursor && value.length < 6 ? " is-next" : ""
          }${i === landed && digit ? " just-landed" : ""}`}
          aria-hidden="true"
        >
          {digit}
        </span>
      ))}
    </div>
  );
}
