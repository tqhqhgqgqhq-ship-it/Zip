import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import {
  deleteSocialNudge,
  listSocialNudges,
  type SocialNudge,
} from '../lib/turso';
import { UniversalStoryCard, StoryCanvasComposer } from './StoryCanvasComposer';

/* ════════════════════════════════════════════════════════════════
   FONTS & TYPOGRAPHY CONFIGURATION
   ════════════════════════════════════════════════════════════════ */
export const PREMIUM_FONTS = [
  { id: 'jakarta', label: 'Aa', name: 'Jakarta Modern', family: "'Plus Jakarta Sans', sans-serif" },
  { id: 'fraunces', label: 'Ff', name: 'Editorial Fraunces', family: "'Fraunces', serif" },
  { id: 'instrument', label: 'Is', name: 'Pristine Sans', family: "'Instrument Sans', sans-serif" },
  { id: 'mono', label: '</>', name: 'Cyber Mono', family: "'Fragment Mono', monospace" },
  { id: 'serif', label: 'Ss', name: 'Classic Georgia', family: "Georgia, 'Times New Roman', serif" },
  { id: 'system', label: 'Sy', name: 'Neo System', family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: 'cursive', label: 'Cr', name: 'Velvet Romance', family: "'Brush Script MT', 'Segoe Script', cursive" },
  { id: 'impact', label: 'Im', name: 'Heavy Futura', family: "'Impact', 'Arial Black', sans-serif" },
  { id: 'condensed', label: 'Cn', name: 'Tech Condensed', family: "'Arial Narrow', 'Roboto Condensed', sans-serif" },
  { id: 'rounded', label: 'Rn', name: 'Soft Friendly', family: "'Nunito', 'Varela Round', system-ui, sans-serif" },
];

/* ════════════════════════════════════════════════════════════════
   BACKGROUNDS & GRADIENTS
   ════════════════════════════════════════════════════════════════ */
export const SOLID_BGS = [
  '#0B0907', '#1A1814', '#261C14', '#1E293B', '#0F172A', '#311518', '#14251D', '#271E3A', '#3A1E28', '#1E3A3A'
];

export const PREMIUM_GRADIENTS = [
  { id: 'gold_luxe', name: 'Gold Luxe', css: 'linear-gradient(145deg, #F7D185 0%, #C9913B 50%, #885D1C 100%)' },
  { id: 'obsidian_cyber', name: 'Obsidian Cyber', css: 'linear-gradient(145deg, #1E1A16 0%, #110E0B 50%, #070605 100%)' },
  { id: 'neon_aurora', name: 'Neon Aurora', css: 'linear-gradient(145deg, #06B6D4 0%, #3B82F6 50%, #8B5CF6 100%)' },
  { id: 'sunset_velvet', name: 'Sunset Velvet', css: 'linear-gradient(145deg, #F97316 0%, #EC4899 50%, #8B5CF6 100%)' },
  { id: 'emerald_deep', name: 'Emerald Deep', css: 'linear-gradient(145deg, #059669 0%, #10B981 50%, #065F46 100%)' },
  { id: 'midnight_sheen', name: 'Midnight Sheen', css: 'linear-gradient(145deg, #1E293B 0%, #0F172A 50%, #020617 100%)' },
  { id: 'royal_amethyst', name: 'Royal Amethyst', css: 'linear-gradient(145deg, #9333EA 0%, #6B21A8 50%, #3B0764 100%)' },
  { id: 'crimson_fire', name: 'Crimson Fire', css: 'linear-gradient(145deg, #DC2626 0%, #991B1B 50%, #450A0A 100%)' },
  { id: 'ocean_breeze', name: 'Ocean Breeze', css: 'linear-gradient(145deg, #0284C7 0%, #0369A1 50%, #0C4A6E 100%)' },
  { id: 'rose_gold', name: 'Rose Gold', css: 'linear-gradient(145deg, #F43F5E 0%, #BE123C 50%, #881337 100%)' },
];

/* ════════════════════════════════════════════════════════════════
   BORDERS & SHADOWS
   ════════════════════════════════════════════════════════════════ */
export const BORDER_STYLES = [
  { id: 'none', label: 'None', css: 'none' },
  { id: 'gold_luxe', label: 'Gold Luxe', css: '2px solid rgba(216,173,90,0.85)' },
  { id: 'cyber_neon', label: 'Cyber Neon', css: '2px solid rgba(6,182,212,0.8)' },
  { id: 'holographic', label: 'Holographic', css: '2px solid rgba(236,72,153,0.8)' },
  { id: 'glass_shimmer', label: 'Glass Shimmer', css: '2px solid rgba(255,255,255,0.25)' },
];

