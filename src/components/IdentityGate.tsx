import { useEffect, useState, type FormEvent } from "react";
import {
  getIdentity,
  IDENTITY_COLORS,
  saveIdentity,
  type Identity,
} from "../lib/identity";

type IdentityGateProps = {
  onComplete: (identity: Identity) => void;
};

export function IdentityGate({ onComplete }: IdentityGateProps) {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(IDENTITY_COLORS[0]);

  useEffect(() => {
    const existing = getIdentity();
    if (existing) onComplete(existing);
    setReady(true);
  }, [onComplete]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identity = saveIdentity(name, color);
    onComplete(identity);
  };

  if (!ready) return null;

  return (
    <main className="grid min-h-full place-items-center bg-base px-6 py-10 text-ink">
      <section className="w-full max-w-md rounded-card bg-crew p-6 shadow-[8px_8px_0_var(--color-sticker)] sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-pill bg-sticker px-3 py-2 text-sm font-extrabold">
            <span className="text-lime" aria-hidden="true">⦿</span>
            ourspaces
          </div>
          <span className="-rotate-2 rounded-pill bg-lime px-3 py-2 text-xs font-extrabold text-base">
            live together
          </span>
        </div>

        <h1 className="max-w-xs text-4xl font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-5xl">
          who&apos;s on the wall?
        </h1>
        <p className="mt-4 max-w-sm text-base font-medium leading-7 text-white/85">
          Pick a name and a color. Your crew will see you pop in.
        </p>

        <form className="mt-8" onSubmit={submit}>
          <label className="block text-sm font-extrabold" htmlFor="identity-name">
            your name
          </label>
          <input
            autoFocus
            id="identity-name"
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. maya"
            required
            value={name}
            className="mt-2 w-full rounded-pill border-0 bg-sticker px-5 py-4 text-base font-bold text-ink outline-none placeholder:text-muted focus:ring-4 focus:ring-lime"
          />

          <fieldset className="mt-7">
            <legend className="text-sm font-extrabold">your color</legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {IDENTITY_COLORS.map((identityColor, index) => {
                const selected = identityColor === color;
                return (
                  <button
                    aria-label={`Choose color ${index + 1}`}
                    aria-pressed={selected}
                    className={`h-11 w-11 rounded-full border-4 transition-transform hover:-translate-y-1 ${selected ? "border-ink scale-110" : "border-transparent"}`}
                    key={identityColor}
                    onClick={() => setColor(identityColor)}
                    style={{ backgroundColor: identityColor }}
                    type="button"
                  />
                );
              })}
            </div>
          </fieldset>

          <button
            className="mt-8 flex w-full items-center justify-between rounded-pill bg-sticker px-5 py-4 text-left text-base font-extrabold transition-transform hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!name.trim()}
            type="submit"
          >
            step into the space <span aria-hidden="true" className="text-2xl text-lime">→</span>
          </button>
        </form>
      </section>
    </main>
  );
}

export default IdentityGate;
