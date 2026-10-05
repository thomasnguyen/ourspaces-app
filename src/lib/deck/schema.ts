/**
 * The deck's settings schemas: a tiny field DSL that does three jobs at once —
 * types the settings (`Infer`), checks model output (`checkSettings`, never
 * throws), and prints itself for the prompt (`describeSettings`).
 */

type Base<T> = { optional?: boolean; default?: T };

export type TextField = Base<string> & { kind: "text"; max: number };
export type NumberField = Base<number> & { kind: "number"; min: number; max: number; int?: boolean };
export type EnumField<V extends string = string> = Base<V> & { kind: "enum"; values: readonly V[] };
export type ListField = Base<string[]> & { kind: "list"; min: number; max: number; itemMax: number };
export type RowsField<K extends string = string> = Base<Record<K, string>[]> & {
  kind: "rows";
  keys: readonly K[];
  min: number;
  max: number;
  itemMax: number;
};
export type DateField = Base<string> & { kind: "date" };
export type ZoneField = Base<string> & { kind: "zone" };

export type Field =
  | TextField
  | NumberField
  | EnumField
  | ListField
  | RowsField
  | DateField
  | ZoneField;

export type Schema = Record<string, Field>;

type ValueOf<F extends Field> = F extends EnumField<infer V>
  ? V
  : F extends NumberField
    ? number
    : F extends ListField
      ? string[]
      : F extends RowsField<infer K>
        ? Record<K, string>[]
        : string;

type IsOptional<F> = F extends { optional: true } ? true : false;

/** Settings as `applyCard` sees them: defaults filled, optionals maybe absent. */
export type Infer<S extends Schema> = {
  [K in keyof S as IsOptional<S[K]> extends true ? never : K]: ValueOf<S[K]>;
} & {
  [K in keyof S as IsOptional<S[K]> extends true ? K : never]?: ValueOf<S[K]>;
};

// Builders keep literal enum values and `optional: true` in the inferred type.
export const text = <O extends Partial<Omit<TextField, "kind">>>(max: number, o?: O) =>
  ({ kind: "text", max, ...o }) as TextField & O;
export const num = <O extends Partial<Omit<NumberField, "kind" | "min" | "max">>>(
  min: number,
  max: number,
  o?: O,
) => ({ kind: "number", min, max, int: true, ...o }) as NumberField & O;
export const oneOf = <const V extends string, O extends Partial<Base<V>>>(values: readonly V[], o?: O) =>
  ({ kind: "enum", values, ...o }) as EnumField<V> & O;
export const list = <O extends Partial<Omit<ListField, "kind" | "min" | "max">>>(
  min: number,
  max: number,
  o?: O,
) => ({ kind: "list", min, max, itemMax: 40, ...o }) as ListField & O;
export const rows = <const K extends string, O extends Partial<Base<Record<K, string>[]> & { itemMax: number }>>(
  keys: readonly K[],
  min: number,
  max: number,
  o?: O,
) => ({ kind: "rows", keys, min, max, itemMax: 48, ...o }) as RowsField<K> & O;
export const date = <O extends Partial<Base<string>>>(o?: O) => ({ kind: "date", ...o }) as DateField & O;
export const zone = <O extends Partial<Base<string>>>(o?: O) => ({ kind: "zone", ...o }) as ZoneField & O;

/** How a field reads in the prompt: short, the way the spike's deck read. */
function describeField(f: Field): string {
  const opt = f.optional || f.default !== undefined ? "?" : "";
  switch (f.kind) {
    case "text":
      return `string${opt}`;
    case "number":
      return `number ${f.min}-${f.max}${opt}`;
    case "enum":
      return opt ? `(${f.values.join("|")})?` : f.values.join("|");
    case "list":
      return `string[] ${f.min}-${f.max}${opt}`;
    case "rows":
      return `{${f.keys.join(",")}}[] ${f.min}-${f.max}${opt}`;
    case "date":
      return `YYYY-MM-DD${opt}`;
    case "zone":
      return `IANA time zone${opt}`;
  }
}

export function describeSettings(schema: Schema): Record<string, string> {
  return Object.fromEntries(Object.entries(schema).map(([k, f]) => [k, describeField(f)]));
}

