import { useCallback, useEffect, useRef, useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Secure Blob URL Cache ── */
const _urlCache = new Map<string, string>();
const _fetchPromises = new Map<string, Promise<string>>();

export async function getSecureMediaUrl(rawUrl: string): Promise<string> {
  const cached = _urlCache.get(rawUrl);
  if (cached) return cached;
  const existing = _fetchPromises.get(rawUrl);
  if (existing) return existing;

  const p = (async () => {
    try {
      const resp = await fetch(rawUrl);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      _urlCache.set(rawUrl, objUrl);
      return objUrl;
    } catch {
      return rawUrl;
    } finally {
      _fetchPromises.delete(rawUrl);
    }
  })();
  _fetchPromises.set(rawUrl, p);
  return p;
}

export function extractMediaUrl(text: string): string {
  if (text.startsWith("[img]")) return text.slice(5);
  if (text.startsWith("[video]")) return text.slice(7);
  if (text.startsWith("[voice]")) return text.slice(7);
  const match = text.match(/https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net|discord\.com|cdn\.discord\.com)\/[^\s<>"']+/i);
  if (match) return match[0];
  return "";
}

export function getMediaType(text: string): "image" | "video" | "voice" | null {
  if (text.startsWith("[img]")) return "image";
  if (text.startsWith("[video]")) return "video";
  if (text.startsWith("[voice]")) return "voice";
  if (/https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)/i.test(text)) {
    if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(text)) return "video";
    return "image";
  }
  return null;
}

export type MediaType = "image" | "video" | "voice";

export interface MediaViewerItem {
  rawUrl: string;
  secureUrl: string | null;
  type: MediaType;
  sender: "me" | "them";
}

