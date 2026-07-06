/**
 * ════════════════════════════════════════════════════════════════
 *  MESSAGE BUBBLE
 *  ────────────────────────────────────────────────────────────────
 *  The ONLY renderer for chat message bodies.
 *
 *  Renders based on MessageKind from classifyMessage().
 *  There is NO link preview system.
 *  There are NO preview cards.
 *  Social media URLs are already converted to real media before
 *  they reach this component.
 *
 *  Text messages: URLs are shown verbatim as clickable <a> links.
 *  Nothing more.
 * ════════════════════════════════════════════════════════════════ */

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classifyMessage, type ClassifiedMessage, type MessageKind } from '../lib/message-integrity';
import { AnimatedEmojiMessage } from './AnimatedEmojiMessage';
import { SecureImage, SecureVideoThumbnail, type MediaViewerItem } from './MediaViewer';
import { UniversalStoryCard } from './StoryCanvasComposer';
import { VoiceNote } from './VoiceNote';
import { isFileMessage, decodeFileMessage } from '../lib/jscord-upload';
import { FileAttachmentBubble } from './FileAttachmentBubble';

// ── Public props ──────────────────────────────────────────────────
export interface MessageBubbleProps {
  rawText: string;
  sender: 'me' | 'them';
  time: string;
  uploading?: boolean;
  /** 0–100, only meaningful when uploading=true */
  uploadProgress?: number;
  /** Upload to cloud storage failed — show retry affordance */
  uploadFailed?: boolean;
  /** Called when user taps retry on a failed file upload */
  onRetryUpload?: () => void;
  deleting?: boolean;
  onOpenMedia: (item: MediaViewerItem) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPointerDown: () => void;
  onPointerUp: () => void;
}

// ── Read-receipt tick ─────────────────────────────────────────────
function DoubleCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12l5 5L17 6" />
      <path d="M8 12l5 5L23 6" />
    </svg>
  );
}

// ── Recovery placeholder ──────────────────────────────────────────
const RECOVERY_LABEL: Record<MessageKind, string> = {
  image:          'Recovering image…',
  video:          'Recovering video…',
  voice:          'Recovering voice…',
  gif:            'Recovering GIF…',
  animated_emoji: 'Recovering emoji…',
  story:          'Recovering story…',
  processing:     '',
  text:           '',
};

function MediaRecovery({ kind }: { kind: MessageKind }) {
  return (
    <div
      className="flex items-center gap-2 py-4 px-5 rounded-[22px]"
      style={{ minWidth: 160, minHeight: 80, background: 'rgba(15,13,10,0.6)', border: '1px solid rgba(216,173,90,0.12)' }}
    >
      <span className="typing-dot" />
      <span className="typing-dot" style={{ animationDelay: '0.18s' }} />
      <span className="typing-dot" style={{ animationDelay: '0.36s' }} />
      <span className="text-[11px] text-[#a08f76] font-semibold ml-1">{RECOVERY_LABEL[kind]}</span>
    </div>
  );
}

// ── Uploading overlay ─────────────────────────────────────────────
function UploadingOverlay() {
  return (
    <div
      className="absolute inset-[3px] rounded-[19px] flex items-center justify-center"
      style={{ background: 'var(--bg-image-badge)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
        style={{ background: 'var(--bg-image-badge-inner)', border: '1px solid var(--border-token-chip)' }}
      >
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: '0.18s' }} />
        <span className="typing-dot" style={{ animationDelay: '0.36s' }} />
      </div>
    </div>
  );
}