export const TEXT_SHADOWS = [
  { id: 'none', label: 'None', css: 'none' },
  { id: 'subtle_sheen', label: 'Subtle Sheen', css: '0 2px 6px rgba(0,0,0,0.65)' },
  { id: 'dark_obsidian', label: 'Dark Cyber', css: '0 4px 18px rgba(0,0,0,0.95)' },
  { id: 'neon_pop', label: 'Neon Glow', css: '0 0 14px rgba(6,182,212,0.6)' },
  { id: 'gold_hard', label: 'Gold Glow', css: '0 0 16px rgba(239,200,120,0.5)' },
];

/* ════════════════════════════════════════════════════════════════
   GLASSMORPHISM THEMES
   ════════════════════════════════════════════════════════════════ */
export const GLASS_THEMES = [
  { id: 0, label: 'No Glass', bg: 'transparent', filter: 'none' },
  { id: 0.35, label: 'Soft Obsidian', bg: 'rgba(11,9,7,0.35)', filter: 'blur(10px)' },
  { id: 0.6, label: 'Frosted Cyber', bg: 'rgba(11,9,7,0.6)', filter: 'blur(16px)' },
  { id: 0.85, label: 'Deep Frosted', bg: 'rgba(11,9,7,0.85)', filter: 'blur(24px)' },
];

/* ════════════════════════════════════════════════════════════════
   LAYOUT STYLES
   ════════════════════════════════════════════════════════════════ */
export const LAYOUT_STYLES = [
  { id: 'standard', label: 'Standard Card', icon: '🎴' },
  { id: 'cinematic', label: 'Immersive Img', icon: '🎬' },
  { id: 'editorial', label: 'Editorial Split', icon: '📑' },
  { id: 'cyber_badge', label: 'Floating Badge', icon: '🛸' },
];

/* ════════════════════════════════════════════════════════════════
   PREMIUM LIVE COUNTDOWN HELPER
   ════════════════════════════════════════════════════════════════ */
function formatCountdown(expiresAt: number): string {
  if (expiresAt === 0) return '∞ Never expires';
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  if (hours > 0) return `${hours}h ${mins}m left`;
  if (mins > 0) return `${mins}m ${secs}s left`;
  return `${secs}s left`;
}