/* ── Premium Image Viewer ── */
const ImageViewer = memo(({ src }: { src: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  /* touch gesture state (pinch zoom + pan + double-tap) */
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });
  const touchPanRef = useRef({ active: false, x: 0, y: 0, px: 0, py: 0 });
  const lastTapRef = useRef(0);
  // Live gesture values written directly to the DOM (no React re-render → buttery smooth)
  const liveRef = useRef({ scale: 1, x: 0, y: 0 });

  // Paint the current transform straight to the element for 60fps gesture tracking
  const paint = (s: number, x: number, y: number, animate = false) => {
    liveRef.current = { scale: s, x, y };
    const el = imgRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.18s cubic-bezier(0.22,1,0.36,1)" : "none";
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  };

  const commit = () => setScale(liveRef.current.scale); // sync % label only

  const zoomIn = () => { const s = Math.min(liveRef.current.scale + 0.5, 6); paint(s, liveRef.current.x, liveRef.current.y, true); commit(); };
  const zoomOut = () => { const s = Math.max(liveRef.current.scale - 0.5, 0.5); paint(s, liveRef.current.x, liveRef.current.y, true); commit(); };
  const resetZoom = () => { paint(1, 0, 0, true); setScale(1); setPos({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (liveRef.current.scale <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: liveRef.current.x, py: liveRef.current.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    paint(liveRef.current.scale, dragStart.current.px + dx, dragStart.current.py + dy);
  };

  useEffect(() => {
    const up = () => { if (dragging) { setDragging(false); setPos({ x: liveRef.current.x, y: liveRef.current.y }); } };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [dragging]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    const s = Math.min(Math.max(liveRef.current.scale + delta, 0.5), 6);
    paint(s, liveRef.current.x, liveRef.current.y);
    commit();
  };

  /* ── TWO-FINGER PINCH ZOOM (WhatsApp / Telegram style) ── */
  const getDist = (t: React.TouchList) => {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        active: true,
        startDist: getDist(e.touches),
        startScale: liveRef.current.scale,
        startX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        startY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        startPosX: liveRef.current.x,
        startPosY: liveRef.current.y,
      };
      touchPanRef.current.active = false;
    } else if (e.touches.length === 1) {
      // double-tap to zoom toggle
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        if (liveRef.current.scale > 1) resetZoom();
        else { paint(2.4, 0, 0, true); commit(); }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
      // one-finger pan when zoomed in
      if (liveRef.current.scale > 1) {
        touchPanRef.current = { active: true, x: e.touches[0].clientX, y: e.touches[0].clientY, px: liveRef.current.x, py: liveRef.current.y };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pinchRef.current.active && e.touches.length === 2) {
      e.preventDefault();
      const p = pinchRef.current;
      const dist = getDist(e.touches);
      const nextScale = Math.min(Math.max(p.startScale * (dist / p.startDist), 0.5), 6);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      // live paint every frame — real-time smooth pinch
      paint(nextScale, p.startPosX + (midX - p.startX), p.startPosY + (midY - p.startY));
    } else if (touchPanRef.current.active && e.touches.length === 1) {
      e.preventDefault();
      const t = touchPanRef.current;
      paint(liveRef.current.scale, t.px + (e.touches[0].clientX - t.x), t.py + (e.touches[0].clientY - t.y));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current.active = false;
    if (e.touches.length === 0) {
      touchPanRef.current.active = false;
      if (liveRef.current.scale < 1) resetZoom(); // snap back
      else { commit(); setPos({ x: liveRef.current.x, y: liveRef.current.y }); }
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "none" }}
    >
      {/* Plain <img> driven directly via ref for real-time 60fps zoom/pan */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        className="select-none will-change-transform"
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(${scale})`,
          transformOrigin: "center center",
          maxWidth: "92vw",
          maxHeight: "86vh",
          objectFit: "contain",
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute bottom-24 left-1/2 flex items-center gap-2 -translate-x-1/2 rounded-full px-2 py-1.5 backdrop-blur-xl border transition-all duration-200"
        style={{ background: "rgba(10,10,15,0.75)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        <button onClick={zoomOut} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors" aria-label="Zoom out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/></svg>
        </button>
        <span className="text-[11px] font-mono font-bold text-white/60 w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors" aria-label="Zoom in">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button onClick={resetZoom} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors text-[10px] font-bold" aria-label="Reset zoom">1:1</button>
      </div>
    </div>
  );
});

/* ── Premium Video Viewer ── */
const VideoViewer = memo(({ src }: { src: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showSpeed, setShowSpeed] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    v.currentTime = pct * duration;
  }, [duration]);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setShowControls(false), 2800);
  }, [playing]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setCurrentTime(v.currentTime);
    const onDuration = () => setDuration(v.duration);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDuration);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onDuration);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p) p.catch(() => {});
  }, []);

  useEffect(() => {
    if (playing) hideTimer.current = setTimeout(() => setShowControls(false), 2800);
    return () => clearTimeout(hideTimer.current);
  }, [playing]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  const progress = duration ? (currentTime / duration) * 100 : 0;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = "nudgel-media.mp4";
    a.click();
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black" onMouseMove={handleMouseMove}>
      <video ref={videoRef} src={src} className="max-h-[90vh] max-w-[90vw] select-none" style={{ objectFit: "contain" }} onContextMenu={(e) => e.preventDefault()} onClick={togglePlay} playsInline />

      <AnimatePresence>
        {buffering && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="absolute pointer-events-none">
            <div className="w-12 h-12 border-[3px] border-white/20 border-t-white/80 rounded-full animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!playing && !buffering && (
          <motion.button initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.2 }} onClick={togglePlay}
            className="absolute z-10 flex h-16 w-16 items-center justify-center rounded-full backdrop-blur-xl border border-white/10" style={{ background: "rgba(255,255,255,0.12)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showControls && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)" }}>
            <div ref={progressRef} className="group mx-4 mb-2 h-1.5 cursor-pointer rounded-full transition-all hover:h-2.5" style={{ background: "rgba(255,255,255,0.15)" }} onClick={handleProgressClick}>
              <div className="h-full rounded-full transition-[width] relative" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #D4A853, #EFC878)" }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" style={{ background: "#EFC878", border: "2px solid rgba(0,0,0,0.4)", boxShadow: "0 0 8px rgba(212,168,83,0.5)" }} />
              </div>
            </div>
            <div className="flex items-center justify-between px-4 pb-3 pt-1">
              <div className="flex items-center gap-2">
                <button onClick={togglePlay} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors">
                  {playing ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
                </button>
                <div className="flex items-center gap-1 group/vol">
                  <button onClick={toggleMute} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors">
                    {muted || volume === 0 ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>}
                  </button>
                  <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = false; setMuted(false); } }} className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 h-1" style={{ accentColor: "#D4A853" }} />
                </div>
                <span className="text-[11px] font-mono text-white/50 tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <button onClick={() => setShowSpeed(!showSpeed)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors text-[11px] font-bold">{playbackRate}x</button>
                  <AnimatePresence>
                    {showSpeed && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowSpeed(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden" style={{ background: "rgba(14,14,18,0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                            <button key={r} onClick={() => { setPlaybackRate(r); setShowSpeed(false); }} className="flex items-center justify-between w-full px-4 py-2 text-[12px] font-semibold transition-colors hover:bg-white/10" style={{ color: playbackRate === r ? "#D4A853" : "rgba(255,255,255,0.7)" }}>
                              {r}x {playbackRate === r && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4A853" strokeWidth="3" strokeLinecap="round"><path d="M20 6 9 17l-5-5"/></svg>}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                <button onClick={handleDownload} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors" aria-label="Download">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════════
   REAL DOWNLOAD ENGINE
   The `download` attribute is IGNORED by browsers on cross-origin
   URLs, so the only real download path is: obtain the actual BYTES
   → create a same-origin blob: URL → click that. Blob URLs always
   trigger the browser's native "file downloaded" flow.
   We try 4 byte-acquisition strategies in order.
   ══════════════════════════════════════════════════════════════════ */
async function acquireBytes(url: string, isImage: boolean): Promise<Blob | null> {
  // Strategy 1: reuse the secure blob cache (already fetched for display)
  try {
    const secure = await getSecureMediaUrl(url);
    if (secure.startsWith("blob:")) {
      const b = await (await fetch(secure)).blob();
      if (b.size > 0) return b;
    }
  } catch {}

  // Strategy 2: direct CORS fetch of the raw URL
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (resp.ok) {
      const b = await resp.blob();
      if (b.size > 0) return b;
    }
  } catch {}

  // Strategy 3 (images only): weserv image proxy — always sends CORS headers
  if (isImage) {
    try {
      const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}`;
      const resp = await fetch(proxied);
      if (resp.ok) {
        const b = await resp.blob();
        if (b.size > 0) return b;
      }
    } catch {}
  }

  // Strategy 4: generic CORS proxy
  try {
    const resp = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
    if (resp.ok) {
      const b = await resp.blob();
      if (b.size > 0) return b;
    }
  } catch {}

  return null;
}

async function downloadMedia(url: string, type: MediaType): Promise<boolean> {
  const blob = await acquireBytes(url, type !== "video");
  // HONEST result: if we never got real bytes, report failure — no fake success.
  if (!blob) return false;

  const ext = type === "video"
    ? "mp4"
    : (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg").split("+")[0];
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl; // blob: is same-origin → download attribute WORKS
  a.download = `nudgel-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  return true;
}

/* ── Main Media Viewer Modal ── */
export function PremiumMediaViewer({ items: rawItems, initialIndex, onClose, onForward }: { items: MediaViewerItem[]; initialIndex: number; onClose: () => void; onForward?: (item: MediaViewerItem) => void }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loaded, setLoaded] = useState<Record<number, boolean>>(() => {
    const ready: Record<number, boolean> = { [initialIndex]: true };
    rawItems.forEach((item, index) => {
      if (item.secureUrl) ready[index] = true;
    });
    return ready;
  });
  const [items, setItems] = useState<MediaViewerItem[]>(rawItems);

  useEffect(() => {
    const resolved = [...rawItems];
    const promises = rawItems.map(async (item, i) => {
      if (!item.secureUrl) {
        const s = await getSecureMediaUrl(item.rawUrl);
        resolved[i] = { ...item, secureUrl: s };
      }
    });
    Promise.all(promises).then(() => setItems(resolved));
  }, [rawItems]);

  const item = items[currentIndex];
  const hasMultiple = items.length > 1;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && hasMultiple) setCurrentIndex((i) => Math.min(i + 1, items.length - 1));
      if (e.key === "ArrowLeft" && hasMultiple) setCurrentIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, hasMultiple, items.length]);

  const goNext = () => { if (hasMultiple) setCurrentIndex((i) => Math.min(i + 1, items.length - 1)); };
  const goPrev = () => { if (hasMultiple) setCurrentIndex((i) => Math.max(i - 1, 0)); };
  const markLoaded = (idx: number) => setLoaded((p) => ({ ...p, [idx]: true }));

  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloading || !item) return;
    setDownloading(true);
    setDownloadFailed(false);
    // Always start from the RAW url — the engine resolves the best byte source itself.
    const ok = await downloadMedia(item.rawUrl, item.type);
    setDownloading(false);
    if (ok) {
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 1800);
    } else {
      setDownloadFailed(true);
      setTimeout(() => setDownloadFailed(false), 2200);
    }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[100] flex items-center justify-center select-none"
        style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(30px)" }} onClick={onClose} onContextMenu={(e) => e.preventDefault()}>

        {/* ── TOP ACTION BAR: forward · download · close ── */}
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="absolute right-4 top-4 z-[110] flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {onForward && (
            <button
              onClick={(e) => { e.stopPropagation(); if (item) onForward(item); }}
              className="flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-xl border transition-colors hover:bg-white/15"
              style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.1)", color: "white" }} aria-label="Forward">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
            </button>
          )}
          <button
            onClick={handleDownload}
            className="flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-xl border transition-colors hover:bg-white/15"
            style={{
              background: downloadDone ? "rgba(52,180,94,0.25)" : downloadFailed ? "rgba(239,68,68,0.22)" : "rgba(255,255,255,0.08)",
              borderColor: downloadDone ? "rgba(52,180,94,0.4)" : downloadFailed ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)",
              color: "white",
            }} aria-label="Download">
            {downloading ? (
              <div className="w-4 h-4 border-2 border-white/25 border-t-white/85 rounded-full animate-spin" />
            ) : downloadDone ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            ) : downloadFailed ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-xl border transition-colors hover:bg-white/15"
            style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.1)", color: "white" }} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </motion.div>
        {hasMultiple && (
          <>
            {currentIndex > 0 && <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="absolute left-3 top-1/2 -translate-y-1/2 z-[110] flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-xl border transition-colors hover:bg-white/15" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.1)", color: "white" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg></button>}
            {currentIndex < items.length - 1 && <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-3 top-1/2 -translate-y-1/2 z-[110] flex h-12 w-12 items-center justify-center rounded-full backdrop-blur-xl border transition-colors hover:bg-white/15" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.1)", color: "white" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg></button>}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-1.5">
              {items.map((_, i) => <button key={i} onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }} className="h-1.5 rounded-full transition-all duration-300" style={{ width: i === currentIndex ? 20 : 6, background: i === currentIndex ? "#D4A853" : "rgba(255,255,255,0.25)" }} />)}
            </div>
          </>
        )}
        <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {!loaded[currentIndex] && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute z-0 flex items-center justify-center"><div className="w-10 h-10 border-[3px] border-white/15 border-t-[#D4A853] rounded-full animate-spin" /></motion.div>}
          <AnimatePresence mode="wait">
            <motion.div key={currentIndex} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="relative z-10 w-full h-full flex items-center justify-center">
              {item.type === "image" && item.secureUrl && <ImageViewer key={`img-${item.secureUrl}`} src={item.secureUrl} />}
              {item.type === "video" && item.rawUrl && <VideoViewer key={`vid-${item.rawUrl}`} src={item.rawUrl} />}
            </motion.div>
          </AnimatePresence>
          {items.map((it, idx) => it.secureUrl && idx !== currentIndex ? <img key={it.secureUrl} src={it.secureUrl} alt="" className="hidden" onLoad={() => markLoaded(idx)} /> : null)}
          {item.secureUrl && !loaded[currentIndex] && <img src={item.secureUrl} alt="" className="hidden" onLoad={() => markLoaded(currentIndex)} />}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Secure Media Thumbnails ── */
export function SecureImage({ url, alt, onClick, style, className }: { url: string; alt?: string; onClick?: () => void; style?: React.CSSProperties; className?: string }) {
  const [secureUrl, setSecureUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSecureMediaUrl(url).then((s) => { if (!cancelled) setSecureUrl(s); });
    return () => { cancelled = true; };
  }, [url]);

  if (failed) {
    return <div className="flex flex-col items-center justify-center gap-2 py-6 rounded-[19px]" style={{ minWidth: 160, minHeight: 120, background: "rgba(15,13,10,0.6)", border: "1px solid rgba(216,173,90,0.1)" }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(214,178,110,0.4)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
      <span style={{ fontSize: 11, color: "rgba(214,178,110,0.5)", fontWeight: 600 }}>Upload failed</span>
    </div>;
  }

  if (!secureUrl) {
    return <div className="flex items-center justify-center py-8 rounded-[19px]" style={{ minWidth: 160, minHeight: 100, background: "rgba(15,13,10,0.4)" }}>
      <div className="w-6 h-6 border-2 border-[#D4A853]/30 border-t-[#D4A853] rounded-full animate-spin" />
    </div>;
  }

  return <img src={secureUrl} alt={alt || ""} draggable={false} onClick={onClick} onError={() => setFailed(true)} className={className} style={style} onContextMenu={(e) => e.preventDefault()} loading="lazy" />;
}

export function SecureVideoThumbnail({ url, onClick }: { url: string; onClick?: () => void }) {
  return (
    <div className="relative cursor-pointer" onClick={onClick}>
      <video src={url} className="block rounded-[19px] max-w-[280px] max-h-[320px] select-none" style={{ background: "var(--bg-body)", objectFit: "cover", width: "auto", height: "auto" }} preload="metadata" muted draggable={false} onContextMenu={(e) => e.preventDefault()} />
      <div className="absolute inset-0 flex items-center justify-center rounded-[19px]" style={{ background: "rgba(0,0,0,0.25)" }}>
        <div className="flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-md" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>
  );
}
