/**
 * Browser-side uploader for jscord-storage
 * (https://github.com/animemoeus/jscord-storage).
 *
 * The npm package itself relies on Node's `fs` module, so it cannot run in the
 * browser. Instead we call the same HTTP endpoint that the library uses under
 * the hood: https://discord-storage.animemoe.us/api/upload-from-file/
 *
 * Images are stored on Discord via this service. Turso is NEVER used to hold
 * image binary data — only the resulting URL string is persisted (as the
 * existing message `text` column) so that the chat UI can render it.
 */

import { uploadUniversalFile } from "./universal-file-upload";

const UPLOAD_URL = "https://discord-storage-serverless.animemoe.us/";

export type JscordUploadResult = {
  success: boolean;
  url: string;
  raw: any;
};

/**
 * Deep search for a valid Discord CDN URL inside a mixed JSON response.
 * Handles all known jscord-storage / Discord API response shapes.
 */
function pickUrl(data: any, depth = 0): string {
  if (!data || depth > 6) return "";

  // Primitive: direct URL string
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (
      trimmed.startsWith("https://cdn.discordapp.com/") ||
      trimmed.startsWith("https://media.discordapp.net/") ||
      trimmed.startsWith("https://images-ext-") ||
      trimmed.startsWith("https://discord.com/") ||
      trimmed.startsWith("https://cdn.discord.com/")
    ) {
      return trimmed;
    }
    return "";
  }

  // Array: check each element
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = pickUrl(item, depth + 1);
      if (found) return found;
    }
    return "";
  }

  // Plain object: check common URL field names at this level
  const candidates = [
    "url", "cdn_url", "cdnUrl", "image_url", "imageUrl",
    "proxy_url", "proxyUrl", "src", "link", "href",
    "file", "file_url", "fileUrl", "download_url", "downloadUrl",
    "content_url", "contentUrl",
  ];
  for (const key of candidates) {
    if (data[key] && typeof data[key] === "string") {
      const val: string = data[key];
      if (val.startsWith("https://")) return val;
    }
  }

  // Recurse into known container keys
  const containers = ["data", "result", "upload", "file", "attachment", "attachments", "response", "body", "res", "value"];
  for (const key of containers) {
    if (data[key] != null) {
      const found = pickUrl(data[key], depth + 1);
      if (found) return found;
    }
  }

  // Iterate all own properties (last resort for nested structures)
  if (typeof data === "object") {
    for (const key of Object.keys(data)) {
      if (key === "constructor" || key === "prototype") continue;
      const found = pickUrl(data[key], depth + 1);
      if (found) return found;
    }
  }

  return "";
}

/**
 * Upload a File / Blob from the browser to jscord-storage or universal fallback.
 * Returns `{ success, url }` mirroring the npm package's response shape.
 */
export async function uploadImageFile(
  file: File | Blob,
  _filename?: string,
  onProgress?: (pct: number) => void,
): Promise<JscordUploadResult> {
  if (typeof _filename === "function" && onProgress === undefined) {
    onProgress = _filename as unknown as (pct: number) => void;
    _filename = undefined;
  }
  const ext = (file.type || "image/jpeg").split("/")[1] || "jpg";
  const safeName =
    _filename || (file instanceof File && file.name) ||
    `nudgel-img-${Date.now()}.${ext}`;

  try {
    const res = await uploadUniversalFile(file, safeName, onProgress);
    return {
      success: res.success,
      url: res.url,
      raw: { provider: res.provider, size: res.size },
    };
  } catch (err) {
    return { success: false, url: "", raw: { error: String(err) } };
  }
}

/* ============================ MESSAGE ENCODING ============================
 * Images travel through the existing messaging pipeline (Turso `messages.text`).
 * We tag image messages with a small marker so the renderer can tell them apart
 * from normal text without any schema changes.
 *
 *   Plain text          ->  "Hello there"
 *   Image (legacy)       ->  "[img]https://cdn.discordapp.com/..."
 *   Image (with host)    ->  "[img]discord::https://cdn.discordapp.com/..."
 *
 * The optional "<provider>::" prefix lets the chat UI show which backend served
 * the image (Discord / Picser / UploadMe) — reported straight from the upload
 * response, surviving the Turso round-trip.
 */

export const IMAGE_PREFIX = "[img]";
const PROVIDER_SEP = "::";

export function encodeImageMessage(url: string, provider?: string): string {
  if (provider) return `${IMAGE_PREFIX}${provider}${PROVIDER_SEP}${url}`;
  return `${IMAGE_PREFIX}${url}`;
}

export function isImageMessage(text: string): boolean {
  return typeof text === "string" && text.startsWith(IMAGE_PREFIX);
}