function LiveCountdown({ expiresAt }: { expiresAt: number }) {
  const [str, setStr] = useState(() => formatCountdown(expiresAt));
  useEffect(() => {
    if (expiresAt === 0) return;
    const interval = setInterval(() => {
      setStr(formatCountdown(expiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return <span className="font-mono tracking-tight">{str}</span>;
}

/* ════════════════════════════════════════════════════════════════
   NUDGE RENDER CARD — Universal multi-layout component
   ════════════════════════════════════════════════════════════════ */
export function PremiumNudgeCard({
  n,
  compact,
  onClick,
}: {
  n: SocialNudge;
  compact?: boolean;
  onClick?: () => void;
}) {
  if (
    n.text?.startsWith('[story_v1]') ||
    n.text?.startsWith('[story_v2]') ||
    n.text?.startsWith('[story_v3]') ||
    n.text?.startsWith('[nudge]')
  ) {
    return (
      <motion.div
        whileHover={onClick ? { scale: 1.015, rotateY: 1 } : undefined}
        whileTap={onClick ? { scale: 0.985 } : undefined}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={onClick}
        className="group relative w-full flex flex-col cursor-pointer select-none"
      >
        <UniversalStoryCard nudgeText={n.text} compact={compact} />
      </motion.div>
    );
  }

  const font = PREMIUM_FONTS.find((f) => f.id === n.fontId) || PREMIUM_FONTS[0];
  const border = BORDER_STYLES.find((b) => b.id === n.borderStyle) || BORDER_STYLES[0];
  const shadow = TEXT_SHADOWS.find((s) => s.id === n.textShadow) || TEXT_SHADOWS[0];
  const glass = GLASS_THEMES.find((g) => g.id === n.glassmorphism) || GLASS_THEMES[0];
  const isGradient = n.gradientBg && n.gradientBg !== 'none';

  const minH = compact ? 220 : 360;

  // Outer Box CSS
  const outerCss: React.CSSProperties = {
    background: isGradient ? n.gradientBg : (n.bgColor || '#1A1814'),
    border: border.css,
    borderRadius: `${n.borderRadius || 20}px`,
    minHeight: minH,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: border.id !== 'none' ? '0 8px 32px rgba(0,0,0,0.7), 0 0 18px rgba(216,173,90,0.15)' : '0 6px 24px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: onClick ? 'pointer' : 'default',
  };

  // Img rendering inside Nudge
  const hasImg = !!n.imageUrl;

  return (
    <motion.div
      whileHover={onClick ? { scale: 1.015, rotateY: 1 } : undefined}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      style={outerCss}
      onClick={onClick}
      className="group"
    >
      {/* Background Img — scaled to fit completely without cropping */}
      {hasImg && (
        <img
          src={n.imageUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain select-none transition-transform duration-700 group-hover:scale-105"
          style={{
            opacity: n.imageOpacity ?? 1.0,
            mixBlendMode: (n.imageBlend as any) || 'normal',
            objectFit: 'contain',
            objectPosition: 'center',
          }}
        />
      )}

      {/* Internal Content Container based on Layout Style */}
      <div
        className="relative flex-1 flex flex-col p-6 z-10"
        style={{
          background: glass.bg,
          backdropFilter: glass.filter,
          WebkitBackdropFilter: glass.filter,
          justifyContent: n.layoutStyle === 'editorial' ? 'flex-end' : n.layoutStyle === 'cyber_badge' ? 'center' : 'center',
        }}
      >
        {/* Floating cyber ring if badge layout */}
        {n.layoutStyle === 'cyber_badge' && (
          <div className="absolute inset-4 pointer-events-none rounded-[28px] border border-[#D4A853]/20 flex items-center justify-center">
            <div className="absolute w-[180px] h-[180px] rounded-full border border-cyan-400/20 animate-spin" style={{ animationDuration: '20s' }} />
          </div>
        )}

        <div className={`relative max-w-full ${n.layoutStyle === 'editorial' ? 'border-l-4 border-[#D4A853] pl-4 py-2 bg-black/40 backdrop-blur-md rounded-r-2xl' : ''}`}>
          <p
            className="whitespace-pre-wrap break-words transition-all duration-300"
            style={{
              fontFamily: font.family,
              fontSize: compact ? `${Math.min(n.fontSize || 26, 32)}px` : `${n.fontSize || 26}px`,
              fontWeight: n.fontWeight || 700,
              color: n.textColor || '#FFFFFF',
              textShadow: shadow.css,
              textAlign: n.textAlign || 'center',
              lineHeight: 1.35,
            }}
          >
            {n.text || (compact ? '' : '✨ Nothing written')}
          </p>
        </div>
      </div>

      {/* Footer Info Row */}
      <div className="relative z-20 px-5 py-3 flex items-center justify-between flex-shrink-0 bg-black/60 backdrop-blur-md border-t border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={n.userAvatar || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(n.userName || 'U')}&backgroundColor=f1ede7`}
            alt=""
            className="w-7 h-7 rounded-full object-cover border border-[#D4A853]/50 flex-shrink-0"
          />
          <span className="text-[12px] font-bold text-[#F3EADB] truncate tracking-tight">{n.userName}</span>
        </div>
        <div className="text-[11px] text-[#EFC878] flex-shrink-0 flex items-center gap-1.5 font-medium">
          <span>⏳</span>
          <LiveCountdown expiresAt={n.expiresAt} />
        </div>
      </div>

      {/* Metallic Shimmer Sweep Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"
        style={{
          background: 'linear-gradient(105deg, transparent 35%, rgba(255,241,204,0.12) 50%, transparent 65%)',
          backgroundSize: '250% 100%',
          animation: 'shimmer 4s ease-in-out infinite',
        }}
      />
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   FULL-SCREEN IMMERSIVE NUDGE VIEWER — Like Immersive Stories
   ════════════════════════════════════════════════════════════════ */
export function ImmersiveNudgeViewer({
  nudges,
  initialIndex,
  onClose,
  onEditNudge,
  onDeleteNudge,
}: {
  nudges: SocialNudge[];
  initialIndex: number;
  onClose: () => void;
  onEditNudge?: (n: SocialNudge) => void;
  onDeleteNudge?: (n: SocialNudge) => void;
}) {
  const { user } = useAuth();
  const [currIdx, setCurrIdx] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const currNudge = nudges[currIdx] || nudges[0];
  const isMyNudge = user && currNudge && currNudge.userId === user.uid;

  // Immersive Auto Advance every 8s unless paused
  useEffect(() => {
    if (paused || !currNudge) return;
    const interval = 80; // update every 80ms
    const totalMs = 8000;
    const step = (interval / totalMs) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (currIdx < nudges.length - 1) {
            setCurrIdx((i) => i + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [currIdx, nudges.length, paused, onClose, currNudge]);

  const handleNext = () => {
    if (currIdx < nudges.length - 1) {
      setCurrIdx((i) => i + 1);
      setProgress(0);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currIdx > 0) {
      setCurrIdx((i) => i - 1);
      setProgress(0);
    }
  };

  if (!currNudge) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl select-none"
    >
      {/* Main Story Container */}
      <div
        className="relative w-full max-w-[480px] h-full max-h-[920px] flex flex-col overflow-hidden sm:rounded-[40px] shadow-[0_0_80px_rgba(0,0,0,0.9),0_0_0_1px_rgba(216,173,90,0.25)]"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {/* Story Progress Bars Bar */}
        <div className="absolute top-0 inset-x-0 z-50 pt-3 px-4 flex items-center gap-1.5">
          {nudges.map((_, i) => (
            <div key={i} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#EFC878] transition-all duration-100"
                style={{
                  width: i < currIdx ? '100%' : i === currIdx ? `${progress}%` : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Top Header info */}
        <div className="absolute top-5 inset-x-0 z-50 px-5 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2.5">
            <img
              src={currNudge.userAvatar || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(currNudge.userName)}`}
              alt=""
              className="w-9 h-9 rounded-full object-cover border-2 border-[#D4A853]"
            />
            <div className="flex flex-col">
              <span className="text-[14px] font-extrabold text-white leading-tight">{currNudge.userName}</span>
              <span className="text-[11px] text-[#EFC878] flex items-center gap-1">
                <span>⏱</span> <LiveCountdown expiresAt={currNudge.expiresAt} />
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isMyNudge && onEditNudge && onDeleteNudge && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onEditNudge(currNudge); }}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-[#D4A853] hover:text-black flex items-center justify-center text-white transition-colors"
                  aria-label="Edit"
                >
                  ✏️
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteNudge(currNudge); }}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-red-500 flex items-center justify-center text-white transition-colors"
                  aria-label="Delete"
                >
                  🗑️
                </button>
              </>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-colors ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Universal Render inside Immersive Container */}
        <div className="flex-1 flex pointer-events-none">
          <PremiumNudgeCard n={currNudge} />
        </div>

        {/* Tappable Side overlays for Prev / Next navigation */}
        <div
          className="absolute inset-y-16 left-0 w-1/3 z-30 pointer-events-auto"
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
        />
        <div
          className="absolute inset-y-16 right-0 w-2/3 z-30 pointer-events-auto"
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
        />

        {/* Interactive Bottom Reply or Share Bar */}
        <div className="absolute bottom-0 inset-x-0 z-50 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center gap-3 pointer-events-auto">
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: `Nudge by ${currNudge.userName}`,
                  text: `Check out what ${currNudge.userName} posted on Nudgel: "${currNudge.text}"`,
                }).catch(() => {});
              } else {
                navigator.clipboard.writeText(window.location.href);
                alert("Link copied!");
              }
            }}
            className="flex-1 h-12 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center gap-2 text-white text-[14px] font-bold transition-all"
          >
            <span>🔗</span> Share Nudge
          </button>
        </div>
      </div>
    </motion.div>
  );
}



  /* ════════════════════════════════════════════════════════════════
   MAIN SOCIAL STATUS BOARD — Production Immersive Nudges Board
   ════════════════════════════════════════════════════════════════ */
export function SocialStatusBoard({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [nudges, setNudges] = useState<SocialNudge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Active viewing or editing states
  const [viewingIdx, setViewingIdx] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  // Poll Social Nudges from Turso database with instant caching
  useEffect(() => {
    let stopped = false;
    const fetchAll = async () => {
      try {
        const data = await listSocialNudges();
        if (stopped) return;
        setNudges(data);
        setLoading(false);
      } catch (err) {
        console.warn("Error fetching live nudges:", err);
        if (!stopped) setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 2500); // Super fast real-time poll
    return () => { stopped = true; clearInterval(interval); };
  }, [refreshKey]);

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const handleDelete = async (n: SocialNudge) => {
    if (!user) return;
    if (confirm(`Delete your Nudge "${n.text.slice(0, 30)}..."?`)) {
      setNudges((prev) => prev.filter((item) => item.id !== n.id));
      if (viewingIdx !== null) setViewingIdx(null);
      await deleteSocialNudge(n.id, user.uid);
      triggerRefresh();
    }
  };

  const handleEdit = (_n: SocialNudge) => {
    if (viewingIdx !== null) setViewingIdx(null);
    setComposerOpen(true);
  };

  const openNewComposer = () => {
    setComposerOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, rotateY: -10 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 z-50 flex flex-col bg-[#0B0907] overflow-hidden select-none"
    >
      {/* Superior Immersive Board Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 bg-gradient-to-b from-[#1E1A16] to-[#0B0907] border-b border-[#D4A853]/15 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-11 h-11 rounded-2xl bg-white/5 hover:bg-[#D4A853]/20 border border-white/10 flex items-center justify-center text-[#D4A853] transition-all"
            aria-label="Back"
          >
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div>
            <h1 className="logo-shimmer text-[26px] sm:text-[30px] font-extrabold tracking-tight flex items-center gap-2">
              Global Social Feed
              <span className="text-[#FFE9B8]" style={{ filter: 'drop-shadow(0 0 8px rgba(255,233,184,0.8))' }}>🛸</span>
            </h1>
            <span className="text-[12px] font-bold text-[#8A7D67] tracking-wider uppercase block mt-0.5">
              Live Real-Time World Board
            </span>
          </div>
        </div>

        <button
          onClick={openNewComposer}
          className="h-12 px-5 rounded-2xl gold-solid hero-glow tappable text-black font-extrabold text-[14px] flex items-center gap-2.5 shadow-xl flex-shrink-0"
          style={{ textShadow: '0 1px 0 rgba(255,243,214,0.6)' }}
        >
          <span className="text-[18px]">✨</span>
          <span className="hidden sm:inline">Create Nudge</span>
        </button>
      </div>

      {/* Main Board Scroll Grid */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 bg-[#050403]">

        {/* 1. MY NUDGES SECTION (If published) */}
        {user && nudges.some((n) => n.userId === user.uid) && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-extrabold text-[#EFC878] tracking-wider uppercase flex items-center gap-2">
                <span>⭐</span> Your Published Nudges
              </h2>
              <span className="text-[11px] font-mono text-[#8A7D67]">Fully synchronized</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {nudges.filter((n) => n.userId === user.uid).map((n) => (
                <div key={n.id} className="relative group">
                  <PremiumNudgeCard n={n} compact onClick={() => setViewingIdx(nudges.findIndex((item) => item.id === n.id))} />
                  
                  {/* Internal Immersive Action CRUD Trigger Bar */}
                  <div className="absolute top-4 right-4 z-40 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(n); }}
                      className="w-10 h-10 rounded-xl bg-black/80 hover:bg-[#D4A853] hover:text-black text-[#EFC878] font-bold flex items-center justify-center border border-[#D4A853]/40 backdrop-blur-md transition-colors shadow-xl"
                      title="Edit Nudge"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(n); }}
                      className="w-10 h-10 rounded-xl bg-black/80 hover:bg-red-600 hover:text-white text-red-400 font-bold flex items-center justify-center border border-red-500/40 backdrop-blur-md transition-colors shadow-xl ml-1"
                      title="Delete Nudge"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. GLOBAL WORLD NUDGES FEED */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-extrabold text-white tracking-wider uppercase flex items-center gap-2">
              <span>🌐</span> Everyone's Live Nudges
            </h2>
            <span className="text-[12px] text-[#8A7D67] font-semibold">{nudges.length} Active Posts</span>
          </div>

          {loading && nudges.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="w-12 h-12 border-4 border-[#D4A853] border-t-transparent rounded-full animate-spin" />
              <span className="text-[16px] font-extrabold text-white">Syncing worldwide status board...</span>
              <span className="text-[12px] text-[#8A7D67]">Connecting to end-to-end encrypted cluster</span>
            </div>
          ) : nudges.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center bg-[#0B0907] rounded-3xl border border-white/5 p-8">
              <span className="text-[48px]">🛸</span>
              <span className="text-[18px] font-extrabold text-white">No live Nudges currently active</span>
              <span className="text-[13px] text-[#8A7D67] max-w-md">
                Be the first person in the world to upload an immersive Nudge. Tap "Create Nudge" above.
              </span>
              <button onClick={openNewComposer} className="mt-2 px-6 py-3 rounded-xl gold-solid text-black font-extrabold text-[13px]">
                🚀 Get Started
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {nudges.map((n, i) => (
                <PremiumNudgeCard
                  key={n.id}
                  n={n}
                  onClick={() => setViewingIdx(i)}
                />
              ))}
            </div>
          )}

        </div>
      </div>

      {/* ── OVERLAYS ── */}
      <AnimatePresence>
        {viewingIdx !== null && (
          <ImmersiveNudgeViewer
            nudges={nudges}
            initialIndex={viewingIdx}
            onClose={() => setViewingIdx(null)}
            onEditNudge={handleEdit}
            onDeleteNudge={handleDelete}
          />
        )}

        {composerOpen && (
          <StoryCanvasComposer
            onClose={() => setComposerOpen(false)}
            onSuccess={triggerRefresh}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
