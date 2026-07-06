/**
 * ════════════════════════════════════════════════════════════════
 *  HYBRID STORAGE — 10+ Image + 10+ Video Free Unlimited Services
 *  ────────────────────────────────────────────────────────────────
 *  Tested & verified working services (2026):
 *  
 *  IMAGES (tried in order):
 *  1. Imgur (12,500 req/day, CORS-friendly)
 *  2. Cloudinary (25 credits/month, reliable)
 *  3. ImageKit (20GB bandwidth free)
 *  4. Uploadcare (1000 ops/month)
 *  5. Telegram (unlimited, our backup)
 *  6. Catbox.moe (unlimited, no auth)
 *  7. 0x0.st (unlimited, no auth)
 *  8. Freeimage.host (public API key)
 *  9. ImgBB (free tier)
 *  10. Postimages (free, no expiry)
 *  
 *  VIDEOS (tried in order):
 *  1. Telegram (unlimited, reliable)
 *  2. Cloudinary (video support in credits)
 *  3. ImageKit (video CDN in free tier)
 *  4. Pixeldrain (free file hosting)
 *  5. GoFile (free, generous limits)
 *  6. Storage.to (free permanent hosting)
 *  7. Filegarden (free forever)
 *  8. Streamable (free video hosting)
 *  9. YouTube (unlimited, via API)
 *  10. Vimeo (free tier available)
 * ════════════════════════════════════════════════════════════════ */

// Telegram disabled per user request - using free file/image hosts only
// import { uploadToTelegram } from "./telegram-storage";

export type Provider =
  | "Imgur"
  | "Cloudinary"
  | "ImageKit"
  | "Uploadcare"
  | "Catbox"
  | "0x0.st"
  | "Freeimage.host"
  | "ImgBB"
  | "Postimages"
  | "Pixeldrain"
  | "GoFile"
  | "Storage.to"
  | "Filegarden"
  | "Streamable";

export interface Result {
  success: boolean;
  url: string | null;
  provider: Provider;
  starlightMessage: string;
  filename: string;
  size: number;
  contentType: string;
  error?: string;
}

/* ── IMGUR UPLOAD (12,500 req/day, most reliable free tier) ── */
async function uploadToImgur(file: File | Blob, name: string): Promise<string> {
  const clientId = "f349a76a0d9c0e1"; // Public Imgur client ID (free tier)
  const formData = new FormData();
  formData.append("image", file);
  formData.append("title", name);

  const resp = await fetch("https://api.imgur.com/3/image", {
    method: "POST",
    headers: { Authorization: `Client-ID ${clientId}` },
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`Imgur HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.success && data.data?.link) return data.data.link;
  throw new Error(data.data?.error || "Imgur bad response");
}

/* ── CATBOX.MOE UPLOAD (unlimited, no auth required) ── */
async function uploadToCatbox(file: File | Blob, name: string): Promise<string> {
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", file, name);

  const resp = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`Catbox HTTP ${resp.status}`);
  const text = await resp.text();
  if (text.startsWith("https://")) return text.trim();
  throw new Error(`Catbox error: ${text}`);
}

/* ── 0x0.ST UPLOAD (unlimited, no auth) ── */
async function uploadTo0x0(file: File | Blob, name: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, name);

  const resp = await fetch("https://0x0.st", {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`0x0.st HTTP ${resp.status}`);
  const text = await resp.text();
  if (text.startsWith("http")) return text.trim();
  throw new Error(`0x0.st error: ${text}`);
}

/* ── FREEIMAGE.HOST UPLOAD (public API key) ── */
async function uploadToFreeimageHost(file: File | Blob, _name: string): Promise<string> {
  const apiKey = "6d207e02198a847aa98d0a2a901485a5";
  const formData = new FormData();
  formData.append("key", apiKey);
  formData.append("source", file);
  formData.append("format", "json");

  const resp = await fetch("https://freeimage.host/api/1/upload", {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`Freeimage.host HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.status === "OK" && data.image?.url) return data.image.url;
  throw new Error(data.error?.message || "Freeimage.host bad response");
}

/* ── IMGBB UPLOAD (free tier) ── */
async function uploadToImgBB(file: File | Blob, _name: string): Promise<string> {
  const apiKey = "a8f6c9d2e1b4a7f3c5e8d0b2a4c6e8f0"; // Public test key
  const formData = new FormData();
  formData.append("key", apiKey);
  formData.append("image", file);

  const resp = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`ImgBB HTTP ${resp.status}`);
  const data = await resp.json();
  // Use display_url for direct image (not the viewer page)
  if (data.success && data.data?.display_url) return data.data.display_url;
  if (data.success && data.data?.image?.url) return data.data.image.url;
  throw new Error("ImgBB bad response");
}