export function decodeImageMessage(text: string): string {
  if (!isImageMessage(text)) return "";
  const body = text.slice(IMAGE_PREFIX.length);
  const sepIdx = body.indexOf(PROVIDER_SEP);
  // Only treat as "provider::url" when the part before "::" is NOT a URL scheme.
  if (sepIdx > 0) {
    const head = body.slice(0, sepIdx);
    if (!head.includes("/") && !head.startsWith("http")) {
      return body.slice(sepIdx + PROVIDER_SEP.length);
    }
  }
  return body;
}

/** Returns the provider label embedded in an image message, or "" if none. */
export function decodeImageProvider(text: string): string {
  if (!isImageMessage(text)) return "";
  const body = text.slice(IMAGE_PREFIX.length);
  const sepIdx = body.indexOf(PROVIDER_SEP);
  if (sepIdx > 0) {
    const head = body.slice(0, sepIdx);
    if (!head.includes("/") && !head.startsWith("http")) {
      return head;
    }
  }
  return "";
}

/* ============================ EXTRACTED MEDIA MARKERS ============================
 * Social-media URLs are transformed into real media that travels through the
 * exact same Turso `messages.text` pipeline using small markers, mirroring the
 * existing `[img]` convention. No schema changes.
 *
 *   Video    ->  "[vid]https://.../clip.mp4"
 *   Audio    ->  "[aud]https://.../track.mp3"
 *   Gallery  ->  "[gal]https://a.jpg|https://b.jpg|https://c.jpg"
 */

export const VIDEO_PREFIX = "[vid]";
export const AUDIO_PREFIX = "[aud]";
export const GALLERY_PREFIX = "[gal]";
export const EMBED_PREFIX = "[embed]";
const GALLERY_SEP = "|";

export function encodeEmbedMessage(url: string): string {
  return `${EMBED_PREFIX}${url}`;
}
export function isEmbedMessage(text: string): boolean {
  return typeof text === "string" && text.startsWith(EMBED_PREFIX);
}
export function decodeEmbedMessage(text: string): string {
  return isEmbedMessage(text) ? text.slice(EMBED_PREFIX.length) : "";
}

export function encodeVideoMessage(url: string): string {
  return `${VIDEO_PREFIX}${url}`;
}
export function isVideoMessage(text: string): boolean {
  return typeof text === "string" && text.startsWith(VIDEO_PREFIX);
}
export function decodeVideoMessage(text: string): string {
  return isVideoMessage(text) ? text.slice(VIDEO_PREFIX.length) : "";
}

export function encodeAudioMessage(url: string): string {
  return `${AUDIO_PREFIX}${url}`;
}
export function isAudioMessage(text: string): boolean {
  return typeof text === "string" && text.startsWith(AUDIO_PREFIX);
}
export function decodeAudioMessage(text: string): string {
  return isAudioMessage(text) ? text.slice(AUDIO_PREFIX.length) : "";
}

export function encodeGalleryMessage(urls: string[]): string {
  return `${GALLERY_PREFIX}${urls.join(GALLERY_SEP)}`;
}
export function isGalleryMessage(text: string): boolean {
  return typeof text === "string" && text.startsWith(GALLERY_PREFIX);
}
export function decodeGalleryMessage(text: string): string[] {
  if (!isGalleryMessage(text)) return [];
  return text
    .slice(GALLERY_PREFIX.length)
    .split(GALLERY_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True for ANY extracted-media marker (image/video/audio/gallery/embed). */
export function isMediaMessage(text: string): boolean {
  return (
    isImageMessage(text) ||
    isVideoMessage(text) ||
    isAudioMessage(text) ||
    isGalleryMessage(text) ||
    isEmbedMessage(text)
  );
}

/* ── File attachment (generic files: PDF, APK, ZIP, DOC, etc.) ────────────── */
const FILE_PREFIX = "[file]";
const FILE_SEP = "::";

/**
 * Encode a generic file attachment.
 * Format: [file]<filename>::<url>::<size>::<mimeType>
 */
export function encodeFileMessage(
  filename: string,
  url: string,
  size: number,
  mimeType: string,
): string {
  return `${FILE_PREFIX}${filename}${FILE_SEP}${url}${FILE_SEP}${size}${FILE_SEP}${mimeType}`;
}

export function isFileMessage(text: string): boolean {
  return typeof text === "string" && text.startsWith(FILE_PREFIX);
}

export interface DecodedFileMessage {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
}

export function decodeFileMessage(text: string): DecodedFileMessage {
  if (!isFileMessage(text)) {
    return { filename: "File", url: "", size: 0, mimeType: "" };
  }
  const parts = text.slice(FILE_PREFIX.length).split(FILE_SEP);
  return {
    filename: parts[0] || "File",
    url: parts[1] || "",
    size: parseInt(parts[2], 10) || 0,
    mimeType: parts[3] || "application/octet-stream",
  };
}
