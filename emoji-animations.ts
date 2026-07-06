/**
 * ════════════════════════════════════════════════════════════════
 * ANIMATED EMOJI SYSTEM — AnimatEmojis / Google Noto Emoji CDN
 * ────────────────────────────────────────────────────────────────
 * Source: https://animatemojis.com (powered by Google Noto Emoji)
 * CDN: https://fonts.gstatic.com/s/e/notoemoji/latest/{hex}/512.webp
 *
 * RULES (strictly enforced):
 * ✅ Entire message is exactly ONE emoji → animated
 * ❌ Any text present → plain text bubble
 * ❌ Any numbers / symbols → plain text bubble
 * ❌ Any spaces → plain text bubble
 * ❌ More than one emoji → plain text bubble
 * ════════════════════════════════════════════════════════════════
 */

// ── Emoji segmenter (native, zero-dep) ────────────────────────────
function segmentGraphemes(str: string): string[] {
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    const seg = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
    return [...seg.segment(str)].map((s: any) => s.segment as string);
  }
  return [...str];
}

// ── Is-emoji check ──────────────────────────────────────────────────
const EMOJI_RE = /\p{Emoji}/u;
function isEmojiCluster(cluster: string): boolean {
  return EMOJI_RE.test(cluster);
}

/**
 * isSingleAnimatedEmojiMessage
 *
 * Returns the single emoji character if the ENTIRE message is
 * exactly one emoji grapheme cluster with no other content.
 * Returns null in every other case.
 */
export function isSingleAnimatedEmojiMessage(text: string): string | null {
  if (!text || text.length === 0) return null;
  const ALLOWED_ONLY_RE = /^[\p{Emoji}\u{FE00}-\u{FE0F}\u{1F3FB}-\u{1F3FF}\u{200D}\u{20E3}]+$/u;
  if (!ALLOWED_ONLY_RE.test(text)) return null;
  const clusters = segmentGraphemes(text);
  const emojiClusters = clusters.filter(isEmojiCluster);
  if (emojiClusters.length !== 1) return null;
  if (clusters.length !== emojiClusters.length) return null;
  return emojiClusters[0];
}

/**
 * Converts an emoji grapheme cluster to its Google Noto Emoji CDN URL.
 */
export function emojiToNotoUrl(emoji: string): string {
  const VARIATION_SELECTORS = new Set([0xFE0F, 0xFE00, 0xFE01, 0xFE02, 0xFE03, 0xFE04]);
  const points: string[] = [];
  for (const cp of emoji) {
    const code = cp.codePointAt(0)!;
    if (!VARIATION_SELECTORS.has(code)) {
      points.push(code.toString(16));
    }
  }
  const hex = points.join('_');
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.webp`;
}

// ── In-memory cache ─────────────────────────────────────────────────
const _loadedCache = new Map<string, boolean>();
const _failedCache = new Set<string>();

export function probeEmojiUrl(url: string): Promise<boolean> {
  if (_loadedCache.has(url)) return Promise.resolve(_loadedCache.get(url)!);
  if (_failedCache.has(url)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { _loadedCache.set(url, true); resolve(true); };
    img.onerror = () => { _failedCache.add(url); resolve(false); };
    img.src = url;
  });
}

// ── Legacy compat ────────────────────────────────────────────────────
export interface EmojiAnimation {
  char: string;
  name: string;
  animationUrl: string;
  fallback: string;
}

/** @deprecated — use isSingleAnimatedEmojiMessage + emojiToNotoUrl directly */
export function getAnimation(emoji: string): EmojiAnimation | undefined {
  const url = emojiToNotoUrl(emoji);
  return { char: emoji, name: emoji, animationUrl: url, fallback: emoji };
}

/** @deprecated */
export function hasAnimatedEmoji(text: string): boolean {
  return isSingleAnimatedEmojiMessage(text) !== null;
}

/** @deprecated */
export function extractEmoji(text: string): string[] {
  return segmentGraphemes(text).filter(isEmojiCluster);
}
