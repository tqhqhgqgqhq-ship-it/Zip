/**
 * Social URL → embedded media delivery.
 *
 * The ONLY 100% reliable way to deliver real YouTube/TikTok/Instagram video
 * inside a browser is the official embed player. Every "direct mp4" approach
 * fails because:
 *   - YouTube mp4 URLs are session-signed and expire in minutes
 *   - All public Cobalt/yt-dlp instances are blocked by YouTube since mid-2025
 *   - Fetching any of these from the browser hits CORS walls
 *
 * The YouTube <iframe> embed IS the real video — same player, same quality,
 * full controls, full-screen support. This is what every app (Discord, Telegram,
 * WhatsApp, iMessage) does when you share a YouTube link.
 */

import { encodeEmbedMessage } from "./jscord-upload";

export type SocialKind = "embed";

export type SocialPlatform =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "unknown";

export type TransformResult = {
  success: boolean;
  encoded: string;
  kind: SocialKind | null;
  platform: SocialPlatform;
  error?: string;
};

/* ── URL detection ── */

export function isSupportedSocialUrl(text: string): boolean {
  const t = (text || "").trim();
  // Must be exactly one URL, no spaces
  if (!/^https?:\/\/[^\s]+$/i.test(t) || /\s/.test(t)) return false;
  return detectPlatform(t) !== "unknown";
}

export function detectPlatform(url: string): SocialPlatform {
  if (/(youtube\.com\/(watch|shorts|embed)|youtu\.be\/)/i.test(url)) return "youtube";
  if (/instagram\.com\/(p|reel|reels|tv)\//i.test(url)) return "instagram";
  if (/tiktok\.com\//i.test(url)) return "tiktok";
  if (/(twitter\.com|x\.com)\/[^/]+\/status\//i.test(url)) return "twitter";
  return "unknown";
}

/* ── Video ID extraction ── */

function ytVideoId(url: string): string {
  const patterns = [
    /[?&]v=([\w-]{6,})/,
    /youtu\.be\/([\w-]{6,})/,
    /shorts\/([\w-]{6,})/,
    /embed\/([\w-]{6,})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return "";
}

function ttVideoId(url: string): string {
  const m = url.match(/video\/(\d+)/);
  return m ? m[1] : "";
}

function igShortcode(url: string): string {
  const m = url.match(/\/(p|reel|reels|tv)\/([\w-]+)/);
  return m ? m[2] : "";
}

/* ── Build the embed URL ── */

function buildEmbedUrl(url: string, platform: SocialPlatform): string | null {
  if (platform === "youtube") {
    const id = ytVideoId(url);
    if (!id) return null;
    const isShort = url.toLowerCase().includes("/shorts/");
    // controls=0: removes player controls, bottom bar, logo.
    // modestbranding=1: removes YouTube logo.
    // rel=0: no related videos from other channels.
    // showinfo=0: deprecated but good to include.
    // iv_load_policy=3: no annotations.
    // enablejsapi=1: enables programmatic play/pause events.
    return `https://www.youtube-nocookie.com/embed/${id}?controls=0&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&playsinline=1&autoplay=0&disablekb=1&enablejsapi=1${isShort ? "&shorts=1" : ""}`;
  }
  if (platform === "tiktok") {
    const id = ttVideoId(url);
    if (!id) return null;
    return `https://www.tiktok.com/embed/v2/${id}`;
  }
  if (platform === "instagram") {
    const code = igShortcode(url);
    if (!code) return null;
    return `https://www.instagram.com/p/${code}/embed/`;
  }
  if (platform === "twitter") {
    // Twitter/X oEmbed doesn't work in iframe; skip
    return null;
  }
  return null;
}

/**
 * Transform a supported social URL into an embedded media marker.
 * This is INSTANT — no network calls, no extraction, no waiting.
 * The embed IS the real video (YouTube's own player).
 */
export async function transformSocialUrl(rawUrl: string): Promise<TransformResult> {
  const url = rawUrl.trim();
  const platform = detectPlatform(url);

  let isShort = url.toLowerCase().includes("/shorts/");
  if (platform === "youtube" && !isShort) {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json) {
          if (json.title && json.title.toLowerCase().includes("shorts")) {
            isShort = true;
          }
          if (json.thumbnail_width && json.thumbnail_height && json.thumbnail_height > json.thumbnail_width) {
            isShort = true;
          }
        }
      }
    } catch {
      /* ignore CORS/network errors */
    }
  }

  let embedUrl = buildEmbedUrl(url, platform);
  if (!embedUrl) {
    return { success: false, encoded: "", kind: null, platform, error: "no_embed_url" };
  }

  if (platform === "youtube" && isShort && !embedUrl.includes("shorts=1")) {
    embedUrl += "&shorts=1";
  }

  return {
    success: true,
    encoded: encodeEmbedMessage(embedUrl),
    kind: "embed",
    platform,
  };
}
