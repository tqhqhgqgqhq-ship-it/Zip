'use client';

/**
 * ════════════════════════════════════════════════════════════════
 *  ChatGif — play-once GIF surface for chat bubbles
 *  ────────────────────────────────────────────────────────────────
 *  A raw animated <img src="*.gif"> loops forever and every GIF on
 *  screen animates simultaneously, which is heavy and distracting.
 *
 *  This component fixes that:
 *   • A GIF plays its FULL animation exactly once, then freezes on
 *     its final frame (rendered to a <canvas> so it stays crisp).
 *   • Only ONE GIF animates at a time across the whole app. Starting
 *     one automatically freezes any other that is playing.
 *   • Tap a frozen GIF to replay it from frame one.
 *
 *  Duration is derived by parsing the GIF's own frame-delay bytes,
 *  so the freeze lands right as the loop completes — no guesswork.
 * ════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, useCallback } from 'react';

/* ── Global single-player coordinator ─────────────────────────────
   Whichever GIF is currently animating registers a "stop" callback.
   When another GIF starts, the previous one is told to freeze.      */
let activeStop: (() => void) | null = null;
function claimPlayback(stop: () => void) {
  if (activeStop && activeStop !== stop) activeStop();
  activeStop = stop;
}
function releasePlayback(stop: () => void) {
  if (activeStop === stop) activeStop = null;
}

/* ── GIF duration parser ──────────────────────────────────────────
   Reads Graphics Control Extension blocks and sums per-frame delays.
   Returns total loop length in ms (min clamp so instant GIFs still
   read as a play). Falls back to a sane default on any parse error. */
const durationCache = new Map<string, number>();

async function measureGifDuration(url: string): Promise<number> {
  if (durationCache.has(url)) return durationCache.get(url)!;
  try {
    const res = await fetch(url, { mode: 'cors' });
    const buf = new Uint8Array(await res.arrayBuffer());
    let totalMs = 0;
    let i = 0;
    // Header is "GIF87a"/"GIF89a" (6 bytes) + logical screen descriptor (7).
    if (buf.length < 13) throw new Error('too small');
    i = 13;
    // Skip global color table if present.
    if (buf[10] & 0x80) i += 3 * (1 << ((buf[10] & 0x07) + 1));
    while (i < buf.length) {
      const block = buf[i];
      if (block === 0x3b) break; // trailer
      if (block === 0x21) {
        // Extension
        const label = buf[i + 1];
        if (label === 0xf9) {
          // Graphics Control Extension → bytes 4-5 = delay in 1/100s
          const delay = buf[i + 4] | (buf[i + 5] << 8);
          totalMs += (delay || 0) * 10;
        }
        i += 2;
        // Skip sub-blocks
        while (i < buf.length && buf[i] !== 0) i += buf[i] + 1;
        i += 1;
      } else if (block === 0x2c) {
        // Image descriptor
        i += 10;
        if (buf[i - 1] & 0x80) i += 3 * (1 << ((buf[i - 1] & 0x07) + 1));
        i += 1; // LZW min code size
        while (i < buf.length && buf[i] !== 0) i += buf[i] + 1;
        i += 1;
      } else {
        i += 1;
      }
    }
    // Browsers clamp very small delays to ~100ms; mirror that behaviour.
    const clamped = Math.max(600, Math.min(totalMs || 1500, 12000));
    durationCache.set(url, clamped);
    return clamped;
  } catch {
    durationCache.set(url, 2200);
    return 2200;
  }
}

export function ChatGif({
  url,
  isMe,
  onOpen,
}: {
  url: string;
  isMe: boolean;
  onOpen: () => void;
}) {
  const [playing, setPlaying] = useState(true);
  const [cacheBust, setCacheBust] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dims = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const freeze = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (img && canvas && img.naturalWidth) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      try {
        ctx?.drawImage(img, 0, 0);
      } catch {
        /* cross-origin taint — canvas stays blank, poster handles it */
      }
    }
    setPlaying(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const start = useCallback(async () => {
    claimPlayback(freeze);
    setCacheBust((n) => n + 1); // restart the animation from frame one
    setPlaying(true);
    const duration = await measureGifDuration(url);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(freeze, duration + 120);
  }, [url, freeze]);

  // Auto-play once on mount (respecting the single-player rule).
  useEffect(() => {
    start();
    return () => {
      releasePlayback(freeze);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedSrc = cacheBust ? `${url}${url.includes('?') ? '&' : '?'}_r=${cacheBust}` : url;

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] ${isMe ? 'rounded-tr-md' : 'rounded-tl-md'}`}
      style={{
        padding: 3,
        background: '#0F0D0A',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div
        className="relative rounded-[19px] overflow-hidden cursor-pointer select-none"
        style={{ maxWidth: 260, maxHeight: 300, background: '#0F0D0A' }}
        onClick={(e) => {
          e.stopPropagation();
          if (playing) {
            onOpen();
          } else {
            start();
          }
        }}
      >
        {/* Frozen final frame */}
        <canvas
          ref={canvasRef}
          className="block w-full h-auto"
          style={{
            display: playing ? 'none' : 'block',
            maxWidth: 260,
            maxHeight: 300,
          }}
        />

        {/* Live animation (only mounted while playing) */}
        {playing && (
          <img
            ref={imgRef}
            src={animatedSrc}
            alt="GIF"
            crossOrigin="anonymous"
            draggable={false}
            onLoad={(e) => {
              dims.current = {
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              };
            }}
            className="block w-full h-auto"
            style={{ maxWidth: 260, maxHeight: 300, background: '#0F0D0A' }}
          />
        )}

        {/* GIF badge + replay affordance */}
        <div
          className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md pointer-events-none"
          style={{
            background: 'rgba(6,5,3,0.62)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span
            className="text-[9px] font-extrabold tracking-[0.08em]"
            style={{ color: playing ? '#EFC878' : 'rgba(214,178,110,0.75)' }}
          >
            GIF
          </span>
        </div>

        {/* Replay overlay when frozen */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 44,
                height: 44,
                background: 'rgba(6,5,3,0.5)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,240,205,0.22)',
                boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F3E4C2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v6h-6" />
              </svg>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatGif;
