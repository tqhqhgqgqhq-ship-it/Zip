import {
  decodeAudioMessage,
  decodeEmbedMessage,
  decodeGalleryMessage,
  decodeImageMessage,
  decodeVideoMessage,
  isAudioMessage,
  isEmbedMessage,
  isGalleryMessage,
  isImageMessage,
  isVideoMessage,
} from "./jscord-upload";
import { classifyMessage } from "./message-integrity";

export type GroupMediaKind = "image" | "video" | "gif" | "audio" | "voice" | "document";

export type GroupMediaMessageRow = {
  id: string;
  fromUid: string;
  fromName: string;
  fromAvatar: string;
  text: string;
  createdAt: number;
};

export type GroupMediaItem = {
  id: string;
  messageId: string;
  fromUid: string;
  fromName: string;
  fromAvatar: string;
  rawText: string;
  url: string;
  kind: GroupMediaKind;
  createdAt: number;
  label: string;
};

const DOC_EXT_RE = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|csv|json|md)(\?|#|$)/i;
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|aac|flac)(\?|#|$)/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|m4v)(\?|#|$)/i;
const GIF_EXT_RE = /\.gif(\?|#|$)/i;

export function deriveUsername(email: string): string {
  const base = (email.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 24);
  return `@${base || "user"}`;
}

export function normalizeStoredMediaUrl(raw: string): string {
  return raw.replace(/^direct::/i, "").trim();
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "file";
    return decodeURIComponent(last);
  } catch {
    return "file";
  }
}

function detectPlainUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function kindFromUrl(url: string): GroupMediaKind | null {
  if (GIF_EXT_RE.test(url)) return "gif";
  if (VIDEO_EXT_RE.test(url)) return "video";
  if (AUDIO_EXT_RE.test(url)) return "audio";
  if (DOC_EXT_RE.test(url)) return "document";
  if (/^https?:\/\//i.test(url)) return "image";
  return null;
}

export function extractGroupMediaItems(rows: GroupMediaMessageRow[]): GroupMediaItem[] {
  const items: GroupMediaItem[] = [];

  for (const row of rows) {
    const raw = row.text || "";

    const pushItem = (url: string, kind: GroupMediaKind, suffix = "", label?: string) => {
      const cleanUrl = normalizeStoredMediaUrl(url);
      if (!cleanUrl) return;
      items.push({
        id: `${row.id}${suffix}`,
        messageId: row.id,
        fromUid: row.fromUid,
        fromName: row.fromName,
        fromAvatar: row.fromAvatar,
        rawText: raw,
        url: cleanUrl,
        kind,
        createdAt: row.createdAt,
        label: label || fileNameFromUrl(cleanUrl),
      });
    };

    if (isGalleryMessage(raw)) {
      decodeGalleryMessage(raw).forEach((url, index) => pushItem(url, GIF_EXT_RE.test(url) ? "gif" : "image", `:${index}`));
      continue;
    }

    if (isImageMessage(raw)) {
      const url = decodeImageMessage(raw);
      pushItem(url, GIF_EXT_RE.test(url) ? "gif" : "image");
      continue;
    }

    if (isVideoMessage(raw)) {
      pushItem(decodeVideoMessage(raw), "video");
      continue;
    }

    if (isAudioMessage(raw)) {
      const url = decodeAudioMessage(raw);
      const kind = /voice/i.test(fileNameFromUrl(url)) ? "voice" : "voice";
      pushItem(url, kind);
      continue;
    }

    if (isEmbedMessage(raw)) {
      const url = decodeEmbedMessage(raw);
      if (url) pushItem(url, "video");
      continue;
    }

    const classified = classifyMessage(raw);
    if (classified.kind === "image") {
      pushItem(classified.mediaUrl, GIF_EXT_RE.test(classified.mediaUrl) ? "gif" : "image");
      continue;
    }
    if (classified.kind === "video") {
      pushItem(classified.mediaUrl, "video");
      continue;
    }
    if (classified.kind === "gif") {
      pushItem(classified.mediaUrl, "gif");
      continue;
    }
    if (classified.kind === "voice") {
      pushItem(classified.mediaUrl, "voice");
      continue;
    }

    const plainUrl = detectPlainUrl(raw);
    if (plainUrl) {
      const kind = kindFromUrl(plainUrl);
      if (kind) pushItem(plainUrl, kind);
    }
  }

  return items.sort((a, b) => b.createdAt - a.createdAt);
}
