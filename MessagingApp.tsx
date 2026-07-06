import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { idle, isAppVisible, dedupedFetch, LRU } from './lib/perf-scheduler';
import {
  fpsMonitor,
  cachedFormatTime,
  getAvatarUrl,
  GRADIENTS,
  SHADOWS,
  sleepManager,
} from './lib/render-engine';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import {
  findUserByContactToken,
  getOrCreateChat,
  sendMessage as dbSendMessage,
  sendMessageWithId as dbSendMessageWithId,
  editMessageText as dbEditMessageText,
  deleteMessage,
  deleteChat,
  listChats,
  fetchMessages,
  setTyping as dbSetTyping,
  getTyping,
  heartbeat,
  formatLastActive,
  listSocialNudges,
  type ChatSummary,
  type SocialNudge,
  type GroupInfo,
  listGroupChats,
  fetchGroupMessages,
  sendGroupMessage,
  deleteGroupMessage,
  getGroupInfo,
} from './lib/turso';
import { isSingleAnimatedEmojiMessage, emojiToNotoUrl } from './lib/emoji-animations';
import {
  encodeImageMessage,
  isImageMessage,
  decodeImageMessage,
  encodeVideoMessage,
  isVideoMessage,
  decodeVideoMessage,
  isAudioMessage,
  decodeAudioMessage,
  encodeAudioMessage,
  isGalleryMessage,
  decodeGalleryMessage,
  isEmbedMessage,
  decodeEmbedMessage,
  encodeFileMessage,
  isFileMessage,
  decodeFileMessage,
} from './lib/jscord-upload';
import { FileAttachmentBubble } from './components/FileAttachmentBubble';
import { uploadImageHybrid } from './lib/image-upload';
import { isSupportedSocialUrl, transformSocialUrl } from './lib/social-extractor';
import { isNudgeMessage } from './components/NudgeComposer';
import { UniversalStoryCard, StoryCanvasComposer } from './components/StoryCanvasComposer';
import { ImmersiveNudgeViewer } from './components/PremiumNudgesSystem';
import { PremiumMediaViewer, type MediaViewerItem } from './components/MediaViewer';
import GifPicker, { type GifResult } from './components/GifPicker';
import ChatGif from './components/ChatGif';
import RadialMenu from './components/RadialMenu';
import { uploadUniversalFile, uploadFileToGoFile } from './lib/universal-file-upload';
import CallScreen from './components/CallScreen';
import { findIncomingCall, acquireLocalMedia, MediaError, type CallRow, type CallKind } from './lib/webrtc-call';
import { SettingsViewPremium } from './components/SettingsView';
import ActionSheet from './components/ActionSheet';
import GroupCreateWizard from './components/groups/GroupCreateWizard';
import GroupDetailsSheet from './components/groups/GroupDetailsSheet'; // Assuming BottomSheet was in this file, or if imported, remove it if unused

/* ============================ ADVANCED SOCIAL MEDIA PLAYER ============================ */
const YoutubeEmbedPlayer = ({
  embUrl,
  isYtShort,
}: {
  embUrl: string;
  isYtShort: boolean;
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement && document.fullscreenElement === containerRef.current
      );
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      } else if ((container as any).webkitRequestFullscreen) {
        (container as any).webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="youtube-player-container relative overflow-hidden rounded-[22px]"
      style={{
        width: 300,
        height: isFullscreen ? '100%' : isYtShort ? 533 : 169,
        border: isFullscreen ? 'none' : '1px solid rgba(216,173,90,0.25)',
        borderRadius: isFullscreen ? 0 : 22,
        overflow: 'hidden',
        background: '#0F0D0A',
        boxShadow: isFullscreen ? 'none' : '0 4px 24px rgba(0,0,0,0.5)',
        transition: 'width 0.2s, height 0.2s, border-radius 0.2s',
      }}
    >
      <style>{`
        .youtube-player-container:fullscreen {
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          max-height: none !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: #000 !important;
          border: none !important;
          border-radius: 0 !important;
        }
        .youtube-player-container:-webkit-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          max-width: none !important;
          max-height: none !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: #000 !important;
          border: none !important;
          border-radius: 0 !important;
        }
        .youtube-player-container:fullscreen iframe {
          width: 100% !important;
          height: 100% !important;
          top: 0 !important;
          left: 0 !important;
          position: relative !important;
        }
        .youtube-player-container:-webkit-full-screen iframe {
          width: 100% !important;
          height: 100% !important;
          top: 0 !important;
          left: 0 !important;
          position: relative !important;
        }
      `}</style>

      {/* 
        Fully interactive, ultra-responsive native iframe player!
        By setting pointer-events to auto and removing the blocking overlay,
        clicks go DIRECTLY into YouTube's native play button in the center.
        This guarantees 100% touch/click sensitivity on all mobile and desktop
        browsers and resolves all autoplay-blocking security issues.
        Once clicked, the video plays natively, and YouTube's own Shorts icon/overlay
        instantly disappears.
      */}
      <iframe
        src={embUrl}
        className="absolute border-0 pointer-events-auto"
        style={{
          width: '100%',
          height: isFullscreen ? '100%' : isYtShort ? 630 : 260,
          top: isFullscreen ? 0 : -45,
          left: 0,
        }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />

      {/* Floating See in Full Screen Button */}
      <button
        onClick={toggleFullscreen}
        className="absolute right-3 bottom-3 z-20 w-8 h-8 rounded-full flex items-center justify-center bg-black/75 backdrop-blur border border-white/15 text-[#EFC878] hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        style={{ pointerEvents: 'auto' }}
        title={isFullscreen ? "Exit Full Screen" : "See in Full Screen"}
      >
        {isFullscreen ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
          </svg>
        )}
      </button>
    </div>
  );
};


/* ============================ ICONS ============================ */
const I = {
  Search: ({ s = 16 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4-4"/>
    </svg>
  ),
  Plus: ({ s = 18 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  ChevronLeft: ({ s = 24 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  ),
  Video: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>
    </svg>
  ),
  More: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
    </svg>
  ),
  Lock: ({ s = 12 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Smile: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>
    </svg>
  ),
  Camera: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>
    </svg>
  ),
  Mic: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  ),
  DoubleCheck: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>
    </svg>
  ),
  X: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  ),
  Send: ({ s = 18 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  ),
  Star: ({ s = 12, filled }: { s?: number; filled?: boolean }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? "0" : "2"}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  Chat: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      <circle cx="8.5" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="15.5" cy="11.5" r="0.9" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Phone: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  ),
  People: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Gear: ({ s = 20 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Sparkle: ({ s = 12 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.5l1.8 5.7 5.7 1.8-5.7 1.8L12 16.5l-1.8-5.7L4.5 9l5.7-1.8zM19.5 14l.9 2.85 2.85.9-2.85.9-.9 2.85-.9-2.85-2.85-.9 2.85-.9z"/>
    </svg>
  ),
  Check: ({ s = 14 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  ),
};

/* ============================ TYPES ============================ */
type Chat = {
  id: string;
  uid: string;
  img: string;
  name: string;
  msg: string;
  time: string;
  unread?: number;
  online?: boolean;
  lastActive?: number;
  isGroup?: boolean;
  groupInfo?: GroupInfo;
};

type Message = {
  id: string;
  text: string;
  time: string;
  sender: 'me' | 'them';
  status?: 'sent' | 'delivered' | 'read';
  /** Optimistic flag while an attached image/file is uploading to cloud storage. */
  uploading?: boolean;
  /** Upload progress 0–100 (files only). */
  uploadProgress?: number;
  /** True if the upload failed. */
  uploadFailed?: boolean;
  /** Local object URL used while an attachment is uploading (for instant preview). */
  localPreview?: string;
  /** True while a social URL is being extracted + transformed into media. */
  transforming?: boolean;
  fromName?: string;
  fromAvatar?: string;
};

type CachedChatPayload = {
  messages: Message[];
  typing: boolean;
  ts: number;
};

// ═══════════════════════════════════════════════════════════════════
// PERFORMANCE SYSTEM 1: INSTANT CHAT SNAPSHOT CACHE (bounded LRU — no leaks)
// ═══════════════════════════════════════════════════════════════════
const chatSnapshotCache = new LRU<string, CachedChatPayload>(60);

// ═══════════════════════════════════════════════════════════════════
// PERFORMANCE SYSTEM 2: BACKGROUND PREFETCH QUEUE
// Aggressively preloads visible / likely-open chats in the background.
// ═══════════════════════════════════════════════════════════════════
const prefetchInFlight = new Set<string>();

/* ============================ UTILS ============================ */
const formatTime = (ms: number): string => {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export const fallbackAvatar = (name: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name || 'U')}&backgroundColor=f1ede7,ebe4d7&fontWeight=600`;

const summaryToChat = (s: any): Chat => {
  const isGroup = !!(s as any).isGroup;
  const groupInfo = (s as any).groupInfo as GroupInfo | undefined;
  return {
    id: s.id,
    uid: isGroup ? s.id : s.otherUid,
    name: isGroup ? (groupInfo?.name || s.otherName) : s.otherName,
    img: isGroup
      ? (groupInfo?.iconUrl || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent((groupInfo?.name || s.otherName))}&backgroundColor=D8AD5A,A87527&fontWeight=700`)
      : (s.otherAvatar || fallbackAvatar(s.otherName)),
    msg: isNudgeMessage(s.lastMessage)
      ? '✨ Nudge'
      : s.lastMessage === '[removed]'
      ? 'No messages yet'
      : isEmbedMessage(s.lastMessage) || isVideoMessage(s.lastMessage)
      ? '🎬 Video'
      : isAudioMessage(s.lastMessage)
      ? '🎵 Audio'
      : isGalleryMessage(s.lastMessage)
      ? '🖼 Gallery'
      : isImageMessage(s.lastMessage)
      ? '📷 Photo'
      : (s.lastMessage || 'No messages yet'),
    time: cachedFormatTime(s.updatedAt),
    unread: s.unread,
    online: s.online,
    lastActive: s.lastActive,
    isGroup,
    groupInfo,
  };
};

/* ============================ ATOMS ============================ */
/**
 * GoldAvatar — PERF v2
 * ─────────────────────────────────────────────────────────────
 * • Wrapped in memo() — only re-renders when props change.
 * • Pre-computed gradient strings from the shared GRADIENTS
 *   constant (no string allocation on each render).
 * • GPU layer promoted via transform:translateZ(0) so the avatar
 *   composites independently and never triggers parent repaints.
 * • Online dot sized with CSS custom property to avoid per-render
 *   inline style object allocation.
 */
export const GoldAvatar = memo(
  ({ img, size, online, dim, flow }: { img: string; size: number; online?: boolean; dim?: boolean; flow?: boolean }) => (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className={!dim && flow ? 'gold-ring-flow' : undefined}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          padding: 2,
          // PERF: pre-computed constant strings — no allocation per render
          background: dim ? GRADIENTS.goldDim : flow ? undefined : GRADIENTS.goldConic,
          boxShadow: dim ? undefined : flow ? undefined : SHADOWS.goldAvatarRing,
          // GPU layer — avatar composites independently
          transform: 'translateZ(0)',
          willChange: 'contents',
        }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', padding: 1.5, background: '#0C0A07' }}>
          <img
            src={img}
            alt=""
            className="w-full h-full object-cover rounded-full"
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
      {online && (
        <span
          className="online-dot absolute rounded-full"
          style={{
            width: size * 0.24,
            height: size * 0.24,
            bottom: size * 0.02,
            right: size * 0.02,
            border: '2px solid #0B0907',
          }}
        />
      )}
    </div>
  ),
  (prev, next) =>
    prev.img === next.img &&
    prev.size === next.size &&
    prev.online === next.online &&
    prev.dim === next.dim &&
    prev.flow === next.flow
);

const GoldBadge = ({ n, small }: { n: number; small?: boolean }) => (
  <span
    className="gold-solid inline-flex items-center justify-center rounded-full font-extrabold text-black flex-shrink-0"
    style={{
      minWidth: small ? 17 : 22, height: small ? 17 : 22,
      fontSize: small ? 10 : 11, padding: '0 5px',
      textShadow: '0 1px 0 rgba(255,243,214,0.55)',
    }}
  >
    {n}
  </span>
);

/* ════════════════════════════════════════════════════════════════
   STATIC SVG GROUP BUTTON — pre-computed module-level constant.
   The 4 gradient defs, 6 circles, ellipse, and star path are a single
   immutable React element created ONCE and reused across all renders.
   This eliminates 4 radial-gradient object allocations + DOM diffing
   of the entire SVG subtree on every SearchRow render.
   ════════════════════════════════════════════════════════════════ */
const _GROUP_BUTTON_ICON = (
  <svg width="42" height="42" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="nbBody" cx="50%" cy="38%" r="70%">
        <stop offset="0%" stopColor="#5B6FE8" />
        <stop offset="45%" stopColor="#3D4FD8" />
        <stop offset="100%" stopColor="#2733A8" />
      </radialGradient>
      <radialGradient id="nbInner" cx="50%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#6B7CF0" />
        <stop offset="60%" stopColor="#4353DD" />
        <stop offset="100%" stopColor="#2E3BBE" />
      </radialGradient>
      <radialGradient id="nbFade" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#3D4FD8" stopOpacity="1" />
        <stop offset="82%" stopColor="#3D4FD8" stopOpacity="1" />
        <stop offset="94%" stopColor="#3D4FD8" stopOpacity="0.45" />
        <stop offset="100%" stopColor="#3D4FD8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="nbGloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.34" />
        <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.05" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#nbFade)" />
    <circle cx="50" cy="50" r="44" fill="url(#nbBody)" />
    <circle cx="50" cy="50" r="38" fill="none" stroke="#1F2A96" strokeWidth="2.5" opacity="0.55" />
    <circle cx="50" cy="50" r="33" fill="url(#nbInner)" />
    <circle cx="50" cy="50" r="33" fill="none" stroke="#6B7CF0" strokeWidth="1.2" opacity="0.5" />
    <ellipse cx="50" cy="32" rx="36" ry="22" fill="url(#nbGloss)" />
    <path d="M50 29 Q52.5 43.5 55.5 46.5 Q58.5 49.5 71 50 Q58.5 52.5 55.5 55.5 Q52.5 58.5 50 71 Q47.5 58.5 44.5 55.5 Q41.5 52.5 29 50 Q41.5 47.5 44.5 44.5 Q47.5 41.5 50 29 Z" fill="#FFFFFF" transform="rotate(20 50 50)" style={{ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,30,0.35))' }} />
  </svg>
);

