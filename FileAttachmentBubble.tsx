/**
 * ════════════════════════════════════════════════════════════════
 *  FILE ATTACHMENT BUBBLE — Production-grade file message card
 *  ────────────────────────────────────────────────────────────────
 *  Renders every file type as a real attachment card, never as text.
 *  Matches the design language of WhatsApp / Telegram / Signal with
 *  the app's gold-obsidian premium aesthetic.
 *
 *  Features:
 *  • Rich file type icons (60+ types)
 *  • Image/video thumbnail preview
 *  • File size, extension badge
 *  • Upload progress ring
 *  • Download progress ring
 *  • Upload states: uploading | sent | failed
 *  • Download states: idle | downloading | done | failed
 *  • Retry on failure
 *  • Correct file opening via window.open (Android intent)
 *  • Smooth framer-motion animations
 * ════════════════════════════════════════════════════════════════ */

'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFileFromIndexedDB } from '../lib/universal-file-upload';

/* ── Types ─────────────────────────────────────────────────────── */
export interface FileAttachmentProps {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  sender: 'me' | 'them';
  /** Optimistic: still uploading to cloud */
  uploading?: boolean;
  /** 0–100, only used when uploading=true */
  uploadProgress?: number;
  /** Upload failed — show retry */
  uploadFailed?: boolean;
  /** Called when user taps Retry after failed upload */
  onRetry?: () => void;
}

type DownloadState = 'idle' | 'downloading' | 'done' | 'failed';

/* ── Helpers ───────────────────────────────────────────────────── */

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getExtension(filename: string, mimeType?: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot >= 0) return filename.slice(dot + 1).toUpperCase();
  if (mimeType) {
    const map: Record<string, string> = {
      'application/pdf': 'PDF',
      'application/zip': 'ZIP',
      'application/x-zip-compressed': 'ZIP',
      'application/vnd.android.package-archive': 'APK',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
      'application/msword': 'DOC',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
      'application/vnd.ms-excel': 'XLS',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
      'application/vnd.ms-powerpoint': 'PPT',
    };
    return map[mimeType] ?? 'FILE';
  }
  return 'FILE';
}

type FileCategory =
  | 'pdf'
  | 'apk' | 'aab'
  | 'image'
  | 'video'
  | 'audio'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'archive'
  | 'code'
  | 'text'
  | 'data'
  | 'ebook'
  | 'design'
  | 'font'
  | 'executable'
  | 'generic';

export function classifyFile(filename: string, mimeType: string): FileCategory {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'apk' || mime === 'application/vnd.android.package-archive') return 'apk';
  if (ext === 'aab') return 'aab';
  if (['jpg','jpeg','png','gif','webp','bmp','svg','ico','tiff','heic','heif','avif','raw','cr2','nef'].includes(ext) || mime.startsWith('image/')) return 'image';
  if (['mp4','mov','avi','mkv','webm','flv','wmv','3gp','m4v','ogv','ts','m2ts'].includes(ext) || mime.startsWith('video/')) return 'video';
  if (['mp3','wav','ogg','flac','aac','m4a','opus','wma','aiff'].includes(ext) || mime.startsWith('audio/')) return 'audio';
  if (['doc','docx','odt'].includes(ext) || mime.includes('msword') || mime.includes('wordprocessing')) return 'word';
  if (['xls','xlsx','ods','csv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet') || mime === 'text/csv') return 'excel';
  if (['ppt','pptx','odp'].includes(ext) || mime.includes('powerpoint') || mime.includes('presentation')) return 'powerpoint';
  if (['zip','rar','7z','tar','gz','bz2','xz','cab','iso','dmg'].includes(ext) || mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('tar')) return 'archive';
  if (['js','ts','jsx','tsx','py','java','c','cpp','cs','go','rs','rb','php','swift','kt','sh','bash','sql','yml','yaml','toml','lua','dart'].includes(ext)) return 'code';
  if (['txt','rtf','md','log','nfo'].includes(ext) || mime === 'text/plain' || mime === 'text/markdown') return 'text';
  if (['json','xml','html','htm','css','ini','conf','env'].includes(ext) || mime === 'application/json' || mime === 'text/xml' || mime === 'text/html') return 'data';
  if (['epub','mobi','azw','fb2'].includes(ext)) return 'ebook';
  if (['psd','ai','sketch','fig','xd','afdesign','afphoto'].includes(ext)) return 'design';
  if (['ttf','otf','woff','woff2','eot'].includes(ext)) return 'font';
  if (['exe','msi','deb','rpm','pkg'].includes(ext)) return 'executable';
  return 'generic';
}

