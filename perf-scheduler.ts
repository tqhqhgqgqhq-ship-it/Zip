/* ══════════════════════════════════════════════════════════════════
   FLAGSHIP PERFORMANCE SCHEDULER
   Real, working performance primitives — no ceremony, just wins.
   ══════════════════════════════════════════════════════════════════ */

/** Run non-critical work when the browser is idle, so it never competes
 *  with UI rendering. Falls back to a low-priority timeout. */
export const idle = (cb: () => void, timeout = 2000): number => {
  if (typeof (window as any).requestIdleCallback === "function") {
    return (window as any).requestIdleCallback(cb, { timeout });
  }
  return window.setTimeout(cb, 1) as unknown as number;
};

export const cancelIdle = (id: number) => {
  if (typeof (window as any).cancelIdleCallback === "function") {
    (window as any).cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
};

/** Batch multiple state updates so React commits ONCE per frame. */
let _rafQueued = false;
const _rafBatch: Array<() => void> = [];
export const raf = (cb: () => void) => {
  _rafBatch.push(cb);
  if (_rafQueued) return;
  _rafQueued = true;
  requestAnimationFrame(() => {
    _rafQueued = false;
    const batch = _rafBatch.splice(0);
    for (const fn of batch) fn();
  });
};

/** Aggressive network request dedupe — never fire the same URL twice in-flight. */
const _dedupe = new Map<string, Promise<any>>();
export function dedupedFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = _dedupe.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => _dedupe.delete(key));
  _dedupe.set(key, p);
  return p as Promise<T>;
}

/** Global visibility gate — polls should skip while the app is hidden. */
export const isAppVisible = () => !document.hidden;

/** Efficient debounce with proper cleanup. */
export function debounce<T extends (...args: any[]) => any>(fn: T, wait: number): T & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, wait);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => { if (t) { clearTimeout(t); t = null; } };
  return wrapped;
}

/** Simple LRU-ish memory cache with hard size cap — prevents heap bloat. */
export class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number = 200) {}
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      // touch to mark most-recent
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: K, value: V) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
  has(key: K) { return this.map.has(key); }
  delete(key: K) { this.map.delete(key); }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}