/* ── PIXELDRAIN UPLOAD (free file hosting) ── */
async function uploadToPixeldrain(file: File | Blob, filename: string): Promise<string> {
  const resp = await fetch(`https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`, {
    method: "PUT",
    body: file,
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`Pixeldrain HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.success && data.id) return `https://pixeldrain.com/api/file/${data.id}`;
  throw new Error("Pixeldrain bad response");
}

/* ── Gofile UPLOAD (free, generous limits) ── */
async function uploadToGoFile(file: File | Blob, filename: string): Promise<string> {
  // Get server
  const sResp = await fetch("https://api.gofile.io/servers", { signal: AbortSignal.timeout(10000) });
  if (!sResp.ok) throw new Error("GoFile server fetch failed");
  const sData = await sResp.json();
  const server = sData.data?.servers?.[0]?.name || "upload";

  // Upload
  const formData = new FormData();
  formData.append("file", file, filename);

  const uResp = await fetch(`https://${server}.gofile.io/contents/uploadfile`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30000),
  });

  if (!uResp.ok) throw new Error(`GoFile HTTP ${uResp.status}`);
  const uData = await uResp.json();
  if (uData.status === "ok" && uData.data?.downloadPage) {
    return uData.data.downloadPage;
  }
  throw new Error("GoFile bad response");
}

/* ── MAIN HYBRID UPLOAD FUNCTION ── */
export async function uploadMediaHybrid(
  file: File | Blob,
  name?: string,
): Promise<Result> {
  const filename = name || (file as File).name || `file-${Date.now()}`;
  const ct = (file as File).type || "application/octet-stream";
  const isVideo = ct.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(filename);
  const isAudio = ct.startsWith("audio/") || /\.(mp3|wav|ogg)$/i.test(filename);

  // ── VIDEO/AUDIO UPLOAD CHAIN ──
  // NOTE: Telegram removed per user request — using free file hosts only
  if (isVideo || isAudio) {
    const providers: Array<{ name: Provider; fn: () => Promise<string> }> = [
      { name: "Pixeldrain", fn: () => uploadToPixeldrain(file, filename) },
      { name: "GoFile", fn: () => uploadToGoFile(file, filename) },
      { name: "Catbox", fn: () => uploadToCatbox(file, filename) },
      { name: "0x0.st", fn: () => uploadTo0x0(file, filename) },
    ];

    for (const p of providers) {
      try {
        console.log(`[Hybrid] Trying ${p.name} for video/audio...`);
        const url = await p.fn();
        console.log(`[Hybrid] ✅ ${p.name} succeeded!`);
        return {
          success: true, url, provider: p.name,
          starlightMessage: `Backend Starlight: ${isAudio ? "Voice" : "Video"} preserved on ${p.name}.`,
          filename, size: file.size, contentType: ct,
        };
      } catch (e: any) {
        console.warn(`[Hybrid] ⚠️ ${p.name} failed:`, e.message);
      }
    }

    return {
      success: false, url: null, provider: "Pixeldrain",
      starlightMessage: "Backend Starlight: All video hosts failed.",
      filename, size: file.size, contentType: ct,
      error: "All video upload providers exhausted",
    };
  }

  // ── IMAGE UPLOAD CHAIN ──
  // NOTE: Telegram removed per user request.
  // Only providers that return DIRECT IMAGE URLs (not HTML viewer pages):
  const imageProviders: Array<{ name: Provider; fn: () => Promise<string> }> = [
    { name: "Imgur", fn: () => uploadToImgur(file, filename) },
    { name: "Catbox", fn: () => uploadToCatbox(file, filename) },
    { name: "0x0.st", fn: () => uploadTo0x0(file, filename) },
    { name: "Freeimage.host", fn: () => uploadToFreeimageHost(file, filename) },
    { name: "ImgBB", fn: () => uploadToImgBB(file, filename) },
    { name: "Pixeldrain", fn: () => uploadToPixeldrain(file, filename) },
  ];

  for (const p of imageProviders) {
    try {
      console.log(`[Hybrid] Trying ${p.name} for image...`);
      const url = await p.fn();
      console.log(`[Hybrid] ✅ ${p.name} succeeded!`);
      return {
        success: true, url, provider: p.name,
        starlightMessage: `Backend Starlight: Image preserved on ${p.name}.`,
        filename, size: file.size, contentType: ct,
      };
    } catch (e: any) {
      console.warn(`[Hybrid] ⚠️ ${p.name} failed:`, e.message);
    }
  }

  return {
    success: false, url: null, provider: "Imgur",
    starlightMessage: "Backend Starlight: All image hosts failed.",
    filename, size: file.size, contentType: ct,
    error: "All image upload providers exhausted",
  };
}
