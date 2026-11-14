// A small cache for the Guild pages' public answers: in memory, and in sessionStorage so a reload
// or the back button shows the guild at once. One request per key at a time; a caller decides how
// old an entry may be. Storage can be full or blocked: the cache then only lives in memory.

type Entry = { at: number; data: unknown };

const PREFIX = "gd-cache:";
/** Entries bigger than this stay in memory only (a 300-member guild is ~150 KB). */
const STORE_MAX_CHARS = 400_000;
/** The memory keeps the most recently used entries only. */
const MEMORY_MAX = 40;
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function readStored(key: string): Entry | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch {
    return null;
  }
}

function keep(key: string, entry: Entry): void {
  memory.delete(key);
  memory.set(key, entry);
  while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value as string);
}

/** The entry for `key` with its age in ms, or null. */
export function peek<T>(key: string, now = Date.now()): { data: T; age: number } | null {
  const entry = memory.get(key) ?? readStored(key);
  if (!entry) return null;
  keep(key, entry);
  return { data: entry.data as T, age: now - entry.at };
}

export function remember(key: string, data: unknown, now = Date.now()): void {
  const entry = { at: now, data };
  keep(key, entry);
  try {
    const text = JSON.stringify(entry);
    if (text.length <= STORE_MAX_CHARS) sessionStorage.setItem(PREFIX + key, text);
  } catch {
    // full or blocked storage: memory only
  }
}

export function forget(key: string): void {
  memory.delete(key);
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // nothing stored
  }
}

/**
 * Runs `load` once per key at a time and remembers its answer. `force` starts a new load even when
 * one is running: that one may carry an answer from before a change (a mark) and must not be reused.
 */
export function loadOnce<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
  const running = inflight.get(key);
  if (running && !force) return running as Promise<T>;
  const call: Promise<T> = load()
    .then((data) => {
      // a newer forced load may have replaced this one: its answer wins
      if (inflight.get(key) === call) remember(key, data);
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === call) inflight.delete(key);
    });
  inflight.set(key, call);
  return call;
}

/** For tests. */
export function clearCache(): void {
  memory.clear();
  inflight.clear();
}

export const MEMORY_LIMIT = MEMORY_MAX;
