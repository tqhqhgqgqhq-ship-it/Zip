/**
 * ════════════════════════════════════════════════════════════════
 *  UNIVERSAL FILE & MEDIA UPLOAD — GoFile API & Multi-Host Engine
 *  ────────────────────────────────────────────────────────────────
 *  As instructed:
 *  1. FOR FILE SHARING (attachments, PDFs, APKs, archives, docs):
 *     • Uses Gofile API specifically as the primary file sharing host.
 *     • Tries direct client-to-GoFile XHR with 0-100% progress.
 *     • Automatically falls back to Server-Assisted GoFile API
 *       (/api/gofile) to bypass browser CORS / ad blockers.
 *  2. FOR MEDIA SHARING (inline chat images, videos, voice notes):
 *     • Uses direct CDN hosts (Catbox, 0x0.st, Pixeldrain) that provide
 *       raw embeddable URLs for <img src="..." /> and <video />.
 *     • Falls back to Server-Assisted Media CDN (/api/media-upload).
 *  3. Guaranteed 100% fallback to IndexedDB / DataURL if offline.
 * ════════════════════════════════════════════════════════════════ */

export interface UniversalUploadResult {
  success: boolean;
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  provider: string;
  error?: string;
}

const IDB_DB_NAME = 'nudgel_universal_files_v1';
const IDB_STORE_NAME = 'files';

/**
 * Store a file in IndexedDB for persistent local/offline playback & opening.
 */
export async function saveFileToIndexedDB(file: File | Blob, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(IDB_STORE_NAME);
        const id = `idb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const record = {
          file,
          filename,
          type: file.type || 'application/octet-stream',
          createdAt: Date.now(),
        };
        const putReq = store.put(record, id);
        putReq.onsuccess = () => {
          resolve(`idb://${id}/${encodeURIComponent(filename)}`);
        };
        putReq.onerror = () => reject(putReq.error);
      };
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Retrieve a stored Blob from IndexedDB by custom idb:// scheme URL.
 */
export async function getFileFromIndexedDB(idbUrl: string): Promise<{ blob: Blob; filename: string; type: string } | null> {
  if (!idbUrl.startsWith('idb://')) return null;
  const body = idbUrl.slice('idb://'.length);
  const parts = body.split('/');
  const id = parts[0];
  const filename = parts[1] ? decodeURIComponent(parts[1]) : 'attachment';

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          resolve(null);
          return;
        }
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(IDB_STORE_NAME);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (getReq.result && getReq.result.file) {
            resolve({
              blob: getReq.result.file,
              filename: getReq.result.filename || filename,
              type: getReq.result.type || 'application/octet-stream',
            });
          } else {
            resolve(null);
          }
        };
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function uploadViaXhr(
  url: string,
  method: string,
  body: FormData | Blob,
  onProgress?: (pct: number) => void,
  timeoutMs = 30000,
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = timeoutMs;

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      resolve({ status: xhr.status, responseText: xhr.responseText });
    };
    xhr.onerror = () => reject(new Error(`Network error on ${url}`));
    xhr.ontimeout = () => reject(new Error(`Timeout on ${url}`));

    xhr.send(body as any);
  });
}

/* =========================================================================
   GOFILE API — DEDICATED FOR FILE SHARING
   ========================================================================= */

/**
 * Step 1: Direct browser-to-GoFile XHR upload.
 */
async function tryDirectGoFile(file: File | Blob, filename: string, onProgress?: (pct: number) => void): Promise<string> {
  // 1. Get server
  const sResp = await fetch("https://api.gofile.io/servers", { signal: AbortSignal.timeout(10000) });
  if (!sResp.ok) throw new Error("GoFile server list fetch failed");
  const sData = await sResp.json();
  const server = sData.data?.servers?.[0]?.name || "store1";

  // 2. Upload file
  const form = new FormData();
  form.append("file", file, filename);

  const res = await uploadViaXhr(`https://${server}.gofile.io/contents/uploadfile`, "POST", form, onProgress, 45000);
  if (res.status === 200 || res.status === 201) {
    const json = JSON.parse(res.responseText);
    if (json.status === "ok" && json.data?.downloadPage) {
      return json.data.downloadPage;
    }
  }
  throw new Error(`GoFile direct upload failed: ${res.responseText}`);
}

/**
 * Step 2: Server-Assisted GoFile API upload via /api/gofile (bypasses CORS/adblockers).
 */
async function tryServerGoFile(file: File | Blob, filename: string, onProgress?: (pct: number) => void): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);

  const res = await uploadViaXhr("/api/gofile", "POST", form, onProgress, 45000);
  if (res.status === 200) {
    const json = JSON.parse(res.responseText);
    if (json.success && json.url) {
      return json.url;
    }
  }
  throw new Error(`GoFile server proxy failed: ${res.responseText}`);
}

/**
 * DEDICATED GOFILE UPLOADER FOR FILE SHARING
 * Tries direct GoFile API first, then server-assisted GoFile API.
 */
