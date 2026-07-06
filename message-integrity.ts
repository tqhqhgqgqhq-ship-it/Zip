/**
 * ════════════════════════════════════════════════════════════════
 *  MESSAGE INTEGRITY SYSTEM
 *  ────────────────────────────────────────────────────────────────
 *  Single source of truth for what a chat message actually is.
 *
 *  Message kinds:
 *    processing    → social media extraction in progress
 *    image         → [img]<url>  or  [image]<url>
 *    video         → [video]<url>
 *    voice         → [voice]<url>
 *    gif           → [gif]<url>
 *    story         → [story_v1]<payload>
 *    animated_emoji → single emoji character only
 *    text          → everything else (URLs shown verbatim & clickable)
 *
 *  THERE IS NO LINK-PREVIEW SYSTEM.
 *  THERE IS NO METADATA FETCHING.
 *  THERE ARE NO PREVIEW CARDS.
 *  Social media URLs are intercepted at send-time, extracted to
 *  real media, and delivered as image/video messages. They never
 *  reach the classifier as text.
 * ════════════════════════════════════════════════════════════════ */

import { isSingleAnimatedEmojiMessage } from './emoji-animations';

export type MessageKind =
  | 'processing'
  | 'image'
  | 'video'
  | 'voice'
  | 'gif'
  | 'story'
  | 'animated_emoji'
  | 'text';

// ── Internal media markers ─────────────────────────────────────────
// Order matters: more specific prefixes first.
const MARKERS: ReadonlyArray<{
  prefix: string;
  kind: Exclude<MessageKind, 'text'>;
  extract: (raw: string) => string;
}> = [
  { prefix: '[processing]', kind: 'processing',     extract: ()  => ''                          },
  { prefix: '[story_v1]',   kind: 'story',          extract: (r) => r.slice('[story_v1]'.length) },
  { prefix: '[voice]',      kind: 'voice',          extract: (r) => r.slice('[voice]'.length)    },
  { prefix: '[video]',      kind: 'video',          extract: (r) => r.slice('[video]'.length)    },
  { prefix: '[gif]',        kind: 'gif',            extract: (r) => r.slice('[gif]'.length)      },
  { prefix: '[anim]',       kind: 'animated_emoji', extract: (r) => r.slice('[anim]'.length)     },
  { prefix: '[image]',      kind: 'image',          extract: (r) => r.slice('[image]'.length)    },
  { prefix: '[img]',        kind: 'image',          extract: (r) => r.slice('[img]'.length)      },
];

// ── Internal storage host list (bare CDN URLs render as media) ──────
const INTERNAL_HOSTS = [
  'i.ibb.co', 'ibb.co',
  'pixeldrain.com',
  'files.catbox.moe', 'catbox.moe',
  '0x0.st',
  'i.imgur.com',
  'iili.io', 'freeimage.host',
  'gofile.io',
  'fonts.gstatic.com',
];

function isInternalStorageUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'blob:' || u.protocol === 'data:') return true;
    return INTERNAL_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}

function isUsableUrl(value: string): boolean {
  return /^(?:https?:\/\/|blob:|data:)/i.test(value.trim());
}

function mediaKindByExtension(url: string): Extract<MessageKind, 'video' | 'gif' | 'voice' | 'image'> {
  const p = url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|mov|mkv|m4v)$/.test(p)) return 'video';
  if (/\.gif$/.test(p))                      return 'gif';
  if (/\.(mp3|wav|ogg|m4a|aac)$/.test(p))   return 'voice';
  return 'image';
}

// ── Classifier result ──────────────────────────────────────────────
export interface ClassifiedMessage {
  kind: MessageKind;
  /** Media URL for image/video/voice/gif. Empty for text/processing/emoji. */
  mediaUrl: string;
  /** Verbatim display text for text messages. Empty for media kinds. */
  displayText: string;
  /**
   * True when a media marker was found but the embedded URL is
   * missing or malformed. Renderer shows a recovery placeholder.
   */
  needsRecovery: boolean;
}

/**
 * classifyMessage — the single integrity gate.
 * Every chat message in the app passes through here before render.
 */
export function classifyMessage(raw: string | undefined | null): ClassifiedMessage {
  const text = (raw ?? '').toString();

  // 1. Marker-based messages (our own upload/send pipeline)
  for (const m of MARKERS) {
    if (text.startsWith(m.prefix)) {
      const url = m.extract(text).trim();
      return {
        kind: m.kind,
        mediaUrl: url,
        displayText: '',
        needsRecovery: m.kind !== 'processing' && !isUsableUrl(url),
      };
    }
  }

  // 2. Single animated emoji (no marker, pure emoji char)
  const singleEmoji = isSingleAnimatedEmojiMessage(text);
  if (singleEmoji) {
    return { kind: 'animated_emoji', mediaUrl: '', displayText: singleEmoji, needsRecovery: false };
  }

  // 3. Bare internal CDN URL that lost its marker (defensive)
  const trimmed = text.trim();
  if (/^\S+$/.test(trimmed) && isInternalStorageUrl(trimmed) && isUsableUrl(trimmed)) {
    return {
      kind: mediaKindByExtension(trimmed),
      mediaUrl: trimmed,
      displayText: '',
      needsRecovery: false,
    };
  }

  // 4. Everything else: plain text.
  //    URLs inside are rendered clickable but NEVER replaced with cards,
  //    previews, or metadata. Social URLs should never reach here —
  //    they are intercepted at send-time and converted to real media.
  return {
    kind: 'text',
    mediaUrl: '',
    displayText: text,
    needsRecovery: false,
  };
}

export function isMediaKind(kind: MessageKind): boolean {
  return kind !== 'text' && kind !== 'processing';
}
