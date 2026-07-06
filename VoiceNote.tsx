import { memo, useEffect, useRef, useState } from "react";
// CORS NOTE: We use the raw CDN URL directly for audio — media elements
// (<audio>, <video>, <img>) load cross-origin without CORS issues natively.
// Fetch-based blob URL conversion would fail because Discord CDN blocks CORS.

/* ── Global: tracks currently playing voice note ── */
let _activeNoteId: string | null = null;
const _stopListeners = new Set<() => void>();

function _stopAllOthers(myId: string) {
  if (_activeNoteId && _activeNoteId !== myId) {
    _stopListeners.forEach((cb) => cb());
  }
  _activeNoteId = myId;
}

export const VoiceNote = memo(function VoiceNote({
  rawUrl,
  sender,
  voiceId = rawUrl,
}: {
  rawUrl: string;
  sender: "me" | "them";
  voiceId?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const accentColor =
    sender === "me" ? "var(--accent, #D4A853)" : "var(--text-primary, #F3EADB)";
  const inactiveBar =
    sender === "me" ? "rgba(26,18,6,0.2)" : "rgba(255,255,255,0.1)";

  /* CORS-safe: use raw CDN URL directly — media elements load cross-origin */
  useEffect(() => {
    setUrl(rawUrl);
    setFailed(false);
  }, [rawUrl]);

  /* Register stop callback for one-at-a-time */
  useEffect(() => {
    const stop = () => {
      const a = audioRef.current;
      if (a) { a.pause(); a.currentTime = 0; }
      setPlaying(false);
      setCurrentTime(0);
    };
    _stopListeners.add(stop);
    return () => { _stopListeners.delete(stop); };
  }, []);

  /* Audio events */
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setCurrentTime(0); _activeNoteId = null; };
    const onTime = () => setCurrentTime(a.currentTime);
    const onDur = () => setDuration(a.duration);
    const onErr = () => {
      setFailed(true);
      console.warn("[VoiceNote] playback error:", a.error?.message);
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("error", onErr);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || !url) return;
    if (a.paused) {
      _stopAllOthers(voiceId);
      a.play().catch((err) => {
        console.warn("[VoiceNote] play() failed:", err);
        setFailed(true);
      });
    } else {
      a.pause();
    }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  if (failed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)", maxWidth: 260 }}>
        <span className="text-[11px] text-red-400 font-medium">⚠ Could not load audio</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2.5 select-none cursor-pointer rounded-xl px-2 py-1.5 transition-colors hover:bg-white/5"
      style={{ maxWidth: 280, minWidth: 180, userSelect: "none" }}
      onClick={toggle}
    >
      {/* Play/Pause circle */}
      <div
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: playing ? accentColor : "rgba(255,255,255,0.06)" }}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" className="absolute inset-0">
          <circle cx="18" cy="18" r="14" fill="none" stroke={inactiveBar} strokeWidth="2" />
          <circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke={accentColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(progress / 100) * 87.96} 87.96`}
            transform="rotate(-90 18 18)"
            style={{ transition: "stroke-dasharray 0.2s linear" }}
          />
        </svg>
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill={sender === "me" ? "#1A1206" : "white"}>
            <rect x="6" y="4" width="4" height="16" rx="1.2" />
            <rect x="14" y="4" width="4" height="16" rx="1.2" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill={sender === "me" ? "#1A1206" : "white"}>
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </div>

      {/* Waveform bars */}
      <div className="flex items-center gap-[1.5px] flex-1 h-8">
        {Array.from({ length: 24 }).map((_, i) => {
          const h = 3 + Math.sin(i * 0.6 + (playing ? Date.now() * 0.004 : 0)) * 5
            + Math.cos(i * 1.1 + (playing ? Date.now() * 0.003 : 0)) * 4;
          const isPlayed = (i / 24) * 100 <= progress;
          return (
            <div
              key={i}
              className="w-[2px] rounded-full transition-all duration-75"
              style={{
                height: `${Math.max(h, 2)}px`,
                background: isPlayed ? accentColor : inactiveBar,
                opacity: isPlayed ? 1 : (sender === "me" ? 0.5 : 0.35),
              }}
            />
          );
        })}
      </div>

      {/* Time */}
      <span
        className="shrink-0 font-mono text-[10px] tabular-nums"
        style={{ color: "var(--text-faint, #6E6353)" }}
      >
        {playing || currentTime > 0 ? fmt(currentTime) : duration > 0 ? fmt(duration) : fmt(0)}
      </span>

      <audio ref={audioRef} src={url || undefined} preload="auto" />
    </div>
  );
});