/* ── Colour palette per category ───────────────────────────────── */
interface ColorScheme { icon: string; badge: string; bg: string; }

const CATEGORY_COLORS: Record<FileCategory, ColorScheme> = {
  pdf:        { icon: '#FF5B5B', badge: '#FF5B5B', bg: 'rgba(255,91,91,0.12)' },
  apk:        { icon: '#78D965', badge: '#78D965', bg: 'rgba(120,217,101,0.12)' },
  aab:        { icon: '#78D965', badge: '#78D965', bg: 'rgba(120,217,101,0.12)' },
  image:      { icon: '#EFC878', badge: '#EFC878', bg: 'rgba(239,200,120,0.12)' },
  video:      { icon: '#9B8DFF', badge: '#9B8DFF', bg: 'rgba(155,141,255,0.12)' },
  audio:      { icon: '#F0A3FF', badge: '#F0A3FF', bg: 'rgba(240,163,255,0.12)' },
  word:       { icon: '#4DA6FF', badge: '#4DA6FF', bg: 'rgba(77,166,255,0.12)' },
  excel:      { icon: '#52C17A', badge: '#52C17A', bg: 'rgba(82,193,122,0.12)' },
  powerpoint: { icon: '#FF8A47', badge: '#FF8A47', bg: 'rgba(255,138,71,0.12)' },
  archive:    { icon: '#FFD147', badge: '#FFD147', bg: 'rgba(255,209,71,0.12)' },
  code:       { icon: '#A6F0C6', badge: '#A6F0C6', bg: 'rgba(166,240,198,0.12)' },
  text:       { icon: '#C8C8D8', badge: '#C8C8D8', bg: 'rgba(200,200,216,0.12)' },
  data:       { icon: '#80D8FF', badge: '#80D8FF', bg: 'rgba(128,216,255,0.12)' },
  ebook:      { icon: '#FF9FB0', badge: '#FF9FB0', bg: 'rgba(255,159,176,0.12)' },
  design:     { icon: '#EFC878', badge: '#EFC878', bg: 'rgba(239,200,120,0.12)' },
  font:       { icon: '#D0D0E8', badge: '#D0D0E8', bg: 'rgba(208,208,232,0.12)' },
  executable: { icon: '#FF7B7B', badge: '#FF7B7B', bg: 'rgba(255,123,123,0.12)' },
  generic:    { icon: '#A0A0B0', badge: '#A0A0B0', bg: 'rgba(160,160,176,0.12)' },
};

/* ── SVG icons per category ────────────────────────────────────── */
function FileIcon({ category, color, size = 32 }: { category: FileCategory; color: string; size?: number }) {
  const s = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (category) {
    case 'pdf':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <text x="6" y="19" fontSize="5.5" fontWeight="700" fill={color} stroke="none" fontFamily="system-ui">PDF</text>
        </svg>
      );
    case 'apk':
      return (
        <svg {...s}>
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" opacity=".18"/>
          <path d="M7 10h10M9 7l-2 3 2 3M15 7l2 3-2 3"/>
          <circle cx="9" cy="13.5" r=".6" fill={color}/>
          <circle cx="15" cy="13.5" r=".6" fill={color}/>
          <path d="M9 6l1.5-2.5M15 6l-1.5-2.5"/>
        </svg>
      );
    case 'aab':
      return (
        <svg {...s}>
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <text x="5.5" y="15" fontSize="5" fontWeight="700" fill={color} stroke="none" fontFamily="system-ui">AAB</text>
        </svg>
      );
    case 'image':
      return (
        <svg {...s}>
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      );
    case 'video':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <polygon points="10 11 16 14.5 10 18 10 11"/>
        </svg>
      );
    case 'audio':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M9 13h6M9 17h4"/>
          <circle cx="16" cy="16" r="1"/>
          <path d="M16 12v4"/>
        </svg>
      );
    case 'word':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <text x="5.5" y="19" fontSize="5.5" fontWeight="700" fill={color} stroke="none" fontFamily="system-ui">DOC</text>
        </svg>
      );
    case 'excel':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <text x="5.5" y="19" fontSize="5.5" fontWeight="700" fill={color} stroke="none" fontFamily="system-ui">XLS</text>
        </svg>
      );
    case 'powerpoint':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <text x="5.5" y="19" fontSize="5.5" fontWeight="700" fill={color} stroke="none" fontFamily="system-ui">PPT</text>
        </svg>
      );
    case 'archive':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="11" x2="12" y2="18"/>
          <line x1="9" y1="14" x2="15" y2="14"/>
          <rect x="10" y="10" width="4" height="2" rx=".5"/>
        </svg>
      );
    case 'code':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <polyline points="8 13 6 15 8 17"/>
          <polyline points="16 13 18 15 16 17"/>
          <line x1="12" y1="12" x2="12" y2="18"/>
        </svg>
      );
    case 'text':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
      );
    case 'data':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M8 13h1l1 2 1-4 1 4 1-2h1"/>
        </svg>
      );
    case 'ebook':
      return (
        <svg {...s}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      );
    case 'design':
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <circle cx="10" cy="14" r="2"/>
          <circle cx="14" cy="14" r="2"/>
          <path d="M12 12v4"/>
        </svg>
      );
    case 'executable':
      return (
        <svg {...s}>
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <polyline points="8 12 12 8 16 12"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      );
  }
}

