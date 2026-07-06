/**
 * ════════════════════════════════════════════════════════════════
 *  GLOBAL MEDIA URL SANITIZATION
 *  ────────────────────────────────────────────────────────────────
 *  Every media URL is converted to a human-readable label before
 *  reaching any UI surface: notifications, chat previews, etc.
 *  Discord CDN URLs are NEVER displayed to the user.
 * ════════════════════════════════════════════════════════════════ */

/** Friendly labels for rendered media messages */
export function sanitizeMessagePreview(text: string | null | undefined): string {
  if (!text) return "No messages yet";

  // Nudge messages
  if (text.startsWith('[nudge]')) return '✨ Nudge';
  if (text.startsWith('[story_v1]')) return '✨ Nudge';

  // Image markers
  if (text.startsWith('[img]')) return '📷 Photo';

  // Video markers
  if (text.startsWith('[video]')) return '🎬 Video';
  if (text.startsWith('[vid]')) return '🎬 Video';

  // Voice markers
  if (text.startsWith('[voice]')) return '🎙️ Voice Message';
  if (text.startsWith('[audio]')) return '🎙️ Voice Message';

  // Raw Discord CDN URL detection (Layer 2 — catch any that slip through)
  if (/https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net|discord\.com|cdn\.discord\.com)\/[^\s<>"']+/i.test(text)) {
    if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(text)) return '🎬 Video';
    if (/\.(mp3|wav|ogg|webm|m4a)(\?|$)/i.test(text)) return '🎙️ Voice Message';
    return '📷 Photo';
  }

  // INTERNAL storage hosts only — bare CDN uploads that lost their marker.
  // (A user-shared link must NOT be summarised as a generic placeholder;
  //  it stays as readable text so the preview reflects what was sent.)
  const INTERNAL = /https?:\/\/(?:[^\s/]*\.)?(?:i\.ibb\.co|ibb\.co|pixeldrain\.com|files\.catbox\.moe|catbox\.moe|0x0\.st|i\.imgur\.com|iili\.io|freeimage\.host|gofile\.io)\//i;
  if (INTERNAL.test(text)) {
    if (/\.(mp4|webm|mov|mkv|avi)(\?|$)/i.test(text)) return '🎬 Video';
    if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(text)) return '🎙️ Voice Message';
    return '📷 Photo';
  }

  // Upload.me / picser URLs (legacy internal hosts)
  if (/https?:\/\/(?:cdn\.)?(?:uploadme|picser)\./i.test(text)) return '📷 Photo';

  // Plain text (incl. user-shared links) — returned as-is, never a placeholder.
  return text;
}

/** Extract clean media label for notification display */
export function getMediaNotificationLabel(text: string): string {
  if (!text) return 'Message';

  if (text.startsWith('[nudge]')) return '✨ Nudge';
  if (text.startsWith('[img]')) return '📷 Photo';
  if (text.startsWith('[video]') || text.startsWith('[vid]')) return '🎬 Video';
  if (text.startsWith('[voice]') || text.startsWith('[audio]')) return '🎙️ Voice Message';

  // Raw Discord CDN
  if (/https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net|discord\.com|cdn\.discord\.com)\/[^\s<>"']+/i.test(text)) {
    if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(text)) return '🎬 Video';
    if (/\.(mp3|wav|ogg|webm|m4a)(\?|$)/i.test(text)) return '🎙️ Voice Message';
    return '📷 Photo';
  }

  // Sent by user — truncate for notification
  return text.length > 60 ? text.slice(0, 57) + '...' : text;
}

/** Check if a message contains any media that needs sanitizing */
export function isMediaMessage(text: string): boolean {
  if (!text) return false;
  return (
    text.startsWith('[img]') ||
    text.startsWith('[video]') ||
    text.startsWith('[vid]') ||
    text.startsWith('[voice]') ||
    text.startsWith('[audio]') ||
    text.startsWith('[nudge]') ||
    text.startsWith('[story_v1]') ||
    /https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net|discord\.com|cdn\.discord\.com)\//i.test(text)
  );
}