// ── Bubble shell ──────────────────────────────────────────────────
function BubbleShell({ sender, children, pad = true }: { sender: 'me' | 'them'; children: React.ReactNode; pad?: boolean }) {
  if (sender === 'me') {
    return (
      <div
        className="relative overflow-hidden rounded-[22px] gold-solid-flat rounded-tr-md"
        style={{ padding: pad ? 3 : 0, textShadow: 'none' }}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className="relative overflow-hidden rounded-[22px] bg-[#1A1814] rounded-tl-md"
      style={{ padding: pad ? 3 : 0, border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {children}
    </div>
  );
}

// ── Processing bubble ─────────────────────────────────────────────
// Shown while social-media extraction is running in sendMessage().
function ProcessingBubble({ sender }: { sender: 'me' | 'them' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.88, y: -6 }}
      transition={{ type: 'spring' as const, stiffness: 460, damping: 28, mass: 0.7 }}
      className={`flex items-center gap-2 px-4 py-[10px] rounded-[22px] ${
        sender === 'me'
          ? 'gold-solid-flat text-black rounded-tr-md'
          : 'bg-[#1A1814] text-[#F3EADB] rounded-tl-md'
      }`}
      style={sender === 'me' ? { textShadow: 'none' } : { border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <span
        className="text-[13px] font-semibold select-none"
        style={{ color: sender === 'me' ? 'rgba(0,0,0,0.65)' : 'var(--text-tertiary, #8A7D67)' }}
      >
        Processing
      </span>
      <span className="flex items-center gap-[3px] pb-[1px]">
        <span className="typing-dot" style={{ width: 4, height: 4 }} />
        <span className="typing-dot" style={{ width: 4, height: 4, animationDelay: '0.22s' }} />
        <span className="typing-dot" style={{ width: 4, height: 4, animationDelay: '0.44s' }} />
      </span>
    </motion.div>
  );
}

// ── Text bubble ───────────────────────────────────────────────────
// URLs are rendered verbatim as clickable <a> tags. No preview cards.
// No metadata. No thumbnails. Just the URL the user sent.
const HTTP_URL_RE = /https?:\/\/[^\s<>"'`\\\)\]]+/gi;

function renderWithLinks(text: string, sender: 'me' | 'them'): React.ReactNode {
  const matches = [...text.matchAll(HTTP_URL_RE)];
  if (matches.length === 0) return text;
  const color = sender === 'me' ? '#1a3a6b' : '#7FB3FF';
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const m of matches) {
    const idx = m.index!;
    if (idx > cursor) nodes.push(<span key={key++}>{text.slice(cursor, idx)}</span>);
    nodes.push(
      <a key={key++} href={m[0]} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color, textDecoration: 'underline', wordBreak: 'break-all' }}>
        {m[0]}
      </a>
    );
    cursor = idx + m[0].length;
  }
  if (cursor < text.length) nodes.push(<span key={key++}>{text.slice(cursor)}</span>);
  return nodes;
}

function TextBubble({ sender, text }: { sender: 'me' | 'them'; text: string }) {
  return (
    <div
      className={`px-4 py-2.5 rounded-[22px] text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
        sender === 'me'
          ? 'gold-solid-flat text-black rounded-tr-md font-medium'
          : 'bg-[#1A1814] text-[#F3EADB] rounded-tl-md font-medium'
      }`}
      style={sender === 'me' ? { textShadow: 'none' } : { border: '1px solid rgba(255,255,255,0.05)' }}
    >
      {renderWithLinks(text, sender)}
    </div>
  );
}

// ── Image bubble ──────────────────────────────────────────────────
function ImageBubble({ url, sender, uploading, onOpen }: { url: string; sender: 'me' | 'them'; uploading?: boolean; onOpen: () => void }) {
  return (
    <BubbleShell sender={sender}>
      <SecureImage
        url={url} alt="" onClick={onOpen}
        className="block rounded-[19px] cursor-zoom-in select-none"
        style={{ maxWidth: 300, maxHeight: 400, width: 'auto', height: 'auto', objectFit: 'cover', background: 'var(--bg-body)' }}
      />
      {uploading && <UploadingOverlay />}
    </BubbleShell>
  );
}

// ── Video bubble ──────────────────────────────────────────────────
function VideoBubble({ url, sender, uploading, onOpen }: { url: string; sender: 'me' | 'them'; uploading?: boolean; onOpen: () => void }) {
  return (
    <BubbleShell sender={sender}>
      <SecureVideoThumbnail url={url} onClick={onOpen} />
      {uploading && <UploadingOverlay />}
    </BubbleShell>
  );
}

// ── Voice bubble ──────────────────────────────────────────────────
function VoiceBubble({ url, sender }: { url: string; sender: 'me' | 'them' }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[22px] px-4 py-3 ${
        sender === 'me' ? 'gold-solid-flat rounded-tr-md' : 'bg-[#1A1814] rounded-tl-md'
      }`}
      style={sender === 'me' ? { textShadow: 'none' } : { border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}
    >
      <div onContextMenu={e => e.preventDefault()}>
        <VoiceNote rawUrl={url} sender={sender} />
      </div>
    </div>
  );
}

// ── Story bubble ──────────────────────────────────────────────────
function StoryBubble({ raw }: { raw: string }) {
  return <UniversalStoryCard nudgeText={raw} compact />;
}

// ── The body dispatcher ───────────────────────────────────────────
function BubbleBody({
  classified, sender, uploading, onOpenMedia,
}: {
  classified: ClassifiedMessage;
  sender: 'me' | 'them';
  uploading?: boolean;
  onOpenMedia: (item: MediaViewerItem) => void;
}) {
  const { kind, mediaUrl, displayText, needsRecovery } = classified;

  // Processing: social extraction happening right now
  if (kind === 'processing') return <ProcessingBubble sender={sender} />;

  // Recovery: marker was present but URL is broken
  if (needsRecovery && kind !== 'text') return <MediaRecovery kind={kind} />;

  switch (kind) {
    case 'animated_emoji':
      return <AnimatedEmojiMessage emoji={displayText} sender={sender} time="" />;

    case 'image':
      return (
        <ImageBubble url={mediaUrl} sender={sender} uploading={uploading}
          onOpen={() => onOpenMedia({ rawUrl: mediaUrl, secureUrl: null, type: 'image', sender })} />
      );

    case 'video':
      return (
        <VideoBubble url={mediaUrl} sender={sender} uploading={uploading}
          onOpen={() => onOpenMedia({ rawUrl: mediaUrl, secureUrl: null, type: 'video', sender })} />
      );

    case 'voice':
      return mediaUrl
        ? <VoiceBubble url={mediaUrl} sender={sender} />
        : (
          <div className="flex items-center gap-1.5 px-3 py-2.5">
            <span className="typing-dot" /><span className="typing-dot" style={{ animationDelay: '0.18s' }} />
            <span className="typing-dot" style={{ animationDelay: '0.36s' }} />
            <span className="text-[10px] text-[#6E6353] font-semibold ml-1">Loading…</span>
          </div>
        );

    case 'gif':
      return (
        <ImageBubble url={mediaUrl} sender={sender}
          onOpen={() => onOpenMedia({ rawUrl: mediaUrl, secureUrl: null, type: 'image', sender })} />
      );

    case 'story':
      return <StoryBubble raw={mediaUrl} />;

    case 'text':
    default:
      // Plain text — URLs shown as clickable links, nothing more.
      return <TextBubble sender={sender} text={displayText} />;
  }
}

// ── File attachment bubble (PDF, APK, ZIP, DOC, etc.) ─────────────
// ── Old FileBubble helpers removed — now using FileAttachmentBubble ──────────

// ── The exported MessageBubble ────────────────────────────────────
export const MessageBubble = memo(function MessageBubble({
  rawText, sender, time, uploading, uploadProgress, uploadFailed, onRetryUpload,
  deleting, onOpenMedia, onContextMenu, onPointerDown, onPointerUp,
}: MessageBubbleProps) {
  const isOwnMsg = sender === 'me';

  // Handle file attachments first (before classifyMessage)
  if (isFileMessage(rawText)) {
    const { filename, url, size, mimeType } = decodeFileMessage(rawText);
    return (
      <motion.div
        layout
        animate={
          deleting
            ? { opacity: 0, scaleX: 0.72, scaleY: 0.55, x: isOwnMsg ? 60 : -60, y: -8, filter: 'blur(6px)' }
            : { opacity: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, filter: 'blur(0px)' }
        }
        transition={deleting ? { duration: 0.34, ease: [0.4, 0, 1, 1] } : { duration: 0 }}
        style={{ originX: isOwnMsg ? 1 : 0, originY: 1, userSelect: 'none', WebkitUserSelect: 'none' }}
        className={`flex flex-col msg-in ${isOwnMsg ? 'items-end' : 'items-start'} select-none`}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="relative" style={{ maxWidth: '88%' }}>
          <FileAttachmentBubble
            filename={filename}
            url={url}
            size={size}
            mimeType={mimeType}
            sender={sender}
            uploading={uploading}
            uploadProgress={uploadProgress}
            uploadFailed={uploadFailed}
            onRetry={onRetryUpload}
          />
          <div className={`flex items-center gap-1.5 mt-1.5 ${isOwnMsg ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-chat-time)' }}>{time}</span>
            {isOwnMsg && (
              <span style={{ color: 'var(--text-faint)', transition: 'color 0.4s ease' }}>
                <DoubleCheck />
              </span>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  const classified = classifyMessage(rawText);
  const hideTimestamp = classified.kind === 'animated_emoji' || classified.kind === 'processing';

  const maxWidthStyle: React.CSSProperties =
    classified.kind === 'animated_emoji' ? {} :
    classified.kind === 'story'          ? { maxWidth: '92%', width: '100%' } :
                                           { maxWidth: '85%' };

  return (
    <motion.div
      layout
      animate={
        deleting
          ? { opacity: 0, scaleX: 0.72, scaleY: 0.55, x: isOwnMsg ? 60 : -60, y: -8, filter: 'blur(6px)' }
          : { opacity: 1, scaleX: 1, scaleY: 1, x: 0, y: 0, filter: 'blur(0px)' }
      }
      transition={deleting ? { duration: 0.34, ease: [0.4, 0, 1, 1] } : { duration: 0 }}
      style={{ originX: isOwnMsg ? 1 : 0, originY: 1, userSelect: 'none', WebkitUserSelect: 'none' }}
      className={`flex flex-col msg-in ${isOwnMsg ? 'items-end' : 'items-start'} select-none`}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <div className="relative" style={maxWidthStyle}>
        <AnimatePresence mode="wait">
          <BubbleBody
            key={classified.kind === 'processing' ? 'processing' : rawText}
            classified={classified}
            sender={sender}
            uploading={uploading}
            onOpenMedia={onOpenMedia}
          />
        </AnimatePresence>

        {!hideTimestamp && (
          <div className={`flex items-center gap-1.5 mt-1.5 ${isOwnMsg ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] font-bold" style={{ color: 'var(--text-chat-time)' }}>{time}</span>
            {isOwnMsg && (
              <span style={{ color: 'var(--text-faint)', transition: 'color 0.4s ease' }}>
                <DoubleCheck />
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});
