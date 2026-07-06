/**
 * ═══════════════════════════════════════════════════════════════
 * NUDGEL RENDER ENGINE v2.0
 * ─────────────────────────────────────────────────────────────
 * Central shared rendering resource system.
 * Provides:
 *   • Shared gradient cache (zero recompute per-component)
 *   • Shared shadow cache
 *   • Shared blur texture cache
 *   • Object pool for reusable JS objects
 *   • FPS monitor + adaptive quality manager
 *   • Scroll velocity tracker (quality scaling)
 *   • Component sleep manager
 *   • Global animation scheduler (frame-budget-aware)
 *   • URL/string memoization (eliminates repeated string allocs)
 * ═══════════════════════════════════════════════════════════════
 */

/* ─── String / URL interning ──────────────────────────────────
   Identical strings (e.g. fallback avatar URLs, gradient strings)
   share a single reference — no repeated string allocations.
   ─────────────────────────────────────────────────────────── */
const _strIntern = new Map<string, string>();
export function intern(s: string): string {
  let v = _strIntern.get(s);
  if (!v) { v = s; _strIntern.set(s, s); }
  return v;
}

/* ─── Shared avatar URL cache ──────────────────────────────── */
const _avatarCache = new Map<string, string>();
export function getAvatarUrl(name: string, style: 'initials' | 'group' = 'initials'): string {
  const key = style + ':' + name;
  let url = _avatarCache.get(key);
  if (!url) {
    const bg = style === 'group' ? 'D8AD5A,A87527' : 'f1ede7,ebe4d7';
    url = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name || 'U')}&backgroundColor=${bg}&fontWeight=600`;
    _avatarCache.set(key, url);
  }
  return url;
}

/* ─── Shared gradient string cache ───────────────────────────
   Caches CSS gradient strings by their parameters.
   Eliminates string rebuilds in hot render paths.
   ─────────────────────────────────────────────────────────── */
const _gradientCache = new Map<string, string>();
export function cachedGradient(key: string, builder: () => string): string {
  let v = _gradientCache.get(key);
  if (!v) { v = builder(); _gradientCache.set(key, v); }
  return v;
}

/* Pre-computed immutable gradient strings for hot components */
export const GRADIENTS = {
  goldConic: intern('conic-gradient(from 210deg, #8F6420 0%, #D9AE5F 12%, #FFF0CC 25%, #E2B566 38%, #9C7126 52%, #C8963F 68%, #F3D392 80%, #B07F2C 92%, #8F6420 100%)'),
  goldDim: intern('linear-gradient(160deg, #3A332A, #221E18)'),
  obsidian: intern('linear-gradient(180deg, rgba(20, 16, 12, 0.38) 0%, rgba(14, 10, 8, 0.30) 100%)'),
  appFrame: intern('linear-gradient(178deg, #131009 0%, #0B0907 38%, #080606 100%)'),
  chatBubbleMe: intern('linear-gradient(135deg, #2A2A32 0%, #18181E 50%, #0C0C10 100%)'),
  chatBubbleThem: intern('linear-gradient(180deg, #1B2A4A 0%, #0E1426 45%, #05060B 100%)'),
  voiceBubbleMe: intern('linear-gradient(180deg, #24242A 0%, #141418 100%)'),
  voiceBubbleThem: intern('linear-gradient(180deg, #1B2A4A 0%, #0B1120 100%)'),
  goldSolid: intern('linear-gradient(170deg, #FFF1CC 0%, #F7D185 20%, #E3B25D 42%, #C9913B 62%, #A87527 82%, #885D1C 100%)'),
  silverBtn: intern('linear-gradient(180deg, #FFFFFF 0%, #EAEAEA 45%, #B8B8B8 100%)'),
} as const;

/* Pre-computed box-shadow strings */
export const SHADOWS = {
  goldAvatarRing: intern('0 0 8px rgba(216,173,90,0.15), 0 2px 6px rgba(0,0,0,0.5)'),
  chatRow: intern(''),
  voiceBubble: intern('0 6px 18px rgba(0,0,0,0.45)'),
  navBar: intern([
    /* ── Top rim light — bright specular catch on the front lens surface ── */
    'inset 0 2px 1px rgba(255,254,250,0.52)',
    'inset 0 5px 12px rgba(255,252,240,0.22)',
    /* ── Internal light scatter — warm volume glow inside the glass ── */
    'inset 0 -3px 3px rgba(255,242,205,0.32)',
    'inset 0 -10px 28px rgba(255,244,215,0.10)',
    /* ── Side rim lights — thin highlights on the left/right lens edges ── */
    'inset 3px 0 3px rgba(255,252,244,0.12)',
    'inset -3px 0 3px rgba(255,252,244,0.12)',
    /* ── Outer drop shadows — the lens floating above the background ── */
    '0 1px 1px rgba(0,0,0,0.56)',
    '0 5px 14px rgba(0,0,0,0.48)',
    '0 20px 60px rgba(0,0,0,0.76)',
    /* ── Outer rim ring — subtle golden micro-border glow ── */
    '0 0 0 0.5px rgba(216,173,90,0.34)',
    /* ── Mid-distance shadows for depth perception ── */
    '0 14px 34px rgba(0,0,0,0.36)',
    /* ── Inner depth shadows — simulate interior volume of thick glass ── */
    'inset 0 14px 34px rgba(0,0,0,0.36)',
    'inset 0 8px 28px rgba(150,190,255,0.07)',
    /* ── Bottom edge light — subtle reflection from the back surface ── */
    'inset 0 -1.5px 0 rgba(255,248,225,0.18)',
    /* ── Chromatic undertone — subtle warm color depth at edges ── */
    'inset 0 0 16px rgba(239,200,120,0.04)',
    '0 8px 40px -4px rgba(216,173,90,0.08)',
  ].join(', ')),
} as const;

/* ─── FPS Monitor ─────────────────────────────────────────────
   Continuously samples frame timing without adding render cost.
   Used by the adaptive quality manager.
   ─────────────────────────────────────────────────────────── */
export type FrameQuality = 'ultra' | 'high' | 'medium' | 'low';

class FPSMonitor {
  private frames: number[] = [];
  private lastTime = 0;
  private _fps = 60;
  private _quality: FrameQuality = 'ultra';
  private rafId = 0;
  private listeners = new Set<(q: FrameQuality) => void>();
  private running = false;

  get fps() { return this._fps; }
  get quality() { return this._quality; }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = now - this.lastTime;
      this.lastTime = now;
      if (dt > 0 && dt < 500) {
        this.frames.push(dt);
        if (this.frames.length > 30) this.frames.shift();
        const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
        this._fps = Math.round(1000 / avg);
        const next: FrameQuality =
          this._fps >= 55 ? 'ultra' :
          this._fps >= 45 ? 'high' :
          this._fps >= 30 ? 'medium' : 'low';
        if (next !== this._quality) {
          this._quality = next;
          for (const fn of this.listeners) fn(next);
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  subscribe(fn: (q: FrameQuality) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const fpsMonitor = new FPSMonitor();

/* ─── Scroll velocity tracker ─────────────────────────────────
   Attach to scroll containers to enable quality scaling.
   ─────────────────────────────────────────────────────────── */
export class ScrollVelocityTracker {
  private lastY = 0;
  private lastT = 0;
  private _velocity = 0;
  private _fast = false;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;

  get velocity() { return this._velocity; }
  get isFast() { return this._fast; }

  onScroll = (e: Event) => {
    const el = e.target as HTMLElement;
    const now = performance.now();
    const dt = now - this.lastT;
    if (dt > 0 && dt < 300) {
      this._velocity = Math.abs(el.scrollTop - this.lastY) / dt * 1000;
      const newFast = this._velocity > 400;
      if (newFast && !this._fast) {
        this._fast = true;
        if (this.slowTimer) clearTimeout(this.slowTimer);
      } else if (!newFast && this._fast) {
        if (this.slowTimer) clearTimeout(this.slowTimer);
        this.slowTimer = setTimeout(() => { this._fast = false; }, 150);
      }
    }
    this.lastY = el.scrollTop;
    this.lastT = now;
  };

  attach(el: HTMLElement) {
    el.addEventListener('scroll', this.onScroll, { passive: true });
    return () => el.removeEventListener('scroll', this.onScroll);
  }
}

/* ─── Global animation scheduler ──────────────────────────────
   Prioritises animations by importance tier.
   High tier: interactive/touch-driven — always runs.
   Normal tier: ambient animations — skips when FPS < 45.
   Low tier: decorative animations — skips when FPS < 55.
   ─────────────────────────────────────────────────────────── */
export type AnimTier = 'high' | 'normal' | 'low';

class AnimationScheduler {
  private queue = new Map<string, { cb: () => void; tier: AnimTier }>();
  private rafId = 0;
  private running = false;

  schedule(id: string, cb: () => void, tier: AnimTier = 'normal') {
    this.queue.set(id, { cb, tier });
    if (!this.running) this.flush();
  }

  cancel(id: string) { this.queue.delete(id); }

  private flush() {
    this.running = true;
    this.rafId = requestAnimationFrame(() => {
      this.running = false;
      const fps = fpsMonitor.fps;
      for (const [id, { cb, tier }] of this.queue) {
        if (tier === 'high' ||
           (tier === 'normal' && fps >= 45) ||
           (tier === 'low' && fps >= 55)) {
          try { cb(); } catch {}
        }
        this.queue.delete(id);
      }
    });
  }

  stop() { cancelAnimationFrame(this.rafId); this.running = false; }
}

export const animScheduler = new AnimationScheduler();

/* ─── Object pool ─────────────────────────────────────────────
   Reuses plain JS objects to reduce GC pressure.
   ─────────────────────────────────────────────────────────── */
export class ObjectPool<T extends object> {
  private pool: T[] = [];
  constructor(private factory: () => T, private reset: (obj: T) => void, preAlloc = 0) {
    for (let i = 0; i < preAlloc; i++) this.pool.push(factory());
  }
  acquire(): T {
    return this.pool.length ? this.pool.pop()! : this.factory();
  }
  release(obj: T) {
    this.reset(obj);
    if (this.pool.length < 100) this.pool.push(obj);
  }
}

/* ─── Blur cache ──────────────────────────────────────────────
   Caches whether a blur computation has been "applied" and
   provides dirty-region tracking so blur is never re-applied
   unless something in that region actually changed.
   ─────────────────────────────────────────────────────────── */
const _blurDirty = new Map<string, boolean>();
export function markBlurDirty(id: string) { _blurDirty.set(id, true); }
export function isBlurDirty(id: string): boolean {
  const dirty = _blurDirty.get(id) ?? true;
  _blurDirty.set(id, false);
  return dirty;
}

/* ─── Component sleep registry ────────────────────────────────
   Components register themselves; the engine pauses expensive
   work (animations, pollers) when the component is idle.
   ─────────────────────────────────────────────────────────── */
export type SleepState = 'active' | 'idle' | 'sleeping';

class SleepManager {
  private states = new Map<string, SleepState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  getState(id: string): SleepState {
    return this.states.get(id) ?? 'active';
  }

  wake(id: string) {
    this.states.set(id, 'active');
    const t = this.timers.get(id);
    if (t) { clearTimeout(t); this.timers.delete(id); }
  }

  startIdleTimer(id: string, idleMs = 3000, sleepMs = 8000) {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    const idleTimer = setTimeout(() => {
      this.states.set(id, 'idle');
      const sleepTimer = setTimeout(() => {
        this.states.set(id, 'sleeping');
        this.timers.delete(id);
      }, sleepMs);
      this.timers.set(id, sleepTimer);
    }, idleMs);
    this.timers.set(id, idleTimer);
  }

  destroy(id: string) {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.states.delete(id);
    this.timers.delete(id);
  }
}

export const sleepManager = new SleepManager();

/* ─── Time formatter cache ────────────────────────────────────
   formatTime() is called for every message on every poll tick.
   Cache the result keyed by minute-bucket to avoid Date math.
   ─────────────────────────────────────────────────────────── */
const _timeCache = new Map<number, string>();
export function cachedFormatTime(ms: number): string {
  if (!ms) return '';
  // Round to minute bucket — same result within same minute
  const bucket = Math.floor(ms / 60000);
  let v = _timeCache.get(bucket);
  if (!v) {
    const d = new Date(ms);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) {
      let h = d.getHours();
      const m = d.getMinutes().toString().padStart(2, '0');
      const ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      v = `${h}:${m} ${ap}`;
    } else if (diffDays === 1) {
      v = 'Yesterday';
    } else if (diffDays < 7) {
      v = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    } else {
      v = `${d.getMonth() + 1}/${d.getDate()}`;
    }
    _timeCache.set(bucket, v);
    if (_timeCache.size > 10000) {
      const first = _timeCache.keys().next().value;
      if (first !== undefined) _timeCache.delete(first);
    }
  }
  return v;
}

/* ─── Image decode priority manager ──────────────────────────
   Assigns `loading="lazy"` / `decoding="async"` hints based
   on viewport proximity. Near = eager, far = lazy.
   ─────────────────────────────────────────────────────────── */
export function imgAttrs(priority: 'eager' | 'lazy' = 'lazy') {
  return {
    loading: priority as 'lazy' | 'eager',
    decoding: 'async' as const,
    draggable: false as const,
  };
}

/* ─── Paint budget tracker ────────────────────────────────────
   Provides a simple "budget remaining in this frame" API so
   expensive work can be deferred across frames.
   ─────────────────────────────────────────────────────────── */
const FRAME_BUDGET_MS = 10; // leave 6.67ms for browser compositing at 60fps
let _frameStart = 0;

export function beginFrame() {
  _frameStart = performance.now();
}

export function hasBudget(): boolean {
  return performance.now() - _frameStart < FRAME_BUDGET_MS;
}