export async function uploadFileToGoFile(
  file: File | Blob,
  customName?: string,
  onProgress?: (pct: number) => void,
): Promise<UniversalUploadResult> {
  const filename = customName || (file instanceof File && file.name) || `file_${Date.now()}`;
  const size = file.size || 0;
  const mimeType = file.type || 'application/octet-stream';

  onProgress?.(5);

  // 1. Try Direct GoFile API
  try {
    console.log(`[gofile-upload] Trying direct GoFile API for ${filename}...`);
    const url = await tryDirectGoFile(file, filename, onProgress);
    console.log(`[gofile-upload] ✅ GoFile Direct succeeded! URL:`, url);
    onProgress?.(100);
    return { success: true, url, filename, size, mimeType, provider: 'GoFile API (Direct)' };
  } catch (e: any) {
    console.warn(`[gofile-upload] ⚠️ GoFile Direct failed, falling back to Server Proxy...`, e?.message || e);
  }

  // 2. Try Server-Assisted GoFile API
  try {
    console.log(`[gofile-upload] Trying server-assisted GoFile API via /api/gofile...`);
    const url = await tryServerGoFile(file, filename, onProgress);
    console.log(`[gofile-upload] ✅ GoFile Server Proxy succeeded! URL:`, url);
    onProgress?.(100);
    return { success: true, url, filename, size, mimeType, provider: 'GoFile API (Server)' };
  } catch (e: any) {
    console.warn(`[gofile-upload] ⚠️ GoFile Server Proxy failed:`, e?.message || e);
  }

  // 3. Fallback to general CDN or IndexedDB if GoFile is completely down
  console.log(`[gofile-upload] GoFile unreachable. Falling back to universal media/local storage.`);
  return uploadUniversalFile(file, filename, onProgress);
}

/* =========================================================================
   MEDIA CDN UPLOAD — FOR INLINE IMAGES, VIDEOS, VOICE NOTES
   ========================================================================= */

async function tryServerMediaProxy(file: File | Blob, filename: string, onProgress?: (pct: number) => void): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  const res = await uploadViaXhr("/api/media-upload", "POST", form, onProgress, 30000);
  if (res.status === 200) {
    const json = JSON.parse(res.responseText);
    if (json.success && json.url) return json.url;
  }
  throw new Error("Server media upload proxy failed");
}

async function tryCatbox(file: File | Blob, filename: string, onProgress?: (pct: number) => void): Promise<string> {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', file, filename);
  const res = await uploadViaXhr('https://catbox.moe/user/api.php', 'POST', form, onProgress, 15000);
  if (res.status === 200 && res.responseText.startsWith('http')) {
    return res.responseText.trim();
  }
  throw new Error(`Catbox status ${res.status}`);
}

async function tryPixeldrain(file: File | Blob, filename: string, onProgress?: (pct: number) => void): Promise<string> {
  const res = await uploadViaXhr(`https://pixeldrain.com/api/file/${encodeURIComponent(filename)}`, 'PUT', file, onProgress, 20000);
  if (res.status === 200 || res.status === 201) {
    try {
      const json = JSON.parse(res.responseText);
      if (json.success && json.id) {
        return `https://pixeldrain.com/api/file/${json.id}`;
      }
    } catch {}
  }
  throw new Error(`Pixeldrain status ${res.status}`);
}

async function try0x0(file: File | Blob, filename: string, onProgress?: (pct: number) => void): Promise<string> {
  const form = new FormData();
  form.append('file', file, filename);
  const res = await uploadViaXhr('https://0x0.st', 'POST', form, onProgress, 15000);
  if (res.status === 200 && res.responseText.startsWith('http')) {
    return res.responseText.trim();
  }
  throw new Error(`0x0.st status ${res.status}`);
}

/**
 * Universal uploader for media (images, videos, audio) where direct embed CDN links are needed.
 * Tries server-assisted upload proxy first to guarantee no CORS issues.
 */
export async function uploadUniversalFile(
  file: File | Blob,
  customName?: string,
  onProgress?: (pct: number) => void,
): Promise<UniversalUploadResult> {
  const filename = customName || (file instanceof File && file.name) || `file_${Date.now()}`;
  const size = file.size || 0;
  const mimeType = file.type || 'application/octet-stream';

  onProgress?.(5);

  const providers = [
    { name: 'ServerMediaProxy', fn: () => tryServerMediaProxy(file, filename, onProgress) },
    { name: 'Catbox', fn: () => tryCatbox(file, filename, onProgress) },
    { name: 'Pixeldrain', fn: () => tryPixeldrain(file, filename, onProgress) },
    { name: '0x0.st', fn: () => try0x0(file, filename, onProgress) },
  ];

  for (const p of providers) {
    try {
      console.log(`[universal-media-upload] Trying ${p.name} for ${filename}...`);
      const url = await p.fn();
      console.log(`[universal-media-upload] ✅ ${p.name} succeeded! URL:`, url);
      onProgress?.(100);
      return { success: true, url, filename, size, mimeType, provider: p.name };
    } catch (e: any) {
      console.warn(`[universal-media-upload] ⚠️ ${p.name} failed:`, e?.message || e);
    }
  }

  // ── Guaranteed Fallback: IndexedDB / Data URL Storage ──
  console.log('[universal-media-upload] External hosts failed. Using IndexedDB persistent fallback.');
  try {
    onProgress?.(40);
    const idbUrl = await saveFileToIndexedDB(file, filename);
    onProgress?.(100);
    console.log('[universal-media-upload] ✅ Saved to IndexedDB:', idbUrl);
    return { success: true, url: idbUrl, filename, size, mimeType, provider: 'LocalIndexedDB' };
  } catch (idbErr) {
    console.warn('[universal-media-upload] IndexedDB put failed, falling back to DataURL', idbErr);
    try {
      onProgress?.(60);
      const dataUrl = await readAsDataUrl(file);
      onProgress?.(100);
      return { success: true, url: dataUrl, filename, size, mimeType, provider: 'DataURL' };
    } catch (dataErr: any) {
      return { success: false, url: '', filename, size, mimeType, provider: 'None', error: String(dataErr) };
    }
  }
}
