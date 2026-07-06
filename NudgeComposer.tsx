import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { sendMessage as dbSendMessage } from '../lib/turso';
import { uploadImageFile } from '../lib/jscord-upload';

/* ════════════════════════════════════════════════════════════════
   TYPOGRAPHY SUITE
   ════════════════════════════════════════════════════════════════ */
const FONTS = [
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
const BACKGROUNDS = [
  { id: 'gold', name: 'Gold Luxe', css: 'linear-gradient(145deg, #F7D185 0%, #C9913B 50%, #885D1C 100%)' },
  { id: 'obsidian', name: 'Obsidian Cyber', css: 'linear-gradient(145deg, #1E1A16 0%, #110E0B 50%, #070605 100%)' },
  { id: 'neon', name: 'Neon Aurora', css: 'linear-gradient(145deg, #06B6D4 0%, #3B82F6 50%, #8B5CF6 100%)' },
  { id: 'sunset', name: 'Sunset Velvet', css: 'linear-gradient(145deg, #F97316 0%, #EC4899 50%, #8B5CF6 100%)' },
  { id: 'emerald', name: 'Emerald Deep', css: 'linear-gradient(145deg, #059669 0%, #10B981 50%, #065F46 100%)' },
  { id: 'midnight', name: 'Midnight Sheen', css: 'linear-gradient(145deg, #1E293B 0%, #0F172A 50%, #020617 100%)' },
  { id: 'amethyst', name: 'Royal Amethyst', css: 'linear-gradient(145deg, #9333EA 0%, #6B21A8 50%, #3B0764 100%)' },
  { id: 'fire', name: 'Crimson Fire', css: 'linear-gradient(145deg, #DC2626 0%, #991B1B 50%, #450A0A 100%)' },
  { id: 'ocean', name: 'Ocean Breeze', css: 'linear-gradient(145deg, #0284C7 0%, #0369A1 50%, #0C4A6E 100%)' },
  { id: 'rose', name: 'Rose Gold', css: 'linear-gradient(145deg, #F43F5E 0%, #BE123C 50%, #881337 100%)' },
];

/* ════════════════════════════════════════════════════════════════
   BORDERS & SHADOWS
   ════════════════════════════════════════════════════════════════ */
const BORDERS = [
  { id: 'none', label: 'None', css: 'none' },
  { id: 'gold', label: 'Gold Luxe', css: '2px solid rgba(216,173,90,0.85)' },
  { id: 'cyber', label: 'Cyber Neon', css: '2px solid rgba(6,182,212,0.8)' },
  { id: 'glow', label: 'Holographic Glow', css: '2px solid rgba(236,72,153,0.8)' },
  { id: 'white', label: 'Delicate Glass', css: '2px solid rgba(255,255,255,0.25)' },
];

const TEXT_BG = [
  { id: 'none', label: 'None', css: 'transparent', filter: 'none' },
  { id: 'dark', label: 'Obsidian Shield', css: 'rgba(11,9,7,0.65)', filter: 'blur(16px)' },
  { id: 'light', label: 'Pearl Frosted', css: 'rgba(255,255,255,0.15)', filter: 'blur(12px)' },
  { id: 'gold', label: 'Gold Luxe Frosted', css: 'rgba(216,173,90,0.25)', filter: 'blur(16px)' },
  { id: 'blur', label: 'Deep Cyber Blur', css: 'rgba(0,0,0,0.45)', filter: 'blur(24px)' },
];

/* ════════════════════════════════════════════════════════════════
   NUDGE DATA CONTRACT — Backwards compatible
   ════════════════════════════════════════════════════════════════ */
const NUDGE_PREFIX = '[nudge]';
export function isNudgeMessage(text: string): boolean {
  return typeof text === 'string' && text.startsWith(NUDGE_PREFIX);
}
export function encodeNudge(data: NudgeData): string {
  return NUDGE_PREFIX + JSON.stringify(data);
}
export function decodeNudge(text: string): NudgeData | null {
  if (!isNudgeMessage(text)) return null;
  try { return JSON.parse(text.slice(NUDGE_PREFIX.length)); } catch { return null; }
}

export type NudgeData = {
  text: string;
  fontId: string;
  bgId: string;
  borderId: string;
  textBgId: string;
  expiryId: string;
  expiresAt: number;
  imageUrl?: string;
  textColor: string;
  // Advanced architecture specs
  fontSize?: number;
  fontWeight?: number;
  textShadow?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  borderRadius?: number;
  layoutStyle?: string;
  imageOpacity?: number;
  imageBlend?: string;
};

/* ════════════════════════════════════════════════════════════════
   PREMIUM LIVE COUNTDOWN COMPONENT
   ════════════════════════════════════════════════════════════════ */
function formatRemaining(expiresAt: number): string {
  if (expiresAt === 0) return '∞ Never expires';
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  if (mins > 0) return `${mins}m ${secs}s left`;
  return `${secs}s left`;
}

function LiveRemaining({ expiresAt }: { expiresAt: number }) {
  const [str, setStr] = useState(() => formatRemaining(expiresAt));
  useEffect(() => {
    if (expiresAt === 0) return;
    const interval = setInterval(() => setStr(formatRemaining(expiresAt)), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return <span className="font-mono tracking-tight">{str}</span>;
}

/* ════════════════════════════════════════════════════════════════
   NUDGE CARD RENDERER
   ════════════════════════════════════════════════════════════════ */
export function NudgeCard({ nudge, compact }: { nudge: NudgeData; compact?: boolean }) {
  const font = FONTS.find((f) => f.id === nudge.fontId) || FONTS[0];
  const bg = BACKGROUNDS.find((b) => b.id === nudge.bgId) || BACKGROUNDS[0];
  const border = BORDERS.find((b) => b.id === nudge.borderId) || BORDERS[0];
  const textBg = TEXT_BG.find((t) => t.id === nudge.textBgId) || TEXT_BG[0];
  const expired = nudge.expiresAt > 0 && Date.now() > nudge.expiresAt;

  if (expired) {
    return (
      <div className="flex items-center justify-center rounded-[24px] p-6 bg-[#16120D] border border-white/5" style={{ minHeight: compact ? 120 : 200 }}>
        <span className="text-[13px] text-[#8A7D67] font-extrabold italic tracking-wide">✨ This direct Nudge card has expired</span>
      </div>
    );
  }

  const minH = compact ? 200 : 340;
  const shadowEffect = nudge.textShadow || (border.id === 'glow' ? '0 0 20px rgba(236,72,153,0.5)' : '0 8px 32px rgba(0,0,0,0.6)');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, rotateX: 10 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden group select-none flex flex-col justify-between"
      style={{
        background: bg.css,
        border: border.css,
        borderRadius: `${nudge.borderRadius || 24}px`,
        boxShadow: shadowEffect,
        minHeight: minH,
      }}
    >
      {/* Background Image — scaled down automatically so the full image is always visible without cropping */}
      {nudge.imageUrl && (
        <img
          src={nudge.imageUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain select-none transition-transform duration-700 group-hover:scale-105"
          style={{
            opacity: nudge.imageOpacity ?? 1.0,
            mixBlendMode: (nudge.imageBlend as any) || 'normal',
            objectFit: 'contain',
            objectPosition: 'center',
          }}
        />
      )}

      {/* Subtle darkening overlay at the bottom when photo is full-bleed so text stays legible */}
      {nudge.imageUrl && (nudge.imageOpacity ?? 1) >= 0.98 && nudge.text && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.55) 100%)',
          }}
        />
      )}

      {/* Nudge Content Panel */}
      <div
        className="relative flex-1 flex flex-col p-6 z-10 items-center"
        style={{
          justifyContent: nudge.layoutStyle === 'editorial' ? 'flex-end' : 'center',
        }}
      >
        {nudge.text && (
          <div
            className="px-6 py-4 max-w-full transition-all duration-300"
            style={{
              background: textBg.css,
              backdropFilter: textBg.filter,
              WebkitBackdropFilter: textBg.filter,
              borderRadius: `${Math.max((nudge.borderRadius || 24) - 8, 12)}px`,
              border: textBg.id !== 'none' ? '1px solid rgba(255,255,255,0.1)' : undefined,
              boxShadow: textBg.id !== 'none' ? '0 8px 32px rgba(0,0,0,0.5)' : undefined,
            }}
          >
            <p
              className="whitespace-pre-wrap break-words leading-snug"
              style={{
                fontFamily: font.family,
                fontWeight: nudge.fontWeight || 700,
                fontSize: compact ? `${Math.min(nudge.fontSize || 28, 30)}px` : `${nudge.fontSize || 28}px`,
                color: nudge.textColor || '#FFFFFF',
                textShadow: nudge.textShadow || '0 2px 10px rgba(0,0,0,0.6)',
                textAlign: nudge.textAlign || 'center',
              }}
            >
              {nudge.text}
            </p>
          </div>
        )}
      </div>

      {/* Footer Remaining Row */}
      {nudge.expiresAt > 0 && (
        <div className="relative z-20 px-5 py-2.5 bg-black/60 backdrop-blur-md border-t border-white/5 flex items-center justify-between text-[11px] font-extrabold text-[#EFC878]">
          <span>⏳ Direct Card Scheduled</span>
          <LiveRemaining expiresAt={nudge.expiresAt} />
        </div>
      )}

      {/* Cinematic Sheen Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"
        style={{
          background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.15) 50%, transparent 65%)',
          backgroundSize: '250% 100%',
          animation: 'shimmer 4s ease-in-out infinite',
        }}
      />
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   NUDGE COMPOSER / CREATOR SUITE FOR 1-ON-1 DIRECT CHAT
   ════════════════════════════════════════════════════════════════ */
type Tab = 'text' | 'style' | 'image' | 'expiry';

export default function NudgeComposer({
  chatId,
  onClose,
  onSent,
}: {
  chatId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('text');

  // Specs
  const [text, setText] = useState('');
  const [fontIdx, setFontIdx] = useState(0);
  const [fontSize, setFontSize] = useState(28);
  const [fontWeight, setFontWeight] = useState(700);
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right' | 'justify'>('center');
  const [textShadow, _setTextShadow] = useState('0 2px 10px rgba(0,0,0,0.7)');

  const [bgIdx, setBgIdx] = useState(0);
  const [borderIdx, setBorderIdx] = useState(0);
  const [borderRadius, setBorderRadius] = useState(24);
  const [textBgIdx, setTextBgIdx] = useState(0);
  const [layoutStyle, setLayoutStyle] = useState('standard');

  const [imageUrl, setImageUrl] = useState('');
  // When an image is added, default to full-bleed / full-screen photo (opacity 1.0)
  const [imageOpacity, setImageOpacity] = useState(1.0);
  const [imageBlend, setImageBlend] = useState('normal');

  const [expiryDays, setExpiryDays] = useState(1);
  const [expiryHours, setExpiryHours] = useState(0);
  const [neverExpire, setNeverExpire] = useState(false);

  // States
  const [uploadingImg, setUploadingImg] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const expiresMs = neverExpire ? 0 : (expiryDays * 24 + expiryHours) * 3600 * 1000;

  const activePreview: NudgeData = useMemo(() => ({
    text,
    fontId: FONTS[fontIdx].id,
    fontSize,
    fontWeight,
    textColor,
    textAlign,
    textShadow,
    bgId: BACKGROUNDS[bgIdx].id,
    borderId: BORDERS[borderIdx].id,
    borderRadius,
    textBgId: TEXT_BG[textBgIdx].id,
    layoutStyle,
    expiryId: neverExpire ? 'never' : 'custom',
    expiresAt: neverExpire ? 0 : Date.now() + expiresMs,
    imageUrl: imageUrl || undefined,
    imageOpacity,
    imageBlend,
  }), [
    text, fontIdx, fontSize, fontWeight, textColor, textAlign, textShadow,
    bgIdx, borderIdx, borderRadius, textBgIdx, layoutStyle,
    neverExpire, expiresMs, imageUrl, imageOpacity, imageBlend,
  ]);

  const handleImagePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingImg(true);
    try {
      // Use universal uploader (GoFile for files, CDN for images) with fallback
      const res = await uploadImageFile(file);
      if (res.success && res.url) {
        setImageUrl(res.url);
        // Ensure uploaded photo is displayed full-screen / full-bleed by default
        setImageOpacity(1.0);
        setImageBlend('normal');
      }
    } catch (err) {
      alert("Error on Nudge image upload: " + err);
    } finally {
      setUploadingImg(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingImg(true);
    try {
      const res = await uploadImageFile(file);
      if (res.success && res.url) {
        setImageUrl(res.url);
        // Ensure uploaded photo is full-screen / full-bleed by default
        setImageOpacity(1.0);
        setImageBlend('normal');
      }
    } catch (err) {
      alert("Error on drop upload: " + err);
    } finally {
      setUploadingImg(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!user || (!text.trim() && !imageUrl)) return alert("Please add some text or an image.");
    setSending(true);
    try {
      await dbSendMessage(chatId, user.uid, encodeNudge(activePreview));
      setSent(true);
      setTimeout(() => { onSent(); onClose(); }, 1200);
    } catch (err) {
      alert("Failed to send direct Nudge: " + err);
      setSending(false);
    }
  }, [user, text, imageUrl, chatId, activePreview, onSent, onClose]);

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'text', label: 'Content', icon: '📝' },
    { id: 'style', label: 'Aesthetics', icon: '🎨' },
    { id: 'image', label: 'Media', icon: '🖼️' },
    { id: 'expiry', label: 'Lifetime', icon: '⏱️' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 z-[70] flex flex-col bg-[#050403] select-none overflow-hidden"
    >
      {/* ── Superior Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5 flex-shrink-0">
        <button onClick={onClose} className="tappable-soft text-[#D4A853] p-1">
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div>
          <h2 className="text-[18px] font-extrabold gold-text tracking-tight text-center">Direct Immersive Nudge</h2>
          <span className="text-[11px] font-bold text-[#8A7D67] uppercase block text-center mt-0.5">1-on-1 Chat Card Engine</span>
        </div>
        <div className="w-[28px]" />
      </div>

      {/* ── Immersive Active Preview Section ── */}
      <div className="flex-shrink-0 p-5 bg-gradient-to-b from-[#13100B] to-[#0A0806] border-b border-[#D4A853]/10 flex items-center justify-center">
        <div className="w-full max-w-[380px]">
          <NudgeCard nudge={activePreview} compact />
        </div>
      </div>

      {/* ── Sophisticated Builder Suite Navbar ── */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex gap-1.5 p-1 rounded-2xl bg-[#16120D] border border-white/5 max-w-full overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-[12px] font-extrabold transition-all duration-300 flex items-center justify-center gap-1.5 ${
                tab === t.id ? 'gold-solid text-black shadow-lg' : 'text-[#8A7D67] hover:text-white'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Internal Interactive Suite Area ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 scroll-area">
        <AnimatePresence mode="wait">

          {/* 1. TEXT TAB */}
          {tab === 'text' && (
            <motion.div key="text" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider">What do you want to convey?</label>
                  <span className="text-[11px] font-mono text-[#8A7D67]">{text.length}/300</span>
                </div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type an elegant message..."
                  rows={4}
                  maxLength={300}
                  className="w-full rounded-2xl p-4 bg-[#16120D] border-2 border-[#D4A853]/20 focus:border-[#D4A853] text-[16px] font-medium text-white placeholder-[#6E6353] outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-3">Text Alignment Suite</label>
                <div className="flex gap-2">
                  {(['left', 'center', 'right', 'justify'] as const).map((aln) => (
                    <button
                      key={aln}
                      onClick={() => setTextAlign(aln)}
                      className={`flex-1 py-2.5 rounded-xl font-bold uppercase text-[11px] border transition-all ${
                        textAlign === aln ? 'gold-solid text-black border-transparent' : 'bg-[#16120D] text-[#8A7D67] border-white/10 hover:text-white'
                      }`}
                    >
                      {aln === 'left' ? '⫷ Left' : aln === 'center' ? '⫸ Center' : aln === 'right' ? '⫶ Right' : '≡ Justify'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-3">Typography Color Swatches</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {['#FFFFFF', '#000000', '#F3EADB', '#EFC878', '#38BDF8', '#4ADE80', '#F43F5E', '#C084FC', '#FBBF24'].map((col) => (
                    <button
                      key={col}
                      onClick={() => setTextColor(col)}
                      className="w-9 h-9 rounded-full border-2 transition-transform"
                      style={{
                        background: col,
                        borderColor: textColor === col ? '#D4A853' : 'rgba(255,255,255,0.15)',
                        transform: textColor === col ? 'scale(1.2)' : 'scale(1)',
                      }}
                    />
                  ))}
                  <div className="flex items-center gap-1.5 pl-2">
                    <span className="text-[11px] font-medium text-[#8A7D67]">Hex:</span>
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-9 h-9 rounded-xl bg-transparent cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                <div>
                  <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-2">Font Size: {fontSize}px</label>
                  <input
                    type="range"
                    min={18}
                    max={44}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4A853]"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-2">Font Weight: {fontWeight}</label>
                  <input
                    type="range"
                    min={400}
                    max={900}
                    step={100}
                    value={fontWeight}
                    onChange={(e) => setFontWeight(Number(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4A853]"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* 2. STYLE TAB */}
          {tab === 'style' && (
            <motion.div key="style" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-3">Layout Style Architecture</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 'standard', label: 'Standard Card', icon: '🎴' },
                    { id: 'cinematic', label: 'Immersive Img', icon: '🎬' },
                    { id: 'editorial', label: 'Editorial Split', icon: '📑' },
                  ].map((lay) => (
                    <button
                      key={lay.id}
                      onClick={() => setLayoutStyle(lay.id)}
                      className={`p-3 rounded-xl border flex items-center gap-2.5 font-bold transition-all ${
                        layoutStyle === lay.id ? 'gold-solid text-black border-transparent shadow-md' : 'bg-[#16120D] text-[#C9BCA6] border-white/5 hover:text-white'
                      }`}
                    >
                      <span className="text-[20px]">{lay.icon}</span>
                      <span className="text-[12px]">{lay.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-3">10 Elegant Font Engines</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {FONTS.map((f, i) => (
                    <button
                      key={f.id}
                      onClick={() => setFontIdx(i)}
                      className={`p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between ${
                        fontIdx === i ? 'gold-solid text-black border-transparent shadow-lg font-extrabold scale-[1.02]' : 'bg-[#16120D] text-white border-white/5 hover:border-[#D4A853]/30 font-bold'
                      }`}
                    >
                      <span className="text-[18px]" style={{ fontFamily: f.family }}>{f.label} Nudge</span>
                      <span className={`text-[10px] mt-1 ${fontIdx === i ? 'text-black/80' : 'text-[#8A7D67]'}`}>{f.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-3">Luxurious Gradient Surfaces</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {BACKGROUNDS.map((bg, i) => (
                    <button
                      key={bg.id}
                      onClick={() => setBgIdx(i)}
                      className={`h-14 rounded-xl font-extrabold text-[12px] flex items-center justify-center p-2 text-white shadow-md transition-transform ${
                        bgIdx === i ? 'ring-3 ring-[#D4A853] scale-105' : 'hover:opacity-90'
                      }`}
                      style={{ background: bg.css, textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                    >
                      {bg.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-3">Border Shield Style</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {BORDERS.map((b, i) => (
                    <button
                      key={b.id}
                      onClick={() => setBorderIdx(i)}
                      className={`py-2.5 px-3 rounded-xl font-bold text-[12px] border transition-all ${
                        borderIdx === i ? 'gold-solid text-black border-transparent shadow-md' : 'bg-[#16120D] text-[#8A7D67] border-white/5 hover:text-white'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-3">Internal Obsidian Frosted Box</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {TEXT_BG.map((tb, i) => (
                    <button
                      key={tb.id}
                      onClick={() => setTextBgIdx(i)}
                      className={`py-2.5 px-3 rounded-xl font-bold text-[12px] border transition-all ${
                        textBgIdx === i ? 'gold-solid text-black border-transparent shadow-md' : 'bg-[#16120D] text-[#8A7D67] border-white/5 hover:text-white'
                      }`}
                    >
                      {tb.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-2">Border Radius Architecture: {borderRadius}px</label>
                <input
                  type="range"
                  min={12}
                  max={44}
                  value={borderRadius}
                  onChange={(e) => setBorderRadius(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4A853]"
                />
              </div>
            </motion.div>
          )}

          {/* 3. MEDIA TAB */}
          {tab === 'image' && (
            <motion.div key="image" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-2">Discord CDN Image Engine</label>
                <p className="text-[12px] text-[#8A7D67] mb-4">
                  Upload an image file directly to the Discord CDN to suspend behind your Nudge card content.
                </p>

                {imageUrl ? (
                  <div className="relative rounded-3xl overflow-hidden border-2 border-[#D4A853]/40 bg-[#16120D] shadow-2xl flex items-center justify-center p-2" style={{ aspectRatio: '4/5', maxHeight: 440 }}>
                    <img src={imageUrl} alt="" className="w-full h-full object-contain" style={{ objectFit: 'contain', objectPosition: 'center' }} />
                    <button onClick={() => setImageUrl('')} className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold flex items-center justify-center shadow-lg backdrop-blur-md z-20">
                      ✕
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-3xl border-3 border-dashed border-[#D4A853]/30 hover:border-[#D4A853] bg-[#16120D]/60 hover:bg-[#16120D] flex flex-col items-center justify-center gap-3 cursor-pointer transition-all group p-6 text-center"
                    style={{ minHeight: 260 }}
                  >
                    {uploadingImg ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-4 border-[#D4A853] border-t-transparent rounded-full animate-spin" />
                        <span className="text-[14px] font-extrabold gold-text">Uploading to Discord CDN...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-[#D4A853]/10 border border-[#D4A853]/20 flex items-center justify-center text-[#EFC878] text-[28px] group-hover:scale-110 transition-transform">
                          ☁️
                        </div>
                        <div>
                          <span className="text-[15px] font-extrabold text-white block">Tap to upload or drag & drop</span>
                          <span className="text-[12px] text-[#8A7D67] mt-1 block">Exclusively hosted on Discord edge node cluster</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImagePick} />
              </div>

              {imageUrl && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                  <div>
                    <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-2">Image Opacity: {imageOpacity}</label>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={imageOpacity}
                      onChange={(e) => setImageOpacity(Number(e.target.value))}
                      className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4A853]"
                    />
                  </div>
                  <div>
                    <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-2">CSS Blend Architecture</label>
                    <div className="flex flex-wrap gap-2">
                      {['normal', 'overlay', 'screen', 'soft-light', 'luminosity'].map((b) => (
                        <button
                          key={b}
                          onClick={() => setImageBlend(b)}
                          className={`py-1.5 px-3 rounded-xl font-bold text-[12px] uppercase border ${imageBlend === b ? 'gold-solid text-black border-transparent' : 'bg-[#16120D] text-[#8A7D67] border-white/5'}`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* 4. EXPIRATION TAB */}
          {tab === 'expiry' && (
            <motion.div key="expiry" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <label className="text-[13px] font-extrabold text-[#F3EADB] uppercase tracking-wider block mb-3">Direct Card Lifetime Engine</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setNeverExpire(false); setExpiryDays(1); setExpiryHours(0); }}
                    className={`p-4 rounded-2xl border flex items-center justify-between font-bold transition-all ${!neverExpire && expiryDays === 1 && expiryHours === 0 ? 'gold-solid text-black border-transparent shadow-lg scale-[1.02]' : 'bg-[#16120D] text-[#C9BCA6] border-white/5 hover:border-white/20'}`}
                  >
                    <span>⚡ 24 Hours</span>
                    {(!neverExpire && expiryDays === 1 && expiryHours === 0) && <span className="text-[16px]">✓</span>}
                  </button>
                  <button
                    onClick={() => { setNeverExpire(false); setExpiryDays(7); setExpiryHours(0); }}
                    className={`p-4 rounded-2xl border flex items-center justify-between font-bold transition-all ${!neverExpire && expiryDays === 7 && expiryHours === 0 ? 'gold-solid text-black border-transparent shadow-lg scale-[1.02]' : 'bg-[#16120D] text-[#C9BCA6] border-white/5 hover:border-white/20'}`}
                  >
                    <span>📅 7 Days</span>
                    {(!neverExpire && expiryDays === 7 && expiryHours === 0) && <span className="text-[16px]">✓</span>}
                  </button>
                  <button
                    onClick={() => { setNeverExpire(false); setExpiryDays(30); setExpiryHours(0); }}
                    className={`p-4 rounded-2xl border flex items-center justify-between font-bold transition-all ${!neverExpire && expiryDays === 30 && expiryHours === 0 ? 'gold-solid text-black border-transparent shadow-lg scale-[1.02]' : 'bg-[#16120D] text-[#C9BCA6] border-white/5 hover:border-white/20'}`}
                  >
                    <span>🌕 30 Days</span>
                    {(!neverExpire && expiryDays === 30 && expiryHours === 0) && <span className="text-[16px]">✓</span>}
                  </button>
                  <button
                    onClick={() => setNeverExpire(true)}
                    className={`p-4 rounded-2xl border flex items-center justify-between font-bold transition-all ${neverExpire ? 'gold-solid text-black border-transparent shadow-lg scale-[1.02]' : 'bg-[#16120D] text-[#C9BCA6] border-white/5 hover:border-white/20'}`}
                  >
                    <span>💎 Never Expire</span>
                    {neverExpire && <span className="text-[16px]">✓</span>}
                  </button>
                </div>
              </div>

              {!neverExpire && (
                <div className="p-6 rounded-3xl bg-[#16120D] border border-[#D4A853]/20 space-y-5">
                  <h3 className="text-[14px] font-extrabold gold-text">Interactive Precise Timer Calibration</h3>
                  <div>
                    <label className="text-[12px] font-bold text-[#8A7D67] uppercase block mb-2">Days Forward: {expiryDays} Days</label>
                    <input type="range" min={0} max={60} value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4A853]" />
                  </div>
                  <div>
                    <label className="text-[12px] font-bold text-[#8A7D67] uppercase block mb-2">Hours Forward: {expiryHours} Hours</label>
                    <input type="range" min={0} max={23} value={expiryHours} onChange={(e) => setExpiryHours(Number(e.target.value))} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D4A853]" />
                  </div>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Action Send Footer ── */}
      <div className="px-5 pb-6 pt-3 bg-[#13100B] border-t border-white/5 flex items-center gap-3 flex-shrink-0">
        {sent ? (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full h-14 rounded-2xl bg-green-500/20 border-2 border-green-500 text-green-400 font-extrabold text-[15px] flex items-center justify-center gap-2">
            <span>✓</span> Direct Immersive Nudge Dispatched!
          </motion.div>
        ) : (
          <motion.button
            onClick={handleSend}
            disabled={sending || (!text.trim() && !imageUrl)}
            whileTap={{ scale: 0.97 }}
            className="w-full h-14 rounded-2xl gold-solid hero-glow tappable text-black font-extrabold text-[16px] tracking-tight flex items-center justify-center gap-2.5 shadow-2xl"
            style={{ opacity: sending || (!text.trim() && !imageUrl) ? 0.4 : 1, textShadow: '0 1px 0 rgba(255,243,214,0.6)' }}
          >
            {sending ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
                <span>Transmitting end-to-end encrypted card...</span>
              </div>
            ) : (
              <>
                <span style={{ fontSize: 20 }}>✨</span>
                <span>Send Direct Nudge</span>
              </>
            )}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