/* ── Progress ring ─────────────────────────────────────────────── */
function ProgressRing({ progress, size = 44, stroke = 2.8, color = '#EFC878' }: {
  progress: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(progress, 100) / 100);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}/>
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.18s ease' }}
      />
    </svg>
  );
}

/* ── Download button states ────────────────────────────────────── */
function DownloadIcon({ state, color }: { state: DownloadState; color: string }) {
  if (state === 'done') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    );
  }
  if (state === 'failed') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF5B5B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    );
  }
  // idle or downloading → show download arrow
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

/* ── Image thumbnail preview ───────────────────────────────────── */
function ImageThumb({ url, category }: { url: string; category: FileCategory }) {
  const [failed, setFailed] = useState(false);
  if (category !== 'image' || failed) return null;
  return (
    <div className="relative overflow-hidden rounded-t-[18px]" style={{ maxHeight: 180 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="w-full object-cover select-none"
        style={{ maxHeight: 180, display: 'block' }}
        onError={() => setFailed(true)}
        draggable={false}
      />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.45) 100%)',
      }}/>
    </div>
  );
}

/* ── Status label ──────────────────────────────────────────────── */
function StatusLabel({ uploading, uploadFailed, uploadProgress, downloadState }: {
  uploading?: boolean;
  uploadFailed?: boolean;
  uploadProgress?: number;
  downloadState: DownloadState;
}) {
  if (uploadFailed) return <span style={{ color: '#FF5B5B', fontSize: 11, fontWeight: 700 }}>Upload failed</span>;
  if (uploading) {
    const pct = uploadProgress != null ? ` ${Math.round(uploadProgress)}%` : '';
    return <span style={{ color: 'rgba(239,200,120,0.75)', fontSize: 11, fontWeight: 600 }}>Uploading{pct}…</span>;
  }
  if (downloadState === 'downloading') return <span style={{ color: 'rgba(239,200,120,0.75)', fontSize: 11, fontWeight: 600 }}>Downloading…</span>;
  if (downloadState === 'failed') return <span style={{ color: '#FF5B5B', fontSize: 11, fontWeight: 700 }}>Download failed · Retry</span>;
  if (downloadState === 'done') return <span style={{ color: '#78D965', fontSize: 11, fontWeight: 600 }}>Downloaded · Tap to open</span>;
  return <span style={{ color: 'rgba(243,234,219,0.50)', fontSize: 11, fontWeight: 500 }}>Tap to open</span>;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */
export function FileAttachmentBubble({
  filename,
  url,
  size,
  mimeType,
  sender,
  uploading,
  uploadProgress,
  uploadFailed,
  onRetry,
}: FileAttachmentProps) {
  const isMe = sender === 'me';
  const category = classifyFile(filename, mimeType);
  const colors = CATEGORY_COLORS[category];
  const ext = getExtension(filename, mimeType);

  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const downloadProgressRef = useRef(0);
  const [downloadProgress, setDownloadProgress] = useState(0);

  /* ── Open file ─────────────────────────────────────────────────
     On web/Android:
     • Direct link open triggers the browser's download or Android
       intent dispatch system.
     • For APK/AAB: Android shows "Open with Package Installer"
     • For PDF: Android shows PDF reader chooser
     • For all others: Android file-open intent or download
  */
  const handleOpen = useCallback(async () => {
    if (uploading || !url) return;
    if (uploadFailed) { onRetry?.(); return; }

    if (downloadState === 'done' || downloadState === 'idle' || downloadState === 'failed') {
      openFile(url, filename, mimeType);
      return;
    }
  }, [uploading, uploadFailed, url, filename, mimeType, downloadState, onRetry]);

  const handleDownloadBtn = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploading || !url) return;
    if (downloadState === 'done') { openFile(url, filename, mimeType); return; }
    if (downloadState === 'downloading') return;

    setDownloadState('downloading');
    setDownloadProgress(0);
    downloadProgressRef.current = 0;

    try {
      let blob: Blob;
      if (url.startsWith('idb://')) {
        const idbRes = await getFileFromIndexedDB(url);
        if (!idbRes || !idbRes.blob) throw new Error('Not found in IDB');
        blob = idbRes.blob;
      } else {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const total = Number(resp.headers.get('content-length') ?? size ?? 0);
        const reader = resp.body?.getReader();
        if (!reader) {
          blob = await resp.blob();
        } else {
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = new Uint8Array(value.buffer instanceof ArrayBuffer ? value.buffer : new Uint8Array(value).buffer, value.byteOffset, value.byteLength);
            chunks.push(chunk);
            received += value.length;
            const pct = total > 0 ? (received / total) * 100 : 0;
            downloadProgressRef.current = pct;
            setDownloadProgress(pct);
          }
          blob = new Blob(chunks, { type: mimeType || 'application/octet-stream' });
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

      setDownloadProgress(100);
      setDownloadState('done');
    } catch {
      setDownloadState('failed');
    }
  }, [url, filename, mimeType, size, downloadState, uploading]);

  /* ── Appearance ─────────────────────────────────────────────── */
  const isImage = category === 'image';
  const hasThumb = isImage && !!url && !uploading;

  const cardBg = isMe
    ? 'linear-gradient(145deg, rgba(28,22,14,0.96) 0%, rgba(20,16,10,0.98) 100%)'
    : 'linear-gradient(145deg, rgba(22,20,26,0.96) 0%, rgba(14,13,18,0.98) 100%)';

  const borderColor = isMe
    ? `rgba(216,173,90,0.26)`
    : `rgba(255,255,255,0.10)`;

  const iconBg = colors.bg;
  const iconColor = colors.icon;

  /* ── Uploading overlay ring ─────────────────────────────────── */
  const showUploadRing = uploading && !uploadFailed;
  const showDownloadRing = downloadState === 'downloading';
  const ringColor = isMe ? '#EFC878' : colors.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.88, y: -6 }}
      transition={{ type: 'spring', stiffness: 440, damping: 28, mass: 0.7 }}
      onClick={handleOpen}
      className="relative overflow-hidden cursor-pointer select-none"
      style={{
        width: isImage ? 240 : 270,
        minWidth: isImage ? 180 : 220,
        maxWidth: isImage ? 280 : 300,
        borderRadius: 20,
        background: cardBg,
        border: `1px solid ${borderColor}`,
        boxShadow: isMe
          ? '0 8px 28px rgba(0,0,0,0.50), 0 2px 6px rgba(216,173,90,0.08)'
          : '0 8px 28px rgba(0,0,0,0.50)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
      whileTap={{ scale: 0.97 }}
    >
      {/* ── Top spec line ── */}
      <div className="absolute top-0 left-4 right-4 h-px pointer-events-none" style={{
        background: `linear-gradient(90deg, transparent, ${isMe ? 'rgba(255,246,220,0.18)' : 'rgba(255,255,255,0.10)'}, transparent)`,
      }}/>

      {/* ── Image thumbnail (if applicable) ── */}
      {hasThumb && <ImageThumb url={url} category={category}/>}

      {/* ── Main content row ── */}
      <div className="flex items-center gap-3 px-3.5 py-3">

        {/* ── Icon block ── */}
        <div
          className="relative flex-shrink-0 flex items-center justify-center"
          style={{
            width: 52, height: 52,
            borderRadius: 14,
            background: iconBg,
            border: `1px solid ${iconColor}22`,
          }}
        >
          {/* Upload/Download ring overlay */}
          {(showUploadRing || showDownloadRing) ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <ProgressRing
                progress={showUploadRing ? (uploadProgress ?? 0) : downloadProgress}
                size={52} stroke={2.6} color={ringColor}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <FileIcon category={category} color={iconColor} size={24}/>
              </div>
            </div>
          ) : (
            <FileIcon category={category} color={iconColor} size={26}/>
          )}
        </div>

        {/* ── File info ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
          {/* Filename */}
          <div
            className="text-[13px] font-bold leading-tight"
            style={{
              color: '#F3EADB',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word',
            }}
          >
            {filename}
          </div>

          {/* Extension badge + size */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[9px] font-black px-1.5 py-[2px] rounded-md tracking-wide"
              style={{
                background: `${colors.badge}22`,
                color: colors.badge,
                border: `1px solid ${colors.badge}33`,
                letterSpacing: '0.06em',
              }}
            >
              {ext}
            </span>
            <span style={{ color: 'rgba(243,234,219,0.42)', fontSize: 11, fontWeight: 500 }}>
              {formatFileSize(size)}
            </span>
          </div>

          {/* Status row */}
          <StatusLabel
            uploading={uploading}
            uploadFailed={uploadFailed}
            uploadProgress={uploadProgress}
            downloadState={downloadState}
          />
        </div>

        {/* ── Action button ── */}
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: uploadFailed
              ? 'rgba(255,91,91,0.12)'
              : isMe ? 'rgba(216,173,90,0.10)' : 'rgba(255,255,255,0.06)',
            border: uploadFailed
              ? '1px solid rgba(255,91,91,0.22)'
              : isMe ? '1px solid rgba(216,173,90,0.18)' : '1px solid rgba(255,255,255,0.08)',
          }}
          onClick={handleDownloadBtn}
        >
          <AnimatePresence mode="wait">
            {uploading && !uploadFailed ? (
              <motion.div key="spin"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isMe ? '#EFC878' : '#9B8DFF'} strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
              </motion.div>
            ) : uploadFailed ? (
              <motion.div key="retry"
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF5B5B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 .49-3.36"/>
                </svg>
              </motion.div>
            ) : (
              <motion.div key="dl"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <DownloadIcon state={downloadState} color={isMe ? '#EFC878' : colors.icon}/>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Download progress bar at bottom ── */}
      <AnimatePresence>
        {downloadState === 'downloading' && (
          <motion.div
            key="dlbar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 h-[3px]"
            style={{ background: 'rgba(255,255,255,0.06)', overflow: 'hidden', borderRadius: '0 0 20px 20px' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: isMe ? 'linear-gradient(90deg, #EFC878, #D4A853)' : `linear-gradient(90deg, ${colors.icon}, ${colors.icon}aa)` }}
              animate={{ width: `${downloadProgress}%` }}
              transition={{ duration: 0.15, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Upload progress bar at bottom ── */}
      <AnimatePresence>
        {uploading && !uploadFailed && (
          <motion.div
            key="upbar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 h-[3px]"
            style={{ background: 'rgba(255,255,255,0.06)', overflow: 'hidden', borderRadius: '0 0 20px 20px' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #EFC878, #D4A853)' }}
              animate={{ width: `${uploadProgress ?? 0}%` }}
              transition={{ duration: 0.18, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Upload failed tint ── */}
      <AnimatePresence>
        {uploadFailed && (
          <motion.div
            key="failedtint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none rounded-[20px]"
            style={{ background: 'rgba(255,91,91,0.04)', border: '1px solid rgba(255,91,91,0.24)' }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Helper: open a file URL on web (triggers Android intent / download) ── */
async function openFile(url: string, filename: string, mimeType: string): Promise<void> {
  if (!url) return;

  let targetUrl = url;
  if (url.startsWith('idb://')) {
    try {
      const idbRes = await getFileFromIndexedDB(url);
      if (idbRes && idbRes.blob) {
        targetUrl = URL.createObjectURL(idbRes.blob);
        setTimeout(() => URL.revokeObjectURL(targetUrl), 15000);
      }
    } catch {
      return;
    }
  } else if (url.startsWith('data:')) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      targetUrl = URL.createObjectURL(blob);
      setTimeout(() => URL.revokeObjectURL(targetUrl), 15000);
    } catch {}
  }

  // For Android-like intent routing on the web & WebViews:
  // Tapping downloads or triggers the registered app intent:
  //   APK → Package Installer
  //   PDF → PDF reader chooser
  //   DOCX → Office app
  //   MP4 → Video player
  const a = document.createElement('a');
  a.href = targetUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.download = filename;
  if (mimeType) a.type = mimeType;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