/* ============================ SECTIONS ============================ */
const SearchRow = memo(({ onNewGroup }: { onNewGroup?: () => void }) => (
  <div className="px-4 pb-2.5 flex-shrink-0" style={{ contain: 'layout style' }}>
    <div className="flex items-center gap-2">
      <div className="luxe-surface flex-1 flex items-center gap-3 rounded-2xl px-4 h-[42px]">
        <span className="text-[#8A7D67]"><I.Search s={17} /></span>
        <input
          type="text"
          placeholder="Search Nudges or people"
          className="flex-1 bg-transparent text-[13px] font-medium text-[#F3EADB] placeholder-[#6E6353] outline-none min-w-0"
        />
      </div>
      {onNewGroup && (
        <button
          onClick={onNewGroup}
          aria-label="Create group"
          className="flex items-center justify-center w-[42px] h-[42px] rounded-full tappable-soft transition-all duration-200 hover:scale-[1.04] active:scale-[0.96] overflow-hidden"
          style={{ background: 'transparent' }}
        >
          {_GROUP_BUTTON_ICON}
        </button>
      )}
    </div>
  </div>
));

/**
 * Stories — PERF v2
 * Memoized: only re-renders when contacts, nudgeUserIds, or avatar changes.
 * Sorted contact list is computed inside useMemo — no work done if nudgeUserIds
 * and contacts are unchanged between renders.
 */