export type Checked<T> = { ok: true; value: T; notes: string[] } | { ok: false; reason: string };

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Model output is loose: accept "14" for 14, "a, b, c" for a list, and say what was bent. */
function checkField(key: string, f: Field, raw: unknown, notes: string[]): Checked<unknown> {
  const bad = (why: string): Checked<unknown> => ({ ok: false, reason: `${key}: ${why}` });
  const ok = (value: unknown): Checked<unknown> => ({ ok: true, value, notes });
  switch (f.kind) {
    case "text": {
      if (typeof raw === "number") raw = String(raw);
      if (typeof raw !== "string" || !raw.trim()) return bad("expected text");
      const s = raw.trim();
      if (s.length > f.max) notes.push(`${key} cut to ${f.max} chars`);
      return ok(clip(s, f.max));
    }
    case "number": {
      const n = typeof raw === "string" ? Number(raw.replace(/[^0-9.-]/g, "")) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return bad("expected a number");
      const v = Math.min(f.max, Math.max(f.min, f.int ? Math.round(n) : n));
      if (v !== n) notes.push(`${key} ${n} → ${v}`);
      return ok(v);
    }
    case "enum": {
      const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const hit = f.values.find((v) => v.toLowerCase() === s);
      return hit ? ok(hit) : bad(`expected one of ${f.values.join("|")}`);
    }
    case "list": {
      const arr =
        typeof raw === "string" ? raw.split(/\s*[,;\n]\s*/) : Array.isArray(raw) ? raw : null;
      if (!arr) return bad("expected a list");
      const items = arr
        .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""))
        .filter(Boolean)
        .map((s) => clip(s, f.itemMax));
      if (items.length < f.min) return bad(`needs at least ${f.min} items, got ${items.length}`);
      if (items.length > f.max) notes.push(`${key} kept first ${f.max} of ${items.length}`);
      return ok(items.slice(0, f.max));
    }
    case "rows": {
      if (!Array.isArray(raw)) return bad("expected a list of objects");
      const out: Record<string, string>[] = [];
      for (const r of raw) {
        if (!r || typeof r !== "object") continue;
        const row: Record<string, string> = {};
        for (const k of f.keys) {
          const v = (r as Record<string, unknown>)[k];
          row[k] = typeof v === "string" || typeof v === "number" ? clip(String(v).trim(), f.itemMax) : "";
        }
        if (f.keys.some((k) => row[k])) out.push(row);
      }
      if (out.length < f.min) return bad(`needs at least ${f.min} rows, got ${out.length}`);
      if (out.length > f.max) notes.push(`${key} kept first ${f.max} of ${out.length}`);
      return ok(out.slice(0, f.max));
    }
    case "date": {
      const s = typeof raw === "string" ? raw.trim().slice(0, 10) : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00`).getTime()))
        return bad("expected YYYY-MM-DD");
      return ok(s);
    }
    case "zone": {
      const s = typeof raw === "string" ? raw.trim() : "";
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: s });
        return s ? ok(s) : bad("expected an IANA time zone");
      } catch {
        return bad(`unknown time zone ${s}`);
      }
    }
  }
}

/** Checks a model's settings object against a schema. Never throws. */
export function checkSettings<S extends Schema>(schema: S, raw: unknown): Checked<Infer<S>> {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "settings is a string, not an object" };
    }
  }
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const notes: string[] = [];
  const out: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(schema)) {
    const v = input[key];
    if (v === undefined || v === null || v === "") {
      if (f.default !== undefined) out[key] = f.default;
      else if (!f.optional) return { ok: false, reason: `${key}: missing` };
      continue;
    }
    const r = checkField(key, f, v, notes);
    if (!r.ok) {
      if (f.optional || f.default !== undefined) {
        notes.push(`${r.reason} (dropped)`);
        if (f.default !== undefined) out[key] = f.default;
        continue;
      }
      return r;
    }
    out[key] = r.value;
  }
  const extra = Object.keys(input).filter((k) => !(k in schema));
  if (extra.length) notes.push(`ignored ${extra.join(", ")}`);
  return { ok: true, value: out as Infer<S>, notes };
}
