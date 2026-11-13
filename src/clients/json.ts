// Shared JSON shape helpers for the PISTE clients. Response bodies are read field by field; a
// missing required field throws `shape(...)`, which the callers report as an unexpected response.

export type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const shape = (detail: string) => new Error(detail);

export function asObj(v: unknown, what: string): Obj {
  if (!isObj(v)) throw shape(`${what} is not an object`);
  return v;
}

/** A required non-empty string field. */
export function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw shape(`missing ${key}`);
  return v;
}

/** An optional string field: `null` when absent or not a string. */
export function optStr(o: Obj, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' ? v : null;
}

/** A list of objects; absent or null is empty unless `required`. */
export function list(o: Obj, key: string, required = false): Obj[] {
  const v = o[key];
  if (!required && (v === undefined || v === null)) return [];
  if (!Array.isArray(v) || !v.every(isObj)) throw shape(`${key} is not a list of objects`);
  return v;
}

/** The entries of an object keyed by id or date; absent or null is empty. */
export function keyed(o: Obj, key: string): Array<[string, Obj]> {
  const v = o[key];
  if (v === undefined || v === null) return [];
  const entries = Object.entries(asObj(v, key));
  if (!entries.every(([, e]) => isObj(e))) throw shape(`${key} holds a non-object entry`);
  return entries as Array<[string, Obj]>;
}

export function lookup<T>(table: Readonly<Record<string, T>>, key: string | null, fallback: T): T {
  return key !== null && Object.hasOwn(table, key) ? (table[key] as T) : fallback;
}
