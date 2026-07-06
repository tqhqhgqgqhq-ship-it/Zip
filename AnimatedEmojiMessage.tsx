/**
 * ════════════════════════════════════════════════════════════════
 *  ANIMATED EMOJI MESSAGE COMPONENT
 *  ────────────────────────────────────────────────────────────────
 *  Renders a single-emoji message as an animated WebP from the
 *  Google Noto Emoji CDN (via animatemojis.com / AnimatEmojis).
 *
 *  Rules enforced BEFORE this component is ever rendered:
 *    ✅  message === exactly one emoji grapheme cluster
 *    ❌  anything else → never reaches this component
 *
 *  Features:
 *    • Lazy loads the WebP — shows static emoji until ready
 *    • Graceful fallback if CDN image fails (404, offline, etc.)
 *    • Scale-in entrance animation (framer-motion)
 *    • Zero bubble chrome — floats directly in the chat stream
 *    • Sends / receives side-aware alignment preserved by parent
 *    • LRU-style in-memory cache prevents refetching
 * ════════════════════════════════════════════════════════════════ */

import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { emojiToNotoUrl } from '../lib/emoji-animations';

// ── Shared in-memory probe cache ─────────────────────────────────
const _probeCache = new Map<string, 'loading' | 'ok' | 'fail'>();
const _probeListeners = new Map<string, Array<(ok: boolean) => void>>();

function probeImage(url: string, cb: (ok: boolean) => void) {
  const cached = _probeCache.get(url);
  if (cached === 'ok') { cb(true); return; }
  if (cached === 'fail') { cb(false); return; }

  // Register listener
  if (!_probeListeners.has(url)) _probeListeners.set(url, []);
  _probeListeners.get(url)!.push(cb);

  // Only fire one Image() per URL
  if (cached === 'loading') return;
  _probeCache.set(url, 'loading');

  const img = new Image();
  img.onload = () => {
    _probeCache.set(url, 'ok');
    _probeListeners.get(url)!.forEach((fn) => fn(true));
    _probeListeners.delete(url);
  };
  img.onerror = () => {
    _probeCache.set(url, 'fail');
    _probeListeners.get(url)!.forEach((fn) => fn(false));
    _probeListeners.delete(url);
  };
  img.src = url;
}

// ── Spring configs ────────────────────────────────────────────────
const ENTER_SENT = {
  initial: { scale: 0.3, opacity: 0, y: 12 },
  animate: { scale: 1, opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 480, damping: 28, mass: 0.7 },
};
const ENTER_RECV = {
  initial: { scale: 0.3, opacity: 0, y: 12 },
  animate: { scale: 1, opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 420, damping: 26, mass: 0.8, delay: 0.04 },
};

// ── Component ─────────────────────────────────────────────────────
interface Props {
  /** The single emoji character to display */
  emoji: string;
  /** 'me' → right-aligned (sent), 'them' → left-aligned (received) */
  sender: 'me' | 'them';
  /** Timestamp label */
  time?: string;
}

export const AnimatedEmojiMessage = memo(function AnimatedEmojiMessage({ emoji, sender, time }: Props) {
  const isSent = sender === 'me';
  const url = emojiToNotoUrl(emoji);

  const [state, setState] = useState<'probing' | 'ready' | 'fallback'>('probing');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    probeImage(url, (ok) => {
      if (!mounted.current) return;
      setState(ok ? 'ready' : 'fallback');
    });
    return () => { mounted.current = false; };
  }, [url]);

  const spring = isSent ? ENTER_SENT : ENTER_RECV;

  return (
    <motion.div
      initial={spring.initial}
      animate={spring.animate}
      transition={spring.transition}
      className={`flex flex-col ${isSent ? 'items-end' : 'items-start'}`}
    >
      {/* Emoji display — no bubble at all */}
      <div className="relative select-none" style={{ lineHeight: 1 }}>
        {state === 'ready' ? (
          /* Animated WebP from Google Noto Emoji CDN */
          <img
            src={url}
            alt={emoji}
            draggable={false}
            width={92}
            height={92}
            style={{
              width: 92,
              height: 92,
              imageRendering: 'auto',
              filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))',
            }}
            onError={() => setState('fallback')}
          />
        ) : state === 'probing' ? (
          /* Skeleton while probing CDN */
          <div
            style={{
              width: 92,
              height: 92,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 68,
                lineHeight: 1,
                opacity: 0.55,
                filter: 'grayscale(0.2)',
              }}
            >
              {emoji}
            </span>
          </div>
        ) : (
          /* Fallback: static Unicode emoji if CDN fails */
          <span
            style={{
              fontSize: 72,
              lineHeight: 1,
              display: 'block',
              filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.25))',
            }}
          >
            {emoji}
          </span>
        )}
      </div>

      {/* Timestamp — same style as regular messages */}
      {time && (
        <span
          className="mt-1 select-none"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-chat-time)',
            paddingLeft: isSent ? 0 : 4,
            paddingRight: isSent ? 4 : 0,
          }}
        >
          {time}
        </span>
      )}
    </motion.div>
  );
});