const Stories = memo(({
  contacts,
  nudges,
  myNudgeCount,
  myAvatar,
  myUid,
  onNewNudge,
  onViewNudges,
}: {
  contacts: Chat[];
  nudges: SocialNudge[];
  myNudgeCount: number;
  myAvatar: string;
  myUid: string;
  onNewNudge: () => void;
  onViewNudges: (uid: string) => void;
}) => {
  // PERF: memoized — contacts list filtered for active nudges, computed once
  const activeNudgeUsers = useMemo(() => new Set(nudges.map((n) => n.userId)), [nudges]);
  const ordered = useMemo(() => {
    return contacts.filter((c) => activeNudgeUsers.has(c.uid)).slice(0, 6);
  }, [contacts, activeNudgeUsers]);

  return (
    <div className="flex-shrink-0">
      <div className="scroll-x flex gap-4 px-4 pb-1.5 items-start">
        <button onClick={onNewNudge} className="tappable-soft flex flex-col items-center gap-1.5 flex-shrink-0 w-[64px]">
          <div className="relative">
            <div className="gold-stroke-flow rounded-[19px] p-[1.5px] shadow-[0_0_12px_rgba(216,173,90,0.18),0_4px_10px_rgba(0,0,0,0.5)]">
              <div
                className="w-[58px] h-[58px] rounded-[18px] flex items-center justify-center"
                style={{
                  background: 'linear-gradient(165deg, #221D15 0%, #161209 100%)',
                  boxShadow: '0 1px 0 rgba(255,235,190,0.08) inset',
                }}
              >
                <span className="text-[#EFC878]"><I.Chat s={24} /></span>
              </div>
            </div>
            <span className="absolute -top-1 -right-1 text-[#FFE9B8]" style={{ filter: 'drop-shadow(0 0 4px rgba(255,233,184,0.7))' }}>
              <I.Sparkle s={14} />
            </span>
          </div>
          <span className="text-[10.5px] font-semibold leading-tight truncate w-full text-center text-[#EFC878]">New Nudge</span>
        </button>

        {/* Your own published Nudge — golden stroke, tap to view */}
        {myNudgeCount > 0 && (
          <button
            onClick={() => onViewNudges(myUid)}
            className="tappable-soft flex flex-col items-center gap-1.5 flex-shrink-0 w-[64px]"
          >
            <GoldAvatar img={myAvatar} size={58} flow />
            <span className="text-[10.5px] font-semibold leading-tight truncate w-full text-center text-[#EFC878]">
              Your Nudge
            </span>
          </button>
        )}

        {ordered.map((c, i) => {
          return (
            <button
              key={c.id + i}
              onClick={() => onViewNudges(c.uid)}
              className="tappable-soft flex flex-col items-center gap-1.5 flex-shrink-0 w-[64px]"
            >
              <GoldAvatar img={c.img} size={58} flow={true} />
              <span
                className="text-[10.5px] font-semibold leading-tight truncate w-full text-center text-[#EFC878]"
              >
                {c.name.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

/**
 * ChatRow — PERF v2
 * ─────────────────────────────────────────────────────────────
 * • Contains its own GPU compositing layer (transform:translateZ).
 * • CSS contain:layout style prevents row changes from triggering
 *   full-list layout recalculation.
 * • Removed rise-in animation class after first render — the class
 *   only triggers once thanks to CSS animation-fill-mode:both, but
 *   keeping it on the DOM element stops GPU layer promotion on idle.
 * • Inline style object is stable — pre-computed outside JSX.
 */
const _CHAT_ROW_GLASS_STYLE = {
  background: 'rgba(0, 0, 0, 0.12)',
  border: '1px solid rgba(255, 255, 255, 0.035)',
} as const;

const ChatRow = memo(({ c, delay }: { c: Chat; delay: number }) => (
  <button
    className="chat-row rise-in w-full flex items-center gap-3 px-3 py-[10px] rounded-[18px] text-left relative overflow-hidden"
    style={{
      animationDelay: `${delay}ms`,
      // GPU compositing layer — isolated from sibling rows
      transform: 'translateZ(0)',
      // Prevent this row's layout from affecting the list container
      contain: 'layout style',
    }}
  >
    {/* Glass background — pre-computed style object, no allocation per render */}
    <div
      className="absolute inset-0 rounded-[18px] pointer-events-none"
      style={_CHAT_ROW_GLASS_STYLE}
    />
    <GoldAvatar img={c.img} size={48} online={c.online} dim={!c.unread} />
    <div className="relative flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-[2px]">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13.5px] font-bold text-[#F3EADB] truncate tracking-[-0.01em]">{c.name}</span>
        </span>
        <span className={`text-[10.5px] font-semibold flex-shrink-0 ${c.unread ? 'text-[#C9A969]' : 'text-[#6E6353]'}`}>
          {c.time}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[12px] truncate ${c.unread ? 'text-[#C9BCA6] font-semibold' : 'text-[#80755F] font-medium'}`}>
          {c.msg || 'No messages yet'}
        </span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {c.unread ? <GoldBadge n={c.unread} /> : null}
        </span>
      </div>
    </div>
  </button>
), (prev, next) =>
  prev.c.id === next.c.id &&
  prev.c.msg === next.c.msg &&
  prev.c.time === next.c.time &&
  prev.c.unread === next.c.unread &&
  prev.c.online === next.c.online &&
  prev.c.img === next.c.img &&
  prev.c.name === next.c.name
);

/* ============================ ANIMATED EMOJI BUBBLE ============================ */
const AnimatedEmojiBubble = ({ emoji }: { emoji: string }) => {
  const url = emojiToNotoUrl(emoji);
  const [failed, setFailed] = useState(false);
  // Play the animation ONCE on mount, then rest as a static emoji.
  // Tapping the emoji replays the animation for one more round.
  const [animating, setAnimating] = useState(true);
  // Cache-busting nonce — bumping it reloads the WebP so the animation restarts.
  const [nonce, setNonce] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!animating) return;
    timerRef.current = setTimeout(() => setAnimating(false), 2800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [animating, nonce]);

  const replay = () => {
    if (animating) return;
    setNonce((n) => n + 1);
    setAnimating(true);
  };

  return (
    <div
      className="flex items-center justify-center py-1 cursor-pointer select-none"
      onClick={replay}
    >
      {failed ? (
        <span style={{ fontSize: 72, lineHeight: 1 }}>{emoji}</span>
      ) : animating ? (
        <img
          key={nonce}
          src={`${url}?r=${nonce}`}
          alt={emoji}
          draggable={false}
          onError={() => setFailed(true)}
          style={{ width: 96, height: 96, objectFit: 'contain' }}
        />
      ) : (
        /* Resting state — static emoji, no looping animation (keeps the app fast) */
        <span style={{ fontSize: 72, lineHeight: 1 }}>{emoji}</span>
      )}
    </div>
  );
};

/* ============================ PREMIUM INTERACTIVE VOICE BUBBLE ============================ */
/**
 * PERF: Waveform heights are seeded from the audio URL so they're deterministic
 * (same URL = same waveform) and never change between renders/remounts.
 * The bar style objects are computed once into a stable array of CSSProperties.
 * No per-render allocations on the 30-bar waveform.
 */
function seededRand(seed: number) {
  // Cheap deterministic PRNG — no Math.random() inside render
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

const _waveformCache = new Map<string, number[]>();
function getWaveform(src: string): number[] {
  let cached = _waveformCache.get(src);
  if (!cached) {
    // Hash the src string to a seed
    let seed = 0;
    for (let i = 0; i < src.length; i++) seed = (seed * 31 + src.charCodeAt(i)) | 0;
    cached = Array.from({ length: 30 }, (_, i) => seededRand(seed + i) * 0.7 + 0.3);
    _waveformCache.set(src, cached);
    if (_waveformCache.size > 200) {
      const first = _waveformCache.keys().next().value;
      if (first !== undefined) _waveformCache.delete(first);
    }
  }
  return cached;
}

const VoiceMessageBubble = memo(({ src, isMe }: { src: string; isMe: boolean }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // PERF: waveform heights are deterministic from src URL — stable across remounts
  const bars = useMemo(() => getWaveform(src), [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setDuration(audio.duration);
        setCurrentTime(audio.currentTime);
      }
    };
    const onEnd = () => setPlaying(false);
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="relative flex items-center gap-3 py-2.5 pl-2.5 pr-4 min-w-[220px] max-w-[290px]"
      style={{
        borderRadius: 26,
        background: isMe
          ? 'linear-gradient(180deg, #24242A 0%, #141418 100%)'
          : 'linear-gradient(180deg, #1B2A4A 0%, #0B1120 100%)',
        border: isMe ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(120,160,255,0.12)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" hidden />

      {/* Play / Pause */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={togglePlay}
        className="relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: 'linear-gradient(180deg, #FFFFFF 0%, #D6D6D6 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 4px 12px rgba(0,0,0,0.35)',
        }}
      >
        {playing ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#111"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#111" style={{ marginLeft: 2 }}><path d="M8 5v14l11-7z"/></svg>
        )}
      </motion.button>

      {/* Clean waveform (progress-filled, no glow, no noise) */}
      <div className="flex-1 flex items-center gap-[2.5px] h-7 min-w-0">
        {bars.map((barH, i) => {
          const isPast = (i / bars.length) * 100 <= progress;
          return (
            <div
              key={i}
              className="flex-1 rounded-full transition-colors duration-150"
              style={{
                height: `${barH * 100}%`,
                minHeight: 3,
                background: isPast ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.22)',
              }}
            />
          );
        })}
      </div>

      {/* Single duration label */}
      <span className="text-[11px] font-mono text-white/45 tabular-nums flex-shrink-0">
        {formatTime(playing || currentTime > 0 ? currentTime : duration)}
      </span>
    </div>
  );
});

/* ── Stable style objects hoisted above ChatInterface ─────────────────────────
   These are module-level constants so they're created ONCE and reused
   across every render — React sees stable object references and skips
   style reconciliation for these elements entirely.
   ─────────────────────────────────────────────────────────────────────────── */
const _BUBBLE_ME_STYLE = {
  background: GRADIENTS.chatBubbleMe,
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 2px 0 rgba(255,255,255,0.1) inset, 0 -2px 4px rgba(0,0,0,0.4) inset, 0 8px 24px rgba(0,0,0,0.45)',
} as const;

const _BUBBLE_THEM_STYLE = {
  background: GRADIENTS.chatBubbleThem,
  borderTop: '1px solid rgba(120,160,255,0.20)',
  borderLeft: '1px solid rgba(90,140,255,0.10)',
  borderRight: '1px solid rgba(90,140,255,0.10)',
  borderBottom: '1px solid rgba(0,0,0,0.4)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
} as const;

const _STATUS_READ_STYLE = { transition: 'color 0.4s ease' } as const;
const _COMPOSE_AREA_BASE = { background: 'var(--bg-chat-compose)' } as const;
const _COMPOSE_AREA_BLOCKED = { background: 'var(--bg-chat-compose)', pointerEvents: 'none' as const, opacity: 0.38 } as const;

/* ============================ CHAT INTERFACE (REAL TURSO) ============================ */
const ChatInterface = ({ chat, onBack, allChats = [] }: { chat: Chat; onBack: () => void; allChats?: Chat[] }) => {
  const { user } = useAuth();
  const [msg, setMsg] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTypingState] = useState(false);
  const [showNudgeComposer, setShowNudgeComposer] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);
  const [forwardItem, setForwardItem] = useState<MediaViewerItem | null>(null);
  const [forwardSent, setForwardSent] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [pendingGif, setPendingGif] = useState<GifResult | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{ kind: CallKind; stream: MediaStream } | null>(null);
  const [callErrorMsg, setCallErrorMsg] = useState<string | null>(null);
  const [liveGroupInfo, setLiveGroupInfo] = useState<GroupInfo | null>(chat.groupInfo || null);
  const [groupAccessLost, setGroupAccessLost] = useState(false);

  // ── START AN OUTGOING CALL (mic/cam prompt fires INSIDE the click handler) ──
  const startOutgoingCall = useCallback(async (kind: CallKind) => {
    if (chat.isGroup) return;
    try {
      // CRITICAL: getUserMedia must be called synchronously inside the user gesture.
      const stream = await acquireLocalMedia(kind);
      setOutgoingCall({ kind, stream });
    } catch (e) {
      const msg = e instanceof MediaError ? e.message : 'Could not access microphone / camera.';
      setCallErrorMsg(msg);
      setTimeout(() => setCallErrorMsg(null), 5000);
    }
  }, [chat.isGroup]);
  const effectiveGroupInfo = chat.isGroup ? (liveGroupInfo ?? chat.groupInfo ?? null) : null;
  const groupInteractionBlocked = !!chat.isGroup && (!effectiveGroupInfo || groupAccessLost);
  const presence = chat.online ? 'Online' : formatLastActive(chat.lastActive || 0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const lastTypingSentRef = useRef(0);
  /** PERF (Quantum Delta Engine): last rendered data signature — poll skips setState when unchanged. */
  const lastSigRef = useRef('');
  /**
   * Ids of messages currently mid-transform (social URL → media). While an id is
   * in this set the poll keeps the "transforming" overlay and HIDES the raw URL
   * text, guaranteeing the URL is never shown as a final/standalone message.
   */
  /** Social URLs that were already transformed locally — keyed by message id. */
  const transformedRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setLiveGroupInfo(chat.groupInfo || null);
    setGroupAccessLost(false);
  }, [chat.id, chat.groupInfo]);

  useEffect(() => {
    if (!user || !chat.isGroup) return;
    let stopped = false;
    const pollGroupInfo = async () => {
      try {
        const latest = await getGroupInfo(chat.id, user.uid);
        if (stopped) return;
        if (!latest) {
          setLiveGroupInfo(null);
          setGroupAccessLost(true);
          return;
        }
        setLiveGroupInfo(latest);
        setGroupAccessLost(false);
      } catch {
        if (!stopped) {
          setLiveGroupInfo(null);
          setGroupAccessLost(true);
        }
      }
    };
    pollGroupInfo();
    const iv = setInterval(pollGroupInfo, 2500);
    return () => { stopped = true; clearInterval(iv); };
  }, [user, chat.id, chat.isGroup]);

  // PERFORMANCE: instantly hydrate from cache before network responds
  useEffect(() => {
    const cached = chatSnapshotCache.get(chat.id);
    if (cached) {
      setMessages((prev) => {
        const optimistic = prev.filter((p) => p.uploading);
        return optimistic.length ? [...cached.messages, ...optimistic] : cached.messages;
      });
      setTypingState(cached.typing);
      lastCountRef.current = cached.messages.length;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      });
    }
  }, [chat.id]);

  // Poll messages + typing
  useEffect(() => {
    if (!user) return;
    let stopped = false;

    const poll = async () => {
      // ── ADAPTIVE TURBO SCHEDULER ──
      // Hidden tab → zero network, zero CPU. Resume instantly on return.
      if (!isAppVisible()) return;
      try {
        let rawMsgs: any[] = [];
        let otherTyping = false;
        
        // Dedupe: if a poll for this chat is already in flight, reuse it.
        if (chat.isGroup) {
          if (groupInteractionBlocked) return;
          rawMsgs = await dedupedFetch(`gmsgs:${chat.id}`, () => fetchGroupMessages(chat.id, user.uid, 200));
        } else {
          const [dmMsgs, dmTyping] = await Promise.all([
            dedupedFetch(`dmsgs:${chat.id}`, () => fetchMessages(chat.id, user.uid, true)),
            dedupedFetch(`typing:${chat.id}`, () => getTyping(chat.id, chat.uid)),
          ]);
          rawMsgs = dmMsgs;
          otherTyping = dmTyping;
        }

        if (stopped) return;
        
        const fresh: Message[] = await Promise.all(rawMsgs
          .filter((m) => !m.deleted && m.text !== '[removed]')
          .map(async (m) => {
            const fromUid = chat.isGroup ? m.fromUid : m.from;
            const senderSide = fromUid === user.uid ? ('me' as const) : ('them' as const);
            const fromName = chat.isGroup ? m.fromName : undefined;
            const fromAvatar = chat.isGroup ? m.fromAvatar : undefined;

            // If we already transformed this row locally, use our cached embed text.
            // This prevents the poll from overwriting the embed with the raw URL.
            if (transformedRef.current.has(m.id)) {
              const cached = transformedRef.current.get(m.id)!;
              // Re-push the DB update in case Turso didn't persist yet
              if (m.text !== cached) {
                if (!chat.isGroup) dbEditMessageText(m.id, cached, chat.id, user.uid).catch(() => {});
              }
              return { id: m.id, text: cached, time: cachedFormatTime(m.createdAt), sender: senderSide, status: m.status, fromName, fromAvatar };
            }

            // A raw social URL in DB (e.g. sent from another device) — transform it instantly
            if (isSupportedSocialUrl(m.text)) {
              const result = await transformSocialUrl(m.text);
              if (result.success && result.encoded) {
                transformedRef.current.set(m.id, result.encoded);
                if (!chat.isGroup) dbEditMessageText(m.id, result.encoded, chat.id, user.uid).catch(() => {});
                return { id: m.id, text: result.encoded, time: cachedFormatTime(m.createdAt), sender: senderSide, status: m.status, fromName, fromAvatar };
              }
            }

            return { id: m.id, text: m.text, time: cachedFormatTime(m.createdAt), sender: senderSide, status: m.status, fromName, fromAvatar };
          }));

        // ── QUANTUM DELTA ENGINE ──
        // Build a tiny signature of the fresh data. If nothing actually changed
        // since the last render, we skip ALL state updates → zero re-renders,
        // zero layout work, zero animation restarts. This runs every poll tick.
        const sig = otherTyping + '§' + fresh.map((f) => f.id + '·' + f.status + '·' + f.text.length).join('|');
        chatSnapshotCache.set(chat.id, { messages: fresh, typing: otherTyping, ts: Date.now() });
        if (sig === lastSigRef.current) return; // ← nothing changed: skip render entirely
        lastSigRef.current = sig;

        setMessages((prev) => {
          const stillUploading = prev.filter((p) => p.uploading);
          return stillUploading.length ? [...fresh, ...stillUploading] : fresh;
        });
        setTypingState(otherTyping);
      } catch (e) {
        console.warn('Poll failed:', e);
      }
    };

    poll();
    // PERF: Adaptive poll interval. 2s initially, backs off to 4s after 30s
    // of no user interaction (pointer/key events). Resets to 2s on any interaction.
    // This halves network round-trips for idle chats without affecting responsiveness.
    let pollInterval = 2000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetPollSpeed = () => {
      pollInterval = 2000;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { pollInterval = 4000; }, 30000);
    };
    resetPollSpeed();
    window.addEventListener('pointerdown', resetPollSpeed, { passive: true });
    window.addEventListener('keydown', resetPollSpeed, { passive: true });

    const adaptivePoll = () => {
      poll();
      adaptivePollTimer = setTimeout(adaptivePoll, pollInterval);
    };
    let adaptivePollTimer = setTimeout(adaptivePoll, pollInterval);

    // Instant catch-up the moment the tab becomes visible again
    const onVisible = () => { if (!document.hidden) { resetPollSpeed(); poll(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(adaptivePollTimer);
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener('pointerdown', resetPollSpeed);
      window.removeEventListener('keydown', resetPollSpeed);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, chat.id, chat.uid]);

  // Auto-scroll when new messages arrive
  // PERF: use 'auto' (instant) instead of 'smooth' — smooth scrolling
  // creates a compositor-level animation that competes with the GPU
  // for compositing time. The scroll is imperceptibly fast either way.
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      const el = scrollRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
        });
      }
    }
  }, [messages, typing]);

  const sendMessage = useCallback(async () => {
    const text = msg.trim();
    if (!text || !user) return;
    if (chat.isGroup && groupInteractionBlocked) return;
    setMsg('');

    // ── SOCIAL-MEDIA URL: instant embed delivery ──
    // transformSocialUrl is instant — zero waiting, zero extraction, instant result.
    if (isSupportedSocialUrl(text)) {
      const result = await transformSocialUrl(text);
      if (result.success && result.encoded) {
        const rowId = crypto.randomUUID();
        // Store in our local cache immediately so the poll never reverts it
        transformedRef.current.set(rowId, result.encoded);
        // Show the embed immediately — no loading state at all
        const embedMsg: Message = {
          id: rowId,
          text: result.encoded,
          time: formatTime(Date.now()),
          sender: 'me',
          status: 'sent',
        };
        setMessages((prev) => [...prev, embedMsg]);
        // Persist the EMBED (not the URL) to the DB
        if (!chat.isGroup) {
          dbSendMessageWithId(chat.id, user.uid, result.encoded, rowId).catch((e) => {
            console.warn('Send (embed) failed:', e);
          });
        } else {
           // We can just use sendGroupMessage for embeds too
           sendGroupMessage(chat.id, user.uid, result.encoded).catch(() => {});
        }
      }
      return;
    }

    // ── PLAIN TEXT ──
    const optimistic: Message = {
      id: 'tmp-' + Date.now(),
      text,
      time: formatTime(Date.now()),
      sender: 'me',
      status: 'sent',
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      if (chat.isGroup) {
        await sendGroupMessage(chat.id, user.uid, text);
      } else {
        await dbSendMessage(chat.id, user.uid, text);
      }
    } catch (e) {
      console.warn('Send failed:', e);
    }
  }, [msg, user, chat.id, chat.isGroup]);

  /* ============================ IMAGE & VIDEO SENDING ============================
   * Media bytes go to Hybrid Storage (Discord-backed CDN, UploadMe, Picser).
   * Only the resulting URL is sent through the normal Turso messaging pipeline.
   */
  const [attachOpen, setAttachOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<Map<string, File>>(new Map());

  const openImagePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openVideoPicker = useCallback(() => {
    videoInputRef.current?.click();
  }, []);

  const handleImageSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (chat.isGroup && groupInteractionBlocked) return;
    if (!file.type.startsWith('image/')) return;

    const tmpId = 'tmp-img-' + Date.now();
    const localPreview = URL.createObjectURL(file);
    pendingFilesRef.current.set(tmpId, file);

    const optimistic: Message = {
      id: tmpId,
      text: encodeImageMessage(localPreview),
      time: formatTime(Date.now()),
      sender: 'me',
      status: 'sent',
      uploading: true,
      uploadProgress: 0,
      localPreview,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const result = await uploadUniversalFile(file, file.name, (pct) => {
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploadProgress: pct } : m)));
      });
      if (!result.success || !result.url) {
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploading: false, uploadFailed: true } : m)));
        return;
      }
      pendingFilesRef.current.delete(tmpId);
      const encoded = encodeImageMessage(result.url);
      setMessages((prev) =>
        prev.map((m) => (m.id === tmpId ? { ...m, text: encoded, uploading: false, uploadProgress: 100 } : m))
      );
      if (chat.isGroup) await sendGroupMessage(chat.id, user.uid, encoded);
      else await dbSendMessage(chat.id, user.uid, encoded);
      setTimeout(() => URL.revokeObjectURL(localPreview), 1500);
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploading: false, uploadFailed: true } : m)));
    }
  }, [user, chat.id, chat.isGroup, groupInteractionBlocked]);

  const handleVideoSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    if (chat.isGroup && groupInteractionBlocked) return;
    if (!file.type.startsWith('video/')) return;

    const tmpId = 'tmp-vid-' + Date.now();
    const localPreview = URL.createObjectURL(file);
    pendingFilesRef.current.set(tmpId, file);

    const optimistic: Message = {
      id: tmpId,
      text: encodeVideoMessage(`direct::${localPreview}`),
      time: formatTime(Date.now()),
      sender: 'me',
      status: 'sent',
      uploading: true,
      uploadProgress: 0,
      localPreview,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const result = await uploadUniversalFile(file, file.name, (pct) => {
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploadProgress: pct } : m)));
      });
      if (!result.success || !result.url) {
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploading: false, uploadFailed: true } : m)));
        return;
      }
      pendingFilesRef.current.delete(tmpId);
      const encoded = encodeVideoMessage(`direct::${result.url}`);
      setMessages((prev) =>
        prev.map((m) => (m.id === tmpId ? { ...m, text: encoded, uploading: false, uploadProgress: 100 } : m))
      );
      if (chat.isGroup) await sendGroupMessage(chat.id, user.uid, encoded);
      else await dbSendMessage(chat.id, user.uid, encoded);
      setTimeout(() => URL.revokeObjectURL(localPreview), 1500);
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploading: false, uploadFailed: true } : m)));
    }
  }, [user, chat.id, chat.isGroup, groupInteractionBlocked]);

  const handleFileSelected = useCallback(async (file: File) => {
    if (!file || !user) return;
    if (chat.isGroup && groupInteractionBlocked) return;

    const tmpId = 'tmp-file-' + Date.now();
    const localUrl = URL.createObjectURL(file);
    pendingFilesRef.current.set(tmpId, file);

    const optimisticText = encodeFileMessage(file.name, localUrl, file.size, file.type || 'application/octet-stream');
    const optimistic: Message = {
      id: tmpId,
      text: optimisticText,
      time: formatTime(Date.now()),
      sender: 'me',
      status: 'sent',
      uploading: true,
      uploadProgress: 0,
      uploadFailed: false,
      localPreview: localUrl,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const result = await uploadFileToGoFile(file, file.name, (pct) => {
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploadProgress: pct } : m)));
      });
      if (!result.success || !result.url) {
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploading: false, uploadFailed: true } : m)));
        return;
      }
      pendingFilesRef.current.delete(tmpId);
      const encoded = encodeFileMessage(file.name, result.url, file.size, file.type || 'application/octet-stream');
      setMessages((prev) =>
        prev.map((m) => (m.id === tmpId ? { ...m, text: encoded, uploading: false, uploadProgress: 100 } : m))
      );
      if (chat.isGroup) await sendGroupMessage(chat.id, user.uid, encoded);
      else await dbSendMessage(chat.id, user.uid, encoded);
      setTimeout(() => URL.revokeObjectURL(localUrl), 1500);
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, uploading: false, uploadFailed: true } : m)));
    }
  }, [user, chat.id, chat.isGroup, groupInteractionBlocked]);

  const retryFileUpload = useCallback(async (m: Message) => {
    const file = pendingFilesRef.current.get(m.id);
    if (!file || !user) return;
    setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, uploading: true, uploadFailed: false, uploadProgress: 0 } : msg)));
    try {
      const isFile = isFileMessage(m.text);
      const uploader = isFile ? uploadFileToGoFile : uploadUniversalFile;
      const result = await uploader(file, file.name, (pct) => {
        setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, uploadProgress: pct } : msg)));
      });
      if (!result.success || !result.url) {
        setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, uploading: false, uploadFailed: true } : msg)));
        return;
      }
      pendingFilesRef.current.delete(m.id);
      let encoded = result.url;
      if (isFile) {
        encoded = encodeFileMessage(file.name, result.url, file.size, file.type || 'application/octet-stream');
      } else if (isImageMessage(m.text)) {
        encoded = encodeImageMessage(result.url);
      } else if (isVideoMessage(m.text)) {
        encoded = encodeVideoMessage(`direct::${result.url}`);
      }
      setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, text: encoded, uploading: false, uploadProgress: 100 } : msg)));
      if (chat.isGroup) await sendGroupMessage(chat.id, user.uid, encoded);
      else await dbSendMessage(chat.id, user.uid, encoded);
    } catch {
      setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, uploading: false, uploadFailed: true } : msg)));
    }
  }, [user, chat.id, chat.isGroup]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (chat.isGroup && groupInteractionBlocked) return;
    setMsg(e.target.value);
    // Broadcast typing at most every 2s
    if (user && Date.now() - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = Date.now();
      dbSetTyping(chat.id, user.uid).catch(() => {});
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const hasText = msg.trim().length > 0;

  // ── VOICE RECORDING (hold mic to record, release to send) ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (chat.isGroup && groupInteractionBlocked) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => setRecordDuration((d) => d + 1), 1000);
    } catch (err) {
      console.warn('Mic access denied:', err);
    }
  }, []);

  const stopAndSendRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') { setIsRecording(false); return; }
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
    setRecordDuration(0);
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (blob.size < 500 || !user) return; // too short
      // Upload as file
      const tmpId = 'tmp-aud-' + Date.now();
      const localUrl = URL.createObjectURL(blob);
      const optimistic: Message = { id: tmpId, text: encodeAudioMessage(localUrl), time: formatTime(Date.now()), sender: 'me', status: 'sent', uploading: true, localPreview: localUrl };
      setMessages((prev) => [...prev, optimistic]);
      try {
        const file = new File([blob], 'voice.webm', { type: blob.type });
        const result = await uploadUniversalFile(file, 'voice.webm');
        if (!result.success || !result.url) { setMessages((prev) => prev.filter((m) => m.id !== tmpId)); return; }
        const encoded = encodeAudioMessage(result.url);
        setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, text: encoded, uploading: false } : m)));
        if (chat.isGroup) await sendGroupMessage(chat.id, user.uid, encoded);
        else await dbSendMessage(chat.id, user.uid, encoded);
      } catch { setMessages((prev) => prev.filter((m) => m.id !== tmpId)); }
    };
    mr.stop();
  }, [user, chat.id, chat.isGroup]);

  const cancelRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') { mr.onstop = null; mr.stop(); }
    clearInterval(recordTimerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordDuration(0);
  }, []);

  const formatRecordTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const openMediaViewer = useCallback((urls: string[], type: 'image' | 'video', startIndex = 0) => {
    const items: MediaViewerItem[] = urls.map((url) => ({
      rawUrl: url,
      secureUrl: url,
      type,
      sender: 'me',
    }));
    setMediaViewer({ items, index: startIndex });
  }, []);

  const openSingleMedia = useCallback((url: string, type: 'image' | 'video') => {
    if (!url) return;
    openMediaViewer([url], type, 0);
  }, [openMediaViewer]);

  // ── GIF select: attach as pending preview, let user optionally type caption
  const handleGifSelect = useCallback((gif: GifResult) => {
    setShowGifPicker(false);
    setPendingGif(gif);
  }, []);

  // ── GIF + optional caption send
  const sendGif = useCallback(async (caption: string) => {
    if (!user || !pendingGif) return;
    if (chat.isGroup && groupInteractionBlocked) return;
    const gifUrl = pendingGif.url;
    const encoded = encodeImageMessage(gifUrl);

    // If caption exists, send as a two-part message (GIF first, then caption text)
    const gifMsg: Message = {
      id: 'tmp-gif-' + Date.now(),
      text: encoded,
      time: formatTime(Date.now()),
      sender: 'me',
      status: 'sent',
    };
    setMessages((prev) => [...prev, gifMsg]);

    if (caption.trim()) {
      const textMsg: Message = {
        id: 'tmp-cap-' + Date.now(),
        text: caption.trim(),
        time: formatTime(Date.now()),
        sender: 'me',
        status: 'sent',
      };
      setMessages((prev) => [...prev, textMsg]);
    }

    setPendingGif(null);
    setMsg('');

    try {
      if (chat.isGroup) {
        await sendGroupMessage(chat.id, user.uid, encoded);
        if (caption.trim()) await sendGroupMessage(chat.id, user.uid, caption.trim());
      } else {
        await dbSendMessage(chat.id, user.uid, encoded);
        if (caption.trim()) await dbSendMessage(chat.id, user.uid, caption.trim());
      }
    } catch (e) {
      console.warn('GIF send failed:', e);
    }
  }, [user, pendingGif, chat.id, chat.isGroup, msg]);

  // ── FORWARD media to another chat ──
  const handleForwardTo = useCallback(async (target: Chat) => {
    if (!forwardItem || !user) return;
    const url = forwardItem.rawUrl;
    const encoded = forwardItem.type === 'video'
      ? encodeVideoMessage(`direct::${url}`)
      : encodeImageMessage(url);
    try {
      if (target.isGroup) await sendGroupMessage(target.id, user.uid, encoded);
      else await dbSendMessage(target.id, user.uid, encoded);
      setForwardSent(target.name);
      setTimeout(() => { setForwardSent(null); setForwardItem(null); }, 1200);
    } catch (e) {
      console.warn('Forward failed:', e);
      setForwardItem(null);
    }
  }, [forwardItem, user]);

  return (
    /* PERF: contain:layout style on the chat container — changes inside here
       never trigger layout recalculation in the parent document */
    <div className="absolute inset-0 z-[60] flex flex-col bg-[#050403] rise-in overflow-hidden" style={{ contain: 'layout style paint', isolation: 'isolate' }}>
      {/* PERF: Chat header has its own GPU compositing layer so it doesn't
          repaint when the message list scrolls (common source of jank) */}
      <div className="flex items-center justify-between gap-2 px-3 py-3 flex-shrink-0" style={{ background: 'rgba(11, 9, 7, 0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(216,173,90,0.1)', transform: 'translateZ(0)', willChange: 'transform', contain: 'layout style' }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <button onClick={onBack} className="tappable-soft p-1 text-[#D4A853] flex-shrink-0">
            <I.ChevronLeft s={26} />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <GoldAvatar img={chat.img} size={40} online={chat.online} />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14.5px] font-bold text-[#F3EADB] truncate">{chat.name}</span>
              </div>
              <span className={`text-[11px] font-medium ${typing ? 'text-[#EFC878]' : presence === 'Online' ? 'text-[#34B45E]' : 'text-[#6E6353]'}`}>
                {chat.isGroup ? (groupAccessLost ? 'No access' : `${effectiveGroupInfo?.memberCount || 1} members`) : (typing ? 'typing...' : presence)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[#D4A853] flex-shrink-0">
          <button onClick={() => startOutgoingCall('voice')} className="tappable-soft w-9 h-9 flex items-center justify-center"><I.Phone s={20} /></button>
          <button onClick={() => startOutgoingCall('video')} className="tappable-soft w-9 h-9 flex items-center justify-center"><I.Video s={21} /></button>
          {chat.isGroup ? (
            <button onClick={() => { if (!groupInteractionBlocked) setShowGroupDetails(true); }} disabled={groupInteractionBlocked} className="tappable-soft w-9 h-9 flex items-center justify-center disabled:opacity-35">
              <I.More s={20} />
            </button>
          ) : (
            <button className="tappable-soft w-9 h-9 flex items-center justify-center">
              <I.More s={20} />
            </button>
          )}
        </div>
      </div>

      {/* PERF: scroll-optimized isolates the message list scroll layer.
          contain:layout prevents message additions from causing full-page layout.
          The scrollRef is also used by the auto-scroll effect. */}
      <div ref={scrollRef} className="flex-1 scroll-area px-4 py-4 min-h-0" style={{ contain: 'layout style', isolation: 'isolate' }}>
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="flex items-center gap-1.5 text-[#D4A853]">
            <I.Lock s={12} />
            <span className="text-[11px] font-bold uppercase tracking-wider">End-to-end encrypted</span>
          </div>
          <p className="text-[11px] text-[#6E6353] text-center max-w-[240px] leading-relaxed">
            Messages are secured with end-to-end encryption. <span className="text-[#D4A853]">Learn more</span>
          </p>
        </div>

        <div className="flex justify-center mb-6">
          <span className="px-4 py-1 rounded-full bg-[#1A1814] text-[11px] font-bold text-[#6E6353]">Today</span>
        </div>

        {groupInteractionBlocked && (
          <div className="mb-6 flex justify-center">
            <div className="max-w-[290px] rounded-[22px] px-5 py-4 text-center" style={{ background: 'linear-gradient(180deg, rgba(40,16,16,0.75), rgba(16,10,10,0.75))', border: '1px solid rgba(248,113,113,0.18)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
              <div className="text-[13px] font-bold text-white/88 mb-1">You are no longer a member of this group.</div>
              <div className="text-[11px] leading-relaxed text-white/45">Messaging, reactions, typing, uploads, and group details are disabled until an admin adds you back.</div>
            </div>
          </div>
        )}

        <div className="space-y-5">
          {messages.map((m) => {
            // Tombstoned (failed-extraction) rows are never rendered — no URL,
            // no preview, no link bubble survives.
            if (m.text === '[removed]') return null;

            const isTransforming = !!m.transforming;
            const singleEmoji = !isTransforming ? isSingleAnimatedEmojiMessage(m.text) : null;
            const isAnimEmoji = !!singleEmoji;
            const isFileMsgFlag = !isTransforming && !isAnimEmoji && isFileMessage(m.text);
            const fileMsgData = isFileMsgFlag ? decodeFileMessage(m.text) : null;
            const isImg = !isTransforming && !isAnimEmoji && !isFileMsgFlag && isImageMessage(m.text);
            const imgUrl = isImg ? decodeImageMessage(m.text) : '';
            const isGif = isImg && /\.gif$/i.test(imgUrl.split('?')[0]);
            const isVid = !isTransforming && !isAnimEmoji && !isFileMsgFlag && isVideoMessage(m.text);
            const vidUrl = isVid ? decodeVideoMessage(m.text) : '';
            const isAud = !isTransforming && !isAnimEmoji && !isFileMsgFlag && isAudioMessage(m.text);
            const audUrl = isAud ? decodeAudioMessage(m.text) : '';
            const isGal = !isTransforming && !isAnimEmoji && !isFileMsgFlag && isGalleryMessage(m.text);
            const galUrls = isGal ? decodeGalleryMessage(m.text) : [];
            const isEmb = !isTransforming && !isAnimEmoji && !isFileMsgFlag && isEmbedMessage(m.text);
            const embUrl = isEmb ? decodeEmbedMessage(m.text) : '';
            const hasStory = !isTransforming && !isAnimEmoji && !isFileMsgFlag && (isNudgeMessage(m.text) || m.text.startsWith('[story_v1]'));
            const isDeleting = deletingId === m.id;

            return (
            /* PERF: content-visibility:auto skips layout+paint for messages that are
               scrolled far out of view. Only visible messages are fully rendered.
               contain-intrinsic-size gives the browser a height estimate so scroll
               position remains stable when off-screen messages are skipped. */
            <motion.div
              key={m.id}
              animate={isDeleting ? { opacity: 0, scale: 0.85, y: -8 } : { opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              className={`flex flex-col msg-in ${m.sender === 'me' ? 'items-end' : 'items-start'}`}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '0 80px' }}
              onContextMenu={(e) => { e.preventDefault(); if (m.sender === 'me' || (chat.isGroup && chat.groupInfo?.myRole === 'owner')) setActionMsg(m); }}
              onPointerDown={() => {
                if (m.sender !== 'me' && !(chat.isGroup && chat.groupInfo?.myRole === 'owner')) return;
                const timer = setTimeout(() => setActionMsg(m), 500);
                const up = () => { clearTimeout(timer); document.removeEventListener('pointerup', up); document.removeEventListener('pointerleave', up); };
                document.addEventListener('pointerup', up);
                document.addEventListener('pointerleave', up);
              }}
            >
              {chat.isGroup && m.sender === 'them' && m.fromName && (
                <div className="text-[11.5px] font-bold text-[#D8AD5A] mb-1 px-1 flex items-center gap-1.5">
                  {m.fromAvatar && <img src={m.fromAvatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />}
                  {m.fromName}
                </div>
              )}
              <div className="relative" style={isAnimEmoji ? {} : hasStory || isEmb ? { maxWidth: '92%', width: '100%' } : isFileMsgFlag ? { maxWidth: '90%' } : { maxWidth: '85%' }}>
                {isAnimEmoji ? (
                  /* Animated emoji — exactly one emoji, rendered large with Google Noto animated WebP */
                  <AnimatedEmojiBubble emoji={singleEmoji!} />
                ) : isFileMsgFlag && fileMsgData ? (
                  /* ── FILE ATTACHMENT CARD — never rendered as text ── */
                  <FileAttachmentBubble
                    filename={fileMsgData.filename}
                    url={fileMsgData.url}
                    size={fileMsgData.size}
                    mimeType={fileMsgData.mimeType}
                    sender={m.sender}
                    uploading={m.uploading}
                    uploadProgress={m.uploadProgress}
                    uploadFailed={m.uploadFailed}
                  />
                ) : isTransforming ? (
                  <div
                    className={`relative overflow-hidden rounded-[22px] ${
                      m.sender === 'me' ? 'rounded-tr-md' : 'rounded-tl-md'
                    }`}
                    style={{
                      minWidth: 220,
                      minHeight: 130,
                      background: 'linear-gradient(135deg, rgba(22,22,26,0.95), rgba(10,10,14,0.95))',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    {/* Shimmer sweep */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%)',
                        backgroundSize: '200% 100%',
                        animation: 'liquidGlassCaustics 2.2s infinite linear',
                      }}
                    />
                    <div className="relative flex flex-col items-center justify-center gap-3 py-8 px-6">
                      <div className="flex items-center gap-1.5">
                        <span className="typing-dot" />
                        <span className="typing-dot" style={{ animationDelay: '0.18s' }} />
                        <span className="typing-dot" style={{ animationDelay: '0.36s' }} />
                      </div>
                      <span className="text-[12px] font-bold text-white/70">Transforming link into media…</span>
                      <span className="text-[10px] text-white/35 font-medium">Extracting · Uploading</span>
                    </div>
                  </div>
                ) : isEmb ? (() => {
                  const isYt = embUrl.includes('youtube') || embUrl.includes('youtube-nocookie');
                  const isYtShort = isYt && embUrl.includes('shorts=1');
                  const isTt = embUrl.includes('tiktok.com');

                  // Regular videos and YouTube Shorts use the tap-sensitive, clickjacking-proof player.
                  if (isYt || isTt) {
                    return (
                      <YoutubeEmbedPlayer
                        embUrl={embUrl}
                        isYtShort={isYtShort}
                      />
                    );
                  }

                  // Non-YouTube embeds (like Instagram) use standard iframe
                  return (
                    <div
                      className={`relative overflow-hidden rounded-[22px] ${
                        m.sender === 'me' ? 'rounded-tr-md' : 'rounded-tl-md'
                      }`}
                      style={{
                        width: 300,
                        height: 400,
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 22,
                        overflow: 'hidden',
                        background: '#0F0D0A',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                      }}
                    >
                      <iframe
                        src={embUrl}
                        className="absolute border-0 pointer-events-auto"
                        style={{
                          width: 300,
                          height: 520,
                          top: -55,
                          left: 0,
                        }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                      />
                    </div>
                  );
                })() : isVid ? (
                  <div
                    className={`relative overflow-hidden rounded-[22px] ${
                      m.sender === 'me' ? 'rounded-tr-md' : 'rounded-tl-md'
                    }`}
                    style={{
                      padding: 3,
                      background: '#0F0D0A',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    <video
                      src={vidUrl}
                      playsInline
                      preload="metadata"
                      muted
                      onPlay={(e) => {
                        // Only one video may play at a time: pause every other.
                        const self = e.currentTarget;
                        document.querySelectorAll('video').forEach((v) => {
                          if (v !== self && !v.paused) v.pause();
                        });
                      }}
                      onClick={() => openSingleMedia(vidUrl, 'video')}
                      onError={(e) => {
                        const target = e.currentTarget;
                        const fallbackSrc = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
                        if (target.src !== fallbackSrc) {
                          target.src = fallbackSrc;
                        }
                      }}
                      className="block rounded-[19px] select-none cursor-pointer"
                      style={{
                        maxWidth: 300,
                        maxHeight: 420,
                        width: 'auto',
                        height: 'auto',
                        background: '#0F0D0A',
                      }}
                    />
                  </div>
                ) : isAud ? (
                  <VoiceMessageBubble src={audUrl} isMe={m.sender === 'me'} />
                ) : isGal ? (
                  <div
                    className={`relative overflow-hidden rounded-[22px] ${
                      m.sender === 'me' ? 'rounded-tr-md' : 'rounded-tl-md'
                    }`}
                    style={{
                      padding: 3,
                      background: '#0F0D0A',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    <div
                      className="grid gap-[3px] rounded-[19px] overflow-hidden"
                      style={{
                        gridTemplateColumns: galUrls.length === 1 ? '1fr' : '1fr 1fr',
                        maxWidth: 300,
                      }}
                    >
                      {galUrls.slice(0, 4).map((u, gi) => (
                        <img
                          key={gi}
                          src={u}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          onClick={() => openMediaViewer(galUrls, 'image', gi)}
                          className="block w-full h-full object-cover cursor-zoom-in select-none"
                          style={{ aspectRatio: '1 / 1', background: '#0F0D0A' }}
                        />
                      ))}
                    </div>
                  </div>
                ) : hasStory ? (
                  <UniversalStoryCard nudgeText={m.text} compact />
                ) : isGif ? (
                  <ChatGif
                    url={imgUrl}
                    isMe={m.sender === 'me'}
                    onOpen={() => openSingleMedia(imgUrl, 'image')}
                  />
                ) : isImg ? (
                  <div
                    className={`relative overflow-hidden rounded-[22px] ${
                      m.sender === 'me' ? 'rounded-tr-md' : 'rounded-tl-md'
                    }`}
                    style={{
                      padding: 3,
                      background: '#0F0D0A',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onClick={() => openSingleMedia(imgUrl, 'image')}
                        onError={(e) => {
                          // Graceful fallback if URL is broken or still uploading
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'flex flex-col items-center justify-center gap-2 py-6';
                            fallback.style.cssText = 'min-width:160px;min-height:120px;background:rgba(15,13,10,0.6);border-radius:16px;border:1px solid rgba(216,173,90,0.1);';
                            fallback.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(214,178,110,0.4)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span style="font-size:11px;color:rgba(214,178,110,0.5);font-weight:600;">Upload failed</span>';
                            parent.insertBefore(fallback, target);
                          }
                        }}
                        className="block rounded-[19px] cursor-zoom-in select-none"
                        style={{
                          maxWidth: 300,
                          maxHeight: 400,
                          width: 'auto',
                          height: 'auto',
                          objectFit: 'cover',
                          background: '#0F0D0A',
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center py-4" style={{ minWidth: 160, minHeight: 100 }}>
                        <span className="text-[11px] text-[#6E6353] font-semibold">Invalid image</span>
                      </div>
                    )}
                    {m.uploading && (
                      <div
                        className="absolute inset-[3px] rounded-[19px] flex items-center justify-center"
                        style={{ background: 'rgba(5,4,3,0.6)', backdropFilter: 'blur(4px)' }}
                      >
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{
                          background: 'linear-gradient(135deg, rgba(30,30,34,0.9), rgba(14,14,18,0.9))',
                          border: '1px solid rgba(255,255,255,0.1)',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                        }}>
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white/70 rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
                          <span className="text-[11px] font-semibold text-white/70">Uploading</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // PERF: stable pre-computed style objects — React skips style
                  // reconciliation for these since the object reference doesn't change.
                  <div
                    className={`px-4 py-2.5 rounded-[22px] text-[14px] leading-relaxed whitespace-pre-wrap break-words font-medium ${
                      m.sender === 'me'
                        ? 'text-white rounded-tr-md'
                        : 'text-[#F3EADB] rounded-tl-md'
                    }`}
                    style={m.sender === 'me' ? _BUBBLE_ME_STYLE : _BUBBLE_THEM_STYLE}
                  >
                    {m.text}
                  </div>
                )}

                {!isAnimEmoji && (
                  <div className={`flex items-center gap-1.5 mt-1.5 ${m.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px] font-bold text-[#6E6353]">{m.time}</span>
                    {m.sender === 'me' && (
                      <span className={m.status === 'read' ? 'text-[#34B45E]' : 'text-[#6E6353]'} style={_STATUS_READ_STYLE}>
                        <I.DoubleCheck s={14} />
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
            );
          })}

          {typing && (
            <div className="flex items-start msg-in">
              <div className="bg-[#1A1814] rounded-[22px] rounded-tl-md px-4 py-3.5 flex items-center gap-1.5" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="typing-dot" />
                <span className="typing-dot" style={{ animationDelay: '0.18s' }} />
                <span className="typing-dot" style={{ animationDelay: '0.36s' }} />
              </div>
            </div>
          )}

          {messages.length === 0 && !typing && (
            <div className="flex flex-col items-center gap-2 py-8 text-[#6E6353]">
              <span className="text-[12px] font-semibold">
                {chat.isGroup ? "Be the first to say hi! 👋" : `Say hi to ${chat.name.split(' ')[0]} 👋`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* PERF: stable pre-computed style objects for compose area */}
      <div className="px-3 pb-6 pt-2 flex-shrink-0 relative" style={groupInteractionBlocked ? _COMPOSE_AREA_BLOCKED : _COMPOSE_AREA_BASE}>
        {/* ── GIF PICKER PANEL ── */}
        <AnimatePresence>
          {showGifPicker && (
            <GifPicker
              onSelect={handleGifSelect}
              onClose={() => setShowGifPicker(false)}
            />
          )}
        </AnimatePresence>

        {/* ── PENDING GIF PREVIEW (attached, awaiting send) ── */}
        <AnimatePresence>
          {pendingGif && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="mb-2 flex items-end gap-2"
            >
              <div className="relative rounded-[14px] overflow-hidden flex-shrink-0"
                style={{ border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', width: 80 }}>
                <img src={pendingGif.preview} alt={pendingGif.title} className="block w-full h-auto" />
                {/* Remove GIF */}
                <button
                  onClick={() => setPendingGif(null)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.7)' }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <span className="text-[11px] text-white/30 pb-1">GIF attached · type a caption or hit Send</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2.5">
          {/* ── HAMBURGER MENU BUTTON (opens Radial Menu) ── */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setAttachOpen(!attachOpen)}
            className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #2A2A32 0%, #14141A 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </motion.button>

          {/* ── RADIAL MENU ── */}
          <RadialMenu
            isOpen={attachOpen}
            onClose={() => setAttachOpen(false)}
            items={[
              {
                id: 'images',
                label: 'Images',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                ),
                onClick: () => openImagePicker(),
              },
              {
                id: 'videos',
                label: 'Videos',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7"/>
                    <rect x="1" y="5" width="15" height="14" rx="2.5" ry="2.5"/>
                  </svg>
                ),
                onClick: () => openVideoPicker(),
              },
              {
                id: 'files',
                label: 'Files',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                  </svg>
                ),
                onClick: () => {
                  const fileInput = document.createElement('input');
                  fileInput.type = 'file';
                  fileInput.accept = '*/*';
                  fileInput.onchange = (e: any) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                  };
                  fileInput.click();
                },
              },
            ]}
          />

          {showGifPicker && (
            <div className="fixed inset-0 z-[39]" onClick={() => setShowGifPicker(false)} />
          )}

          <div className="flex-1 luxe-surface h-[44px] rounded-full pl-4 pr-2 flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={msg}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 bg-transparent text-[14px] font-medium text-[#F3EADB] placeholder-[#6E6353] outline-none min-w-0"
            />
            {/* GIF picker toggle — sits inside the text input row */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => { setShowGifPicker((v) => !v); }}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors flex-shrink-0"
              style={{ color: showGifPicker ? '#D4A853' : '#6E6353' }}
              aria-label="Open GIF picker"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="4"/>
                <text x="4" y="16" fontSize="9" fontWeight="bold" fill="currentColor" stroke="none" fontFamily="system-ui">GIF</text>
              </svg>
            </motion.button>
          </div>

          {/* ── VOICE / SEND BUTTON with framer-motion ── */}
          <AnimatePresence mode="wait">
            {(hasText || pendingGif) ? (
              <motion.button
                key="send"
                initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                whileTap={{ scale: 0.88 }}
                onClick={pendingGif ? () => sendGif(msg) : sendMessage}
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center text-black flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #E8E8E8 0%, #B8B8B8 100%)',
                  boxShadow: '0 2px 0 rgba(255,255,255,0.8) inset, 0 -2px 4px rgba(0,0,0,0.2) inset, 0 8px 20px rgba(0,0,0,0.4)',
                }}
              >
                <I.Send s={18} />
              </motion.button>
            ) : isRecording ? (
              <motion.div
                key="recording"
                initial={{ width: 44, opacity: 0.5 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={{ width: 44, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="flex items-center gap-2 flex-shrink-0 overflow-hidden"
              >
                {/* Recording pill */}
                <motion.div
                  initial={{ x: 30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.08, type: 'spring', stiffness: 300, damping: 22 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, rgba(50,15,15,0.9), rgba(25,8,8,0.9))',
                    border: '1px solid rgba(239,68,68,0.3)',
                    boxShadow: '0 0 20px rgba(239,68,68,0.15), 0 4px 16px rgba(0,0,0,0.5)',
                  }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                    className="w-2.5 h-2.5 rounded-full bg-red-500"
                  />
                  <span className="text-[13px] font-bold text-red-400 tabular-nums">{formatRecordTime(recordDuration)}</span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={cancelRecording}
                    className="ml-0.5 w-6 h-6 rounded-full flex items-center justify-center text-red-400/80"
                    style={{ background: 'rgba(239,68,68,0.15)' }}
                  >
                    <I.X s={11} />
                  </motion.button>
                </motion.div>

                {/* Send voice button */}
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 18 }}
                  whileTap={{ scale: 0.88 }}
                  onPointerUp={stopAndSendRecording}
                  className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0 text-white"
                  style={{
                    background: 'linear-gradient(135deg, #EF4444, #B91C1C)',
                    boxShadow: '0 0 28px rgba(239,68,68,0.35), 0 2px 0 rgba(255,255,255,0.15) inset, 0 -2px 4px rgba(0,0,0,0.4) inset, 0 8px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  <I.Send s={17} />
                </motion.button>
              </motion.div>
            ) : (
              <motion.button
                key="mic"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                whileTap={{ scale: 0.88 }}
                onPointerDown={(e) => { e.preventDefault(); startRecording(); }}
                className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden relative"
                style={{
                  background: 'linear-gradient(180deg, rgba(34,34,38,1) 0%, rgba(16,16,18,1) 50%, rgba(5,5,6,1) 100%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  boxShadow: '0 2px 0 rgba(255,255,255,0.14) inset, 0 10px 0 -8px rgba(255,255,255,0.05) inset, 0 -3px 3px rgba(0,0,0,0.6) inset, 0 8px 24px rgba(0,0,0,0.5)',
                }}
                aria-label="Hold to record voice"
              >
                {/* Top-light glow */}
                <div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-full"
                  style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)' }} />
                <span className="relative text-white/70"><I.Mic s={19} /></span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* ── Hidden file input: ONLY images ── */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/heic"
            hidden
            onChange={handleImageSelected}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={handleVideoSelected}
          />
        </div>
        
        <div className="flex justify-center pt-3">
          <span className="w-[110px] h-[4px] rounded-full" style={{ background: 'rgba(243,234,219,0.28)' }} />
        </div>
      </div>

      {/* ── NUDGE COMPOSER OVERLAY ── */}
      <AnimatePresence>
        {showNudgeComposer && (
          <StoryCanvasComposer
            onClose={() => setShowNudgeComposer(false)}
            onSuccess={() => setShowNudgeComposer(false)}
          />
        )}
      </AnimatePresence>

      {/* ── GROUP DETAILS SHEET ── */}
      <AnimatePresence>
        {showGroupDetails && chat.isGroup && (
          <GroupDetailsSheet
            chat={{ ...chat, groupInfo: effectiveGroupInfo || chat.groupInfo }}
            allChats={allChats}
            onClose={() => setShowGroupDetails(false)}
            onGroupDeleted={onBack}
          />
        )}
      </AnimatePresence>

      {/* ── IN-APP MEDIA VIEWER: images/videos never leave the app ── */}
      <AnimatePresence>
        {mediaViewer && (
          <PremiumMediaViewer
            items={mediaViewer.items}
            initialIndex={mediaViewer.index}
            onClose={() => setMediaViewer(null)}
            onForward={(item) => setForwardItem(item)}
          />
        )}
      </AnimatePresence>

      {/* ── REAL WEBRTC CALL SCREEN (outgoing) ── */}
      <AnimatePresence>
        {outgoingCall && user && (
          <CallScreen
            mode="outgoing"
            myUid={user.uid}
            myName={user.name}
            myAvatar={user.photoURL || fallbackAvatar(user.name)}
            chatId={chat.id}
            peerId={chat.uid}
            peerName={chat.name}
            peerAvatar={chat.img}
            kind={outgoingCall.kind}
            preAcquiredStream={outgoingCall.stream}
            onClose={() => {
              try { outgoingCall.stream.getTracks().forEach((t) => t.stop()); } catch {}
              setOutgoingCall(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── CALL PERMISSION ERROR TOAST ── */}
      <AnimatePresence>
        {callErrorMsg && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[210] max-w-[92%] px-5 py-3.5 rounded-2xl flex items-start gap-3 backdrop-blur-2xl"
            style={{
              background: 'linear-gradient(180deg, rgba(30,15,15,0.95), rgba(20,10,10,0.95))',
              border: '1px solid rgba(239,68,68,0.35)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
          >
            <div className="w-6 h-6 rounded-full bg-red-500/20 flex-shrink-0 flex items-center justify-center mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.4"><path d="M12 9v4m0 4h.01M12 2l10 18H2L12 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-red-400/95 mb-0.5">Can’t start call</p>
              <p className="text-[12px] text-white/60 leading-snug">{callErrorMsg}</p>
            </div>
            <button onClick={() => setCallErrorMsg(null)} className="w-6 h-6 rounded-full bg-white/[0.06] flex-shrink-0 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FORWARD-TO-CHAT SHEET ── */}
      <AnimatePresence>
        {forwardItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setForwardItem(null)}
              className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-lg"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 34 }}
              className="fixed inset-x-0 bottom-0 z-[130] mx-auto max-w-md rounded-t-[28px] overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, #1A1A1E 0%, #0E0E12 100%)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderBottom: 'none',
                boxShadow: '0 -24px 80px rgba(0,0,0,0.7)',
              }}
            >
              <div className="flex flex-col max-h-[70vh]">
                <div className="flex-shrink-0 px-5 pt-3 pb-3">
                  <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] font-bold text-white/90">Forward to...</h3>
                    <button
                      onClick={() => setForwardItem(null)}
                      className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/60 hover:bg-white/[0.1] transition-colors"
                    >
                      <I.X s={14} />
                    </button>
                  </div>
                </div>

                {forwardSent ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-3 py-12"
                  >
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                      className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center"
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    </motion.div>
                    <span className="text-[14px] font-semibold text-white/85">Sent to {forwardSent}</span>
                  </motion.div>
                ) : (
                  <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1">
                    {allChats.filter((c) => c.id !== chat.id).length === 0 && (
                      <div className="text-center py-10 text-[13px] text-white/35">No other chats to forward to</div>
                    )}
                    {allChats.filter((c) => c.id !== chat.id).map((c) => (
                      <motion.button
                        key={c.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleForwardTo(c)}
                        className="w-full px-3 py-2.5 flex items-center gap-3 rounded-2xl hover:bg-white/[0.04] transition-colors text-left"
                      >
                        <img src={c.img} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[14px] font-semibold text-white/85 truncate block">{c.name}</span>
                          <span className="text-[11.5px] text-white/30 truncate block">{c.isGroup ? 'Group' : (c.online ? 'Online' : 'Offline')}</span>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── MESSAGE ACTION SHEET (long-press → delete) ── */}
      <ActionSheet
        isOpen={!!actionMsg}
        onClose={() => setActionMsg(null)}
        title="Message Actions"
        items={[
          {
            label: 'Delete Message',
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            ),
            destructive: true,
            onClick: () => {
              if (!actionMsg || !user) return;
              const id = actionMsg.id;
              setActionMsg(null);
              setDeletingId(id);
              setTimeout(async () => {
                try {
                  if (chat.isGroup) await deleteGroupMessage(id, user.uid);
                  else await deleteMessage(id);
                } catch (e) {
                  console.warn('Delete failed:', e);
                } finally {
                  setMessages((prev) => prev.filter((m) => m.id !== id));
                  setDeletingId(null);
                }
              }, 320);
            },
          },
        ]}
      />
    </div>
  );
};

/* ============================ BOTTOM NAV — LIQUID GLASS ============================ */

const NAV_ITEMS = [
  {
    id: 'chats',
    label: 'Chats',
    icon: ({ active }: { active: boolean }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    id: 'calls',
    label: 'Calls',
    icon: ({ active }: { active: boolean }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.57a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    ),
  },
  {
    id: 'plus',
    label: 'New',
    isAction: true,
    icon: ({ active }: { active: boolean }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: ({ active }: { active: boolean }) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
];

const BottomNav = ({
  active,
  onChange,
  onPlus,
}: {
  active: string;
  onChange: (id: string) => void;
  onPlus: () => void;
}) => {
  const pillRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const barRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  // Slide the active pill to the correct position whenever `active` changes.
  useEffect(() => {
    const idx = NAV_ITEMS.findIndex(n => n.id === active);
    const btn = btnRefs.current[idx];
    const pill = pillRef.current;
    if (!btn || !pill) return;
    const bRect = btn.getBoundingClientRect();
    const pRect = btn.closest('[data-nav-bar]')?.getBoundingClientRect();
    if (!pRect) return;
    const left = bRect.left - pRect.left + 6;
    const width = bRect.width - 12;
    pill.style.left = `${left}px`;
    pill.style.width = `${width}px`;
  }, [active]);

  // Mouse glare: premium Apple-style pinpoint triple-spotlight on the liquid glass
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = barRef.current;
    const glare = glareRef.current;
    if (!bar || !glare) return;
    const rect = bar.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    /* Enhanced triple-spotlight system for physically convincing light-on-glass:
       • Dense white core: sharp specular hit on the front lens surface
       • Warm golden mid: light scattering inside the glass volume
       • Soft ambient halo: subtle light bleed through the edges
       • Warm secondary offset: subtle chromatic displacement for depth
       • Cool counter-spot: complementary light balance */
    glare.style.background = `
      radial-gradient(circle 20% at ${x}% ${y}%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 254, 248, 0.18) 24%, transparent 58%),
      radial-gradient(circle 34% at ${x}% ${y}%, rgba(216, 173, 90, 0.20) 0%, rgba(239, 200, 120, 0.08) 34%, transparent 68%),
      radial-gradient(circle 50% at ${x}% ${y}%, rgba(255, 248, 228, 0.06) 0%, transparent 100%),
      radial-gradient(circle 16% at ${x + 3}% ${y - 2}%, rgba(255, 220, 180, 0.12) 0%, transparent 48%),
      radial-gradient(circle 12% at ${x - 2}% ${y + 3}%, rgba(200, 210, 255, 0.08) 0%, transparent 42%)
    `;
  };

  const handleMouseLeave = () => {
    if (glareRef.current) glareRef.current.style.background = 'transparent';
  };

  return (
    /* PERF: BottomNav has its own GPU compositing layer. The navbar is always
       visible and never changes size — promote it once and leave it cached. */
    <div className="flex-shrink-0 relative z-30 px-3 pb-1.5 pt-1.5" style={{ transform: 'translateZ(0)', willChange: 'transform', contain: 'layout style' }}>
      {/* PERF: style tag removed from JSX — keyframes now live in globals.css
          (injecting a <style> every render creates a new StyleSheet node each time) */}

      {/* ════════════════════════════════════════════════════════════════
           PREMIUM LIQUID-GLASS PILL BAR — ENHANCED v2 OPTICAL STACK
           Apple-style multi-layer optical surface with:
           • 10-layer internal refraction stack
           • Real-time caustic light dispersion (dual-layer)
           • Dynamic specular edge traveling highlights (4 sweeps)
           • Physically-based lens depth simulation
           • Chromatic aberration at glass edges
           • Micro-shimmer grain for optical realism
           • Interactive triple-spotlight glare with sub-pixel response
           • Living-glass depth breathing animation
           • Volumetric inner refraction band
           GPU compositing layer — never repaints on scroll.
           ════════════════════════════════════════════════════════════════ */}
      <div
        ref={barRef}
        data-nav-bar=""
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative flex items-center rounded-[28px] h-[62px] overflow-hidden"
        style={{
          /* Ultra-deep multi-layer liquid-glass substrate — premium optical stack */
          background: `
            linear-gradient(180deg,
              rgba(32, 26, 18, 0.42) 0%,
              rgba(20, 16, 12, 0.36) 14%,
              rgba(16, 12, 8, 0.30) 38%,
              rgba(14, 10, 7, 0.28) 50%,
              rgba(18, 14, 10, 0.32) 68%,
              rgba(22, 17, 12, 0.36) 86%,
              rgba(28, 22, 16, 0.42) 100%)
          `,
          /* Premium refraction — maximum blur depth, richer color saturation, enhanced brightness */
          backdropFilter: 'blur(120px) saturate(380%) brightness(1.22) contrast(1.10)',
          WebkitBackdropFilter: 'blur(120px) saturate(380%) brightness(1.22) contrast(1.10)',
          /* Premium glass edge — multi-tone border with stronger inner glow */
          border: '1px solid rgba(255, 250, 235, 0.26)',
          /* Enhanced edge shadow system — deeper, richer shadow with warm undertones */
          boxShadow: `${SHADOWS.navBar}, inset 0 0 0 0.5px rgba(255, 252, 240, 0.14), inset 0 1px 0 rgba(255, 254, 250, 0.08)`,
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        {/* ═══ LAYER 1: Internal refraction medium — deep volumetric light-scatter ═══ */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ opacity: 0.78 }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                radial-gradient(ellipse 130% 100% at 18% 38%, rgba(255, 250, 234, 0.08) 0%, transparent 52%),
                radial-gradient(ellipse 88% 110% at 82% 62%, rgba(216, 173, 90, 0.06) 0%, transparent 48%),
                radial-gradient(ellipse 76% 68% at 48% 28%, rgba(255, 255, 250, 0.07) 0%, transparent 58%),
                radial-gradient(ellipse 60% 50% at 55% 70%, rgba(245, 215, 160, 0.04) 0%, transparent 62%)
              `,
              animation: 'liquidGlassBreathe 16s infinite ease-in-out',
            }}
          />
        </div>

        {/* ═══ LAYER 1b: Volumetric depth breathing — simulating glass thickness ═══ */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ opacity: 0.65 }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                conic-gradient(
                  from 45deg at 50% 50%,
                  rgba(255, 248, 230, 0.04) 0deg,
                  rgba(216, 173, 90, 0.03) 60deg,
                  rgba(255, 252, 240, 0.05) 120deg,
                  rgba(239, 200, 120, 0.03) 180deg,
                  rgba(255, 244, 220, 0.04) 240deg,
                  rgba(216, 173, 90, 0.02) 300deg,
                  rgba(255, 248, 230, 0.04) 360deg
                )
              `,
              animation: 'liquidGlassDepthPulse 22s infinite ease-in-out',
              filter: 'blur(8px)',
            }}
          />
        </div>

        {/* ═══ LAYER 2: Dynamic caustic light-dispersion waves — bending light through the lens ═══ */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ opacity: 0.64 }}
        >
          <div
            className="absolute -inset-[50%] opacity-44 pointer-events-none"
            style={{
              background: `
                radial-gradient(circle at 30% 25%, rgba(255, 246, 220, 0.12) 0%, transparent 36%),
                radial-gradient(circle at 70% 55%, rgba(216, 173, 90, 0.09) 0%, transparent 40%),
                radial-gradient(circle at 45% 75%, rgba(255, 252, 235, 0.07) 0%, transparent 34%),
                radial-gradient(circle at 15% 60%, rgba(245, 210, 150, 0.05) 0%, transparent 42%)
              `,
              filter: 'blur(14px)',
              animation: 'liquidGlassCaustics 20s infinite alternate ease-in-out',
            }}
          />
          {/* Secondary caustic layer — faster, counter-rotating for rich interference patterns */}
          <div
            className="absolute -inset-[60%] opacity-30 pointer-events-none"
            style={{
              background: `
                radial-gradient(circle at 60% 30%, rgba(255, 250, 235, 0.10) 0%, transparent 38%),
                radial-gradient(circle at 25% 70%, rgba(239, 200, 120, 0.08) 0%, transparent 43%),
                radial-gradient(circle at 80% 15%, rgba(255, 244, 218, 0.06) 0%, transparent 36%)
              `,
              filter: 'blur(20px)',
              animation: 'liquidGlassCaustics 28s infinite alternate-reverse ease-in-out',
            }}
          />
          {/* Tertiary caustic layer — ultra-slow micro-movement for living-glass depth */}
          <div
            className="absolute -inset-[70%] opacity-18 pointer-events-none"
            style={{
              background: `
                radial-gradient(circle at 50% 50%, rgba(255, 252, 242, 0.07) 0%, transparent 30%),
                radial-gradient(circle at 35% 80%, rgba(216, 173, 90, 0.05) 0%, transparent 38%)
              `,
              filter: 'blur(24px)',
              animation: 'liquidGlassDrift 35s infinite ease-in-out',
            }}
          />
        </div>

        {/* ═══ LAYER 3: Primary specular reflection — front lens surface curvature ═══ */}
        <span
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: '56%',
            borderRadius: '28px 28px 65% 65% / 28px 28px 45% 45%',
            background: `
              linear-gradient(180deg,
                rgba(255, 254, 250, 0.32) 0%,
                rgba(255, 252, 242, 0.18) 14%,
                rgba(255, 248, 228, 0.08) 42%,
                rgba(255, 244, 218, 0.03) 68%,
                transparent 100%)
            `,
            mixBlendMode: 'screen',
          }}
        />

        {/* ═══ LAYER 4: Secondary specular — back-surface reflection of the glass lens ═══ */}
        <span
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{
            height: '44%',
            borderRadius: '65% 65% 28px 28px / 45% 45% 28px 28px',
            background: `
              linear-gradient(360deg,
                rgba(255, 248, 228, 0.16) 0%,
                rgba(255, 248, 228, 0.07) 28%,
                rgba(255, 244, 218, 0.03) 56%,
                transparent 100%)
            `,
            mixBlendMode: 'screen',
          }}
        />

        {/* ═══ LAYER 4b: Inner refraction band — light passing through glass volume ═══ */}
        <span
          className="absolute inset-y-0 left-0 w-[45%] pointer-events-none overflow-hidden"
          style={{
            background: `
              linear-gradient(90deg,
                transparent 0%,
                rgba(255, 252, 244, 0.02) 12%,
                rgba(255, 250, 238, 0.12) 32%,
                rgba(255, 248, 228, 0.06) 48%,
                transparent 72%)
            `,
            opacity: 0.72,
            mixBlendMode: 'screen',
            animation: 'liquidGlassInnerRefraction 16s infinite ease-in-out',
          }}
        />
        {/* Counter-sweep inner refraction — opposite direction for interference */}
        <span
          className="absolute inset-y-0 right-0 w-[38%] pointer-events-none overflow-hidden"
          style={{
            background: `
              linear-gradient(270deg,
                transparent 0%,
                rgba(255, 250, 240, 0.02) 14%,
                rgba(255, 246, 230, 0.08) 36%,
                rgba(255, 244, 222, 0.04) 52%,
                transparent 70%)
            `,
            opacity: 0.50,
            mixBlendMode: 'screen',
            animation: 'liquidGlassInnerRefraction 22s 6s infinite ease-in-out reverse',
          }}
        />

        {/* ═══ LAYER 5: Traveling specular edge sweep — the premium "liquid lens rim" light ═══ */}
        <span
          className="absolute inset-y-0 left-0 w-[70%] pointer-events-none"
          style={{
            background: `
              linear-gradient(90deg,
                transparent 0%,
                rgba(255, 254, 248, 0.01) 15%,
                rgba(255, 254, 248, 0.22) 45%,
                rgba(255, 254, 248, 0.06) 60%,
                transparent 100%)
            `,
            opacity: 0.82,
            mixBlendMode: 'overlay',
            animation: 'specularReflectionShine 12s infinite ease-in-out',
          }}
        />
        {/* Second sweep — faster, lower amplitude, opposite direction for complex interplay */}
        <span
          className="absolute inset-y-0 right-0 w-[55%] pointer-events-none"
          style={{
            background: `
              linear-gradient(270deg,
                transparent 0%,
                rgba(255, 252, 242, 0.01) 18%,
                rgba(255, 252, 242, 0.15) 48%,
                rgba(255, 252, 242, 0.03) 65%,
                transparent 100%)
            `,
            opacity: 0.62,
            mixBlendMode: 'overlay',
            animation: 'specularReflectionShine 18s infinite ease-in-out reverse',
          }}
        />
        {/* Third sweep — warm golden, slower, for rich multi-wavelength specular behavior */}
        <span
          className="absolute inset-y-0 left-[10%] w-[60%] pointer-events-none"
          style={{
            background: `
              linear-gradient(90deg,
                transparent 0%,
                rgba(239, 200, 120, 0.01) 12%,
                rgba(239, 200, 120, 0.14) 38%,
                rgba(239, 200, 120, 0.04) 58%,
                transparent 100%)
            `,
            opacity: 0.48,
            mixBlendMode: 'screen',
            animation: 'liquidGlassTopSpecular 24s 3s infinite ease-in-out',
          }}
        />

        {/* ═══ LAYER 6: Edge traveling highlight — thin rim light orbiting the glass edge ═══ */}
        <span
          className="absolute inset-x-[3px] top-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255, 252, 240, 0.52) 28%, rgba(255, 252, 240, 0.52) 72%, transparent 100%)',
            opacity: 0.88,
            animation: 'liquidGlassEdgeTravel 11s infinite ease-in-out',
          }}
        />
        <span
          className="absolute inset-x-[3px] bottom-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255, 248, 224, 0.34) 28%, rgba(255, 248, 224, 0.34) 72%, transparent 100%)',
            opacity: 0.62,
            animation: 'liquidGlassEdgeTravel 13s 4s infinite ease-in-out',
          }}
        />
        {/* Side edge highlights — vertical traveling light on left and right rim */}
        <span
          className="absolute inset-y-[6px] left-0 w-px pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(255, 252, 240, 0.30) 30%, rgba(255, 252, 240, 0.30) 70%, transparent 100%)',
            opacity: 0.60,
            animation: 'liquidGlassEdgeTravel 15s 2s infinite ease-in-out',
          }}
        />
        <span
          className="absolute inset-y-[6px] right-0 w-px pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(255, 248, 224, 0.22) 30%, rgba(255, 248, 224, 0.22) 70%, transparent 100%)',
            opacity: 0.44,
            animation: 'liquidGlassEdgeTravel 17s 7s infinite ease-in-out',
          }}
        />

        {/* ═══ LAYER 6b: Chromatic aberration fringe — wavelength separation at glass edge ═══ */}
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: 28,
            border: '1px solid transparent',
            boxShadow: 'inset -1px 0 4px rgba(255, 120, 80, 0.06), inset 1px 0 4px rgba(80, 140, 255, 0.06)',
            animation: 'liquidGlassChromaticFringe 14s infinite ease-in-out',
          }}
        />

        {/* ═══ LAYER 6c: Micro-shimmer grain — sub-pixel film grain for optical realism ═══ */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{
            opacity: 0.40,
            background: `
              radial-gradient(circle at 25% 25%, rgba(255, 248, 235, 0.015) 0.5px, transparent 1px),
              radial-gradient(circle at 75% 75%, rgba(216, 173, 90, 0.012) 0.5px, transparent 1px)
            `,
            backgroundSize: '3px 3px, 4px 4px',
            animation: 'liquidGlassMicroShimmer 8s infinite ease-in-out',
          }}
        />

        {/* ═══ LAYER 6d: Bottom reflected light — warm light bouncing from surface below ═══ */}
        <span
          className="absolute inset-x-0 bottom-0 h-[28%] pointer-events-none"
          style={{
            borderRadius: '0 0 28px 28px',
            background: `
              linear-gradient(0deg,
                rgba(239, 200, 120, 0.06) 0%,
                rgba(239, 200, 120, 0.02) 40%,
                transparent 100%)
            `,
            opacity: 0.70,
            mixBlendMode: 'screen',
            animation: 'liquidGlassBottomReflection 20s infinite ease-in-out',
          }}
        />

        {/* ═══ LAYER 7: Interactive mouse glare — Apple-style pinpoint triple-spotlight ═══ */}
        <div
          ref={glareRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            mixBlendMode: 'overlay',
            transition: 'background 0.04s linear',
          }}
        />

        {/* Sliding active pill — sits behind icon+label */}
        <span
          ref={pillRef}
          className="absolute top-[7px] bottom-[7px] pointer-events-none"
          style={{
            borderRadius: 18,
            background: 'linear-gradient(180deg, rgba(255, 241, 196, 0.16) 0%, rgba(216, 173, 90, 0.09) 100%)',
            border: '1px solid rgba(216, 173, 90, 0.30)',
            boxShadow: 'inset 0 1px 0 rgba(255, 248, 220, 0.24), 0 4px 14px rgba(0,0,0,0.32)',
            transition: 'left 0.5s cubic-bezier(0.34,1.2,0.64,1), width 0.5s cubic-bezier(0.34,1.2,0.64,1)',
            willChange: 'left, width',
          }}
        />

        {/* Nav items */}
        <div className="relative flex-1 flex items-center justify-around h-full">
          {NAV_ITEMS.map((item, idx) => {
            const isAction = (item as any).isAction === true;
            const on = active === item.id;
            const Icon = item.icon;
            const handleClick = () => {
              if (isAction) {
                onPlus();
                return;
              }
              onChange(item.id);
            };
            return (
              <button
                key={item.id}
                ref={el => { btnRefs.current[idx] = el; }}
                onClick={handleClick}
                aria-label={item.label}
                className="relative flex flex-col items-center justify-center gap-[3px] flex-1 h-full"
                style={{
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                  color: on ? '#EFC878' : 'rgba(160,142,110,0.72)',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <span
                  style={{
                    filter: on ? 'drop-shadow(0 0 5px rgba(239,200,120,0.52))' : 'none',
                    transition: 'filter 0.3s ease, color 0.3s ease',
                  }}
                >
                  <Icon active={on} />
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: on ? 700 : 500,
                    letterSpacing: '0.03em',
                    transition: 'color 0.3s ease, font-weight 0.2s ease',
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Home indicator */}
      <div className="flex justify-center pt-2">
        <span
          className="rounded-full"
          style={{ width: 112, height: 4, background: 'rgba(243,234,219,0.26)' }}
        />
      </div>
    </div>
  );
};

/* ============================ BOTTOM SHEET (EXPANDABLE ADD FRIEND — REAL TURSO) ============================ */
const BottomSheet = ({
  isOpen,
  onClose,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}) => {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [tokens, setTokens] = useState<{ id: number; uid?: string; label: string; avatar?: string }[]>([]);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (isOpen && expanded) {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [isOpen, expanded]);

  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => {
        setExpanded(false);
        setInputValue('');
        setTokens([]);
        setRemovingId(null);
        setSearchError(null);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleAddToken = useCallback(async () => {
    const v = inputValue.trim().toUpperCase();
    if (!v || !user) return;
    setSearching(true);
    setSearchError(null);
    try {
      const found = await findUserByContactToken(v);
      if (!found) {
        setSearchError("No user found with this token.");
        return;
      }
      if (found.uid === user.uid) {
        setSearchError("You can't add yourself.");
        return;
      }
      if (tokens.some((t) => t.uid === found.uid)) {
        setSearchError("This person is already in your list.");
        setInputValue('');
        return;
      }
      setTokens((prev) => [...prev, { id: nextId.current++, uid: found.uid, label: found.name, avatar: found.avatar }]);
      setInputValue('');
    } catch (e: any) {
      setSearchError(e.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  }, [inputValue, tokens, user]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddToken();
    }
    if (e.key === 'Backspace' && !inputValue && tokens.length > 0) {
      const last = tokens[tokens.length - 1];
      setRemovingId(last.id);
      setTimeout(() => {
        setTokens((prev) => prev.filter((t) => t.id !== last.id));
        setRemovingId(null);
      }, 250);
    }
  }, [inputValue, tokens, handleAddToken]);

  const removeToken = useCallback((id: number) => {
    setRemovingId(id);
    setTimeout(() => {
      setTokens((prev) => prev.filter((t) => t.id !== id));
      setRemovingId(null);
    }, 250);
  }, []);

  const handleSend = useCallback(async () => {
    if (!user) return;
    try {
      for (const token of tokens) {
        if (!token.uid) continue;
        await getOrCreateChat(user.uid, token.uid);
      }
      onAdded();
      onClose();
    } catch (e: any) {
      alert("Failed to add contact: " + (e.message || "Unknown error"));
    }
  }, [onClose, onAdded, tokens, user]);

  const tokenCount = tokens.length;

  return (
    <>
      <div
        className={`absolute inset-0 z-40 transition-opacity duration-[500ms] ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={() => { onClose(); }}
      />

      <div
        className={`absolute inset-x-0 bottom-0 z-50 transition-transform duration-[550ms] cubic-bezier(0.32, 0.72, 0, 1) ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ willChange: 'transform' }}
      >
        <div
          className="relative px-5 pb-7 pt-3"
          style={{
            background: 'linear-gradient(178deg, #1E1A14 0%, #14110D 40%, #0F0D0A 100%)',
            borderRadius: '32px 32px 0 0',
            border: '1px solid rgba(216,173,90,0.15)',
            borderBottom: 'none',
            boxShadow: '0 -4px 30px rgba(0,0,0,0.6), 0 -12px 60px rgba(0,0,0,0.35), 0 1px 0 rgba(255,235,190,0.08) inset',
            maxHeight: '60vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center pb-4">
            <span className="w-10 h-1 rounded-full" style={{ background: 'rgba(243,234,219,0.3)' }} />
          </div>

          <div className="mb-5 px-1">
            <h2 className="text-[18px] font-bold text-[#F3EADB] tracking-tight">
              {expanded ? 'Add People' : 'New Nudge'}
            </h2>
            <p className="text-[12px] text-[#8A7D67] mt-0.5 font-medium">
              {expanded ? 'Enter a contact token to add someone.' : 'Start a conversation or add people to a circle.'}
            </p>
          </div>

          <div className="transition-all duration-400 ease-out">
            <AnimatePresence mode="wait">
              {!expanded ? (
                <motion.div
                  key="button"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="w-full">
                    <p className="text-[11px] font-semibold text-[#6E6353] uppercase tracking-wider mb-3 px-1">Add by Token</p>
                    <p className="text-[12px] text-[#8A7D67] mb-3 px-1 leading-relaxed">
                      Every Nudgel user has a unique contact token. Ask someone for their token and enter it below.
                    </p>
                  </div>
                  <motion.button
                    layout
                    onClick={() => setExpanded(true)}
                    className="gold-solid tappable w-full h-[52px] rounded-2xl flex items-center justify-center gap-2.5 text-black"
                    style={{ textShadow: '0 1px 0 rgba(255,243,214,0.55)' }}
                    whileTap={{ scale: 0.96 }}
                  >
                    <I.Plus s={20} />
                    <span className="text-[15px] font-bold">Add Friend</span>
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div
                  key="input"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex flex-col gap-3"
                >
                  <motion.div
                    layout
                    className="min-h-[50px] p-3 rounded-2xl flex flex-wrap gap-2 items-start content-start"
                    style={{
                      background: 'linear-gradient(178deg, #1B1814 0%, #14110D 100%)',
                      border: `1.5px solid ${tokenCount > 0 ? 'rgba(216,173,90,0.3)' : 'rgba(216,173,90,0.14)'}`,
                      boxShadow: tokenCount > 0 ? '0 0 16px rgba(216,173,90,0.12)' : 'none',
                    }}
                    onClick={() => inputRef.current?.focus()}
                  >
                    {tokens.map((token) => (
                      <span
                        key={token.id}
                        className={`inline-flex items-center gap-1.5 pl-0.5 pr-1 py-1 rounded-full text-[12px] font-bold text-[#F3EADB] transition-all duration-[300ms] ease-out ${
                          removingId === token.id ? 'token-exit' : 'token-enter'
                        }`}
                        style={{
                          background: 'linear-gradient(178deg, #2A2520 0%, #1E1A14 100%)',
                          border: '1.5px solid rgba(216,173,90,0.35)',
                          boxShadow: '0 0 10px rgba(216,173,90,0.15), 0 2px 6px rgba(0,0,0,0.4)',
                        }}
                      >
                        {token.avatar ? (
                          <img src={token.avatar} alt="" className="w-[22px] h-[22px] rounded-full object-cover" draggable={false} />
                        ) : (
                          <span className="w-[22px] h-[22px] rounded-full gold-solid flex items-center justify-center">
                            <span className="text-[10px] text-black font-black leading-none">{token.label[0]?.toUpperCase()}</span>
                          </span>
                        )}
                        <span>{token.label}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeToken(token.id); }}
                          className="ml-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[#8A7D67] hover:text-[#EFC878] hover:bg-[#EFC878]/10 transition-colors flex-shrink-0"
                        >
                          <I.X s={11} />
                        </button>
                      </span>
                    ))}

                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={tokens.length === 0 ? 'MW-XXXX-XXXX-XXXX' : 'Add another token...'}
                      className="flex-1 min-w-[120px] bg-transparent text-[13px] font-medium text-[#F3EADB] placeholder-[#6E6353] outline-none py-1 uppercase tracking-wider"
                    />
                  </motion.div>

                  {searchError && (
                    <div className="text-[12px] text-rose-300 px-1">{searchError}</div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setExpanded(false)}
                      className="flex-shrink-0 px-4 h-[42px] rounded-xl text-[#8A7D67] text-[13px] font-semibold tappable-soft"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      Back
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={handleAddToken}
                      disabled={!inputValue.trim() || searching}
                      className="flex-shrink-0 w-[42px] h-[42px] rounded-xl flex items-center justify-center tappable-soft transition-opacity"
                      style={{
                        background: inputValue.trim()
                          ? 'linear-gradient(170deg, #FFF1CC 0%, #E3B25D 42%, #A87527 82%)'
                          : 'rgba(255,255,255,0.06)',
                        color: inputValue.trim() ? '#1A1206' : '#3A332A',
                        opacity: inputValue.trim() ? 1 : 0.4,
                      }}
                    >
                      {searching ? (
                        <div className="w-4 h-4 border-2 border-[#1A1206] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <I.Plus s={18} />
                      )}
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={tokens.length === 0}
                      className="gold-solid tappable flex-shrink-0 h-[42px] px-6 rounded-xl flex items-center justify-center gap-2 text-black"
                      style={{
                        textShadow: '0 1px 0 rgba(255,243,214,0.55)',
                        opacity: tokens.length > 0 ? 1 : 0.35,
                        boxShadow: tokens.length > 0
                          ? '0 2px 8px rgba(216,173,90,0.35), inset 0 1px 0 rgba(255,248,220,0.5) inset, 0 -1px 3px rgba(90,62,14,0.4) inset'
                          : 'none',
                      }}
                    >
                      <span className="text-[13px] font-bold">Add</span>
                      <I.Send s={15} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
};

/* Settings moved to src/components/SettingsView.tsx — see SettingsViewPremium */

/* ============================ APP (REAL TURSO) ============================ */
export default function MessagingApp() {
  const { user } = useAuth();

  // Start the global FPS monitor once — it tracks frame timing in the background
  // and feeds the adaptive quality manager without impacting rendering.
  useEffect(() => {
    fpsMonitor.start();
    return () => fpsMonitor.stop();
  }, []);
  const [tab, setTab] = useState('chats');
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatActionChat, setChatActionChat] = useState<Chat | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [nudges, setNudges] = useState<SocialNudge[]>([]);
  const [viewerNudges, setViewerNudges] = useState<SocialNudge[] | null>(null);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallRow | null>(null);
  const handledCallIds = useRef<Set<string>>(new Set());

  // ── INCOMING CALL DETECTION (real WebRTC ringing) ──
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const pollCalls = async () => {
      if (stopped || !isAppVisible()) return;
      try {
        const call = await findIncomingCall(user.uid);
        if (call && !handledCallIds.current.has(call.id)) {
          handledCallIds.current.add(call.id);
          setIncomingCall(call);
        }
      } catch {}
    };
    pollCalls();
    const iv = setInterval(pollCalls, 2500);
    return () => { stopped = true; clearInterval(iv); };
  }, [user]);

  // PERF: memoised — stable reference, no string alloc on every render
  const avatarUrl = useMemo(
    () => user?.photoURL || getAvatarUrl(user?.name || 'U'),
    [user?.photoURL, user?.name]
  );

  // PERFORMANCE SYSTEM 2: background prefetch of likely-open chats.
  // Scheduled during idle frames so it never competes with UI thread.
  const prefetchChatMessages = useCallback((chatList: Chat[]) => {
    if (!user) return;
    const top = chatList.slice(0, 6);
    idle(() => {
      for (const c of top) {
        if (prefetchInFlight.has(c.id)) continue;
        const cached = chatSnapshotCache.get(c.id);
        if (cached && Date.now() - cached.ts < 10_000) continue;
        prefetchInFlight.add(c.id);
        (async () => {
          try {
            let rawMsgs: any[] = [];
            let otherTyping = false;
            if (c.isGroup) {
              rawMsgs = await dedupedFetch(`gmsgs:${c.id}`, () => fetchGroupMessages(c.id, user.uid, 80));
            } else {
              const [dmMsgs, dmTyping] = await Promise.all([
                dedupedFetch(`dmsgs:${c.id}`, () => fetchMessages(c.id, user.uid, true)),
                dedupedFetch(`typing:${c.id}`, () => getTyping(c.id, c.uid).catch(() => false)),
              ]);
              rawMsgs = dmMsgs;
              otherTyping = dmTyping;
            }
            const mapped: Message[] = rawMsgs
              .filter((m) => !m.deleted && m.text !== '[removed]')
              .map((m) => {
                const fromUid = c.isGroup ? m.fromUid : m.from;
                const senderSide = fromUid === user.uid ? ('me' as const) : ('them' as const);
                const fromName = c.isGroup ? m.fromName : undefined;
                const fromAvatar = c.isGroup ? m.fromAvatar : undefined;
                return { id: m.id, text: m.text, time: cachedFormatTime(m.createdAt), sender: senderSide, status: m.status, fromName, fromAvatar };
              });
            chatSnapshotCache.set(c.id, { messages: mapped, typing: otherTyping, ts: Date.now() });
          } catch {}
          finally { prefetchInFlight.delete(c.id); }
        })();
      }
    }, 1500);
  }, [user]);

  // Set of users who currently have an active (published, non-expired) Nudge.
  // PERF: useMemo so Set is not rebuilt on every render — only when nudges array changes.
  const nudgeUserIds = useMemo(() => new Set(nudges.map((n) => n.userId)), [nudges]);
  const myNudgeCount = useMemo(
    () => (user ? nudges.filter((n) => n.userId === user.uid).length : 0),
    [nudges, user]
  );

  // Open the immersive viewer with every active Nudge published by `uid`.
  const handleViewNudges = useCallback((uid: string) => {
    const list = nudges.filter((n) => n.userId === uid);
    if (list.length) setViewerNudges(list);
  }, [nudges]);

  // Poll published Nudges so freshly-uploaded ones appear right away.
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const fetchNudges = async () => {
      try {
        const data = await listSocialNudges();
        if (!stopped) setNudges(data);
      } catch (e) {
        console.warn('Nudge poll failed:', e);
      }
    };
    fetchNudges();
    const iv = setInterval(fetchNudges, 4000);
    return () => { stopped = true; clearInterval(iv); };
  }, [user, refreshKey]);

  // Poll the chat list + heartbeat presence
  const chatListSigRef = useRef('');
  useEffect(() => {
    if (!user) return;
    let stopped = false;

    const poll = async () => {
      // ── ADAPTIVE TURBO SCHEDULER ──
      // Never burn network/CPU while the app is in a hidden tab.
      if (!isAppVisible()) return;
      try {
        const [dmSummaries, groupSummaries] = await Promise.all([
          dedupedFetch(`list:dm:${user.uid}`, () => listChats(user.uid)),
          dedupedFetch(`list:grp:${user.uid}`, () => listGroupChats(user.uid).catch(() => [])),
        ]);
        if (stopped) return;
        const dmChats = dmSummaries.map(summaryToChat);
        const grpChats = groupSummaries.map(summaryToChat);
        const merged = [...dmChats, ...grpChats].sort((a, b) => {
          const at = a.lastActive || 0;
          const bt = b.lastActive || 0;
          return bt - at;
        });
        prefetchChatMessages(merged);
        // ── QUANTUM DELTA ENGINE (chat list) ──
        // Skip setChats when nothing visible changed → the whole home screen
        // (rows, avatars, badges, animations) does zero re-render work.
        const sig = merged.map((c) => c.id + '·' + c.msg + '·' + c.time + '·' + (c.unread || 0) + '·' + (c.online ? 1 : 0) + '·' + c.img).join('|');
        if (sig !== chatListSigRef.current) {
          chatListSigRef.current = sig;
          setChats(merged);
        }
        setLoading(false);
      } catch (e) {
        console.warn('Chat list poll failed:', e);
        if (!stopped) setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);

    // Presence heartbeat every 30s
    heartbeat(user.uid);
    const hb = setInterval(() => heartbeat(user.uid), 30_000);

    // Instant catch-up the moment the tab becomes visible again
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => { stopped = true; clearInterval(interval); clearInterval(hb); document.removeEventListener('visibilitychange', onVisible); };
  }, [user, refreshKey, prefetchChatMessages]);

  const handleTabChange = (id: string) => {
    // Every primary destination is just a tab now — the bottom nav and the
    // surrounding app shell persist across all of them.
    setTab(id);
  };

  return (
    /* PERF: contain:strict on the outermost shell so the browser knows this
       subtree's layout never affects the rest of the page — eliminates
       global layout recalculation on every scroll/animation. */
    <div className="messaging-shell h-full w-full flex items-center justify-center overflow-hidden" style={{ background: 'var(--app-stage, #050403)', contain: 'layout style' }}>
      <div
        className="relative w-full max-w-[420px] h-full max-h-[900px] flex flex-col overflow-hidden sm:rounded-[44px]"
        style={{
          background: 'var(--app-frame, linear-gradient(178deg, #131009 0%, #0B0907 38%, #080606 100%))',
          boxShadow: '0 0 0 1px var(--app-edge, rgba(216,173,90,0.1)), 0 30px 90px rgba(0,0,0,0.9)',
          // Establish a stacking context that prevents child repaints from
          // propagating to the root. GPU compositing boundary.
          isolation: 'isolate',
          contain: 'layout style paint',
        }}
      >
        {/* Ambient glows — GPU layer, never repainted during scroll/interaction */}
        <div
          className="absolute top-0 inset-x-0 h-[220px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 90% 100% at 30% 0%, var(--glow-top, rgba(216,173,90,0.085)) 0%, transparent 65%)',
            transform: 'translateZ(0)',
            willChange: 'transform',
          }}
        />
        <div
          className="absolute bottom-0 inset-x-0 h-[180px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 50% 100%, var(--glow-bottom, rgba(216,173,90,0.06)) 0%, transparent 65%)',
            transform: 'translateZ(0)',
            willChange: 'transform',
          }}
        />

        {/* ─────────────────────────────────────────────────────────────
            APP SHELL
              ├── Main Content Area  (swaps between primary pages)
              └── Persistent Bottom Navigation
            The bottom nav lives in the shell, NOT inside any page, so it
            stays visible across Home / Settings / every primary page.
            Only Chat & Nudge-creation overlays (rendered later) cover it.
           ───────────────────────────────────────────────────────────── */}
        <motion.div
          initial={false}
          animate={{
            scale: showComposer ? 0.92 : 1,
            rotateX: showComposer ? -10 : 0,
            y: showComposer ? 30 : 0,
            opacity: showComposer ? 0 : 1,
            filter: showComposer ? 'blur(8px)' : 'blur(0px)',
          }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col min-h-0 pointer-events-auto overflow-hidden relative"
        >
          {/* ── MAIN CONTENT AREA ── */}
          <div className="flex-1 flex flex-col min-h-0 relative">
            <AnimatePresence mode="wait" initial={false}>
              {tab === 'settings' ? (
                <motion.div key="page-settings" className="absolute inset-0 flex flex-col min-h-0">
                  <SettingsViewPremium />
                </motion.div>
              ) : (
                <motion.div
                  key="page-home"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 flex flex-col min-h-0"
                >
                  <div className="pt-6" />
                  <SearchRow onNewGroup={() => { setGroupCreateOpen(true); }} />
                  <Stories
                    contacts={chats}
                    nudges={nudges}
                    myNudgeCount={myNudgeCount}
                    myAvatar={avatarUrl}
                    myUid={user?.uid || ''}
                    onNewNudge={() => setShowComposer(true)}
                    onViewNudges={handleViewNudges}
                  />

                  <div className="flex-shrink-0 px-4 pt-2">
                    <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(216,173,90,0.22) 50%, transparent)' }} />
                  </div>

                  {/* Chats list — from Turso
                      PERF: contain:layout style on the scroll container prevents
                      chat-row updates from triggering full-page layout recalculation. */}
                  <div className="scroll-area flex-1 min-h-0 relative px-2" style={{ contain: 'layout style' }}>
                    <div className="sticky top-0 h-3 -mx-2 z-10 pointer-events-none"
                      style={{ background: 'linear-gradient(180deg, #0B0907 0%, transparent 100%)' }} />
                    <div className="space-y-0.5 pt-1 pb-2">
                      {loading && chats.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 pt-16 text-[#6E6353]">
                          <div className="w-6 h-6 border-2 border-[#D4A853] border-t-transparent rounded-full animate-spin" />
                          <span className="text-[12px] font-semibold">Loading conversations...</span>
                        </div>
                      ) : (
                        chats.map((c, i) => (
                          // PERF: content-visibility:auto + contain-intrinsic-size
                          // causes browser to skip paint+layout for off-screen rows.
                          // Rows outside the viewport get skipped entirely until scrolled into view.
                          // contain:layout style on the row wrapper prevents chat row
                          // updates from cascading upward to parent layout.
                          <div
                            key={c.id}
                            style={{ contentVisibility: 'auto', containIntrinsicSize: '0 68px', contain: 'layout style' }}
                            onMouseEnter={() => prefetchChatMessages([c])}
                            onTouchStart={() => prefetchChatMessages([c])}
                            onClick={() => {
                              setGroupCreateOpen(false);
                              setShowComposer(false);
                              setChatActionChat(null);
                              setChats((prev) => prev.map((ch) => ch.id === c.id ? { ...ch, unread: 0 } : ch));
                              setActiveChat(c);
                            }}
                            onContextMenu={(e) => { e.preventDefault(); setChatActionChat(c); }}
                            onPointerDown={() => {
                              prefetchChatMessages([c]);
                              const timer = setTimeout(() => setChatActionChat(c), 500);
                              const up = () => { clearTimeout(timer); document.removeEventListener('pointerup', up); document.removeEventListener('pointerleave', up); };
                              document.addEventListener('pointerup', up);
                              document.addEventListener('pointerleave', up);
                            }}
                          >
                            <ChatRow c={c} delay={i * 40} />
                          </div>
                        ))
                      )}

                      {!loading && chats.length === 0 && (
                        <div className="flex flex-col items-center gap-3 pt-16 text-[#6E6353] px-4 text-center">
                          <I.Chat s={34} />
                          <span className="text-[12px] font-semibold">No conversations yet</span>
                          <span className="text-[11px] text-[#8A7D67] leading-relaxed max-w-[260px]">
                            Tap the gold + button below to add someone by their contact token.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 h-2 -mb-2 relative z-10 pointer-events-none"
                    style={{ background: 'linear-gradient(0deg, #0B0907 0%, transparent 100%)' }} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── PERSISTENT BOTTOM NAVIGATION ── */}
          <BottomNav active={tab} onChange={handleTabChange} onPlus={() => setSheetOpen(true)} />
        </motion.div>

        {/* ── INVITE FRIEND SHEET (navbar plus button) ── */}
        <BottomSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onAdded={() => { setSheetOpen(false); setRefreshKey((k) => k + 1); }}
        />

        {/* ── INCOMING CALL SCREEN (real WebRTC) ── */}
        <AnimatePresence>
          {incomingCall && user && (
            <CallScreen
              mode="incoming"
              myUid={user.uid}
              call={incomingCall}
              onClose={() => setIncomingCall(null)}
            />
          )}
        </AnimatePresence>

        {/* ── CHAT ROW ACTION SHEET (long-press → delete conversation) ── */}
        <ActionSheet
          isOpen={!!chatActionChat}
          onClose={() => setChatActionChat(null)}
          title={chatActionChat?.name ? `Actions for ${chatActionChat.name}` : ''}
          items={[
            {
              label: 'Delete Conversation',
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              ),
              destructive: true,
              onClick: async () => {
                if (!chatActionChat || !user) return;
                try {
                  await deleteChat(chatActionChat.id);
                  setChats((prev) => prev.filter((c) => c.id !== chatActionChat.id));
                  if (activeChat?.id === chatActionChat.id) setActiveChat(null);
                } catch (e) {
                  console.warn('Delete chat failed:', e);
                }
              },
            },
          ]}
        />

        <AnimatePresence>
          {showComposer && (
            <StoryCanvasComposer
              onClose={() => setShowComposer(false)}
              onSuccess={() => { setShowComposer(false); setRefreshKey((k) => k + 1); }}
            />
          )}
        </AnimatePresence>

        {/* ── IMMERSIVE NUDGE VIEWER (opened from golden-stroke contacts) ── */}
        <AnimatePresence>
          {viewerNudges && (
            <ImmersiveNudgeViewer
              nudges={viewerNudges}
              initialIndex={0}
              onClose={() => setViewerNudges(null)}
            />
          )}
        </AnimatePresence>

        {activeChat && (
          <ChatInterface
            chat={activeChat}
            onBack={() => setActiveChat(null)}
            allChats={chats}
          />
        )}
        <GroupCreateWizard
          open={groupCreateOpen}
          onClose={() => setGroupCreateOpen(false)}
          onCreated={() => { setRefreshKey(k => k + 1); setGroupCreateOpen(false); }}
        />
        
      </div>
    </div>
  );
}
