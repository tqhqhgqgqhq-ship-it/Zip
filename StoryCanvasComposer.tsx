import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { publishSocialNudge, type SocialNudge } from '../lib/turso';
import { uploadImageFile } from '../lib/jscord-upload';
import { PREMIUM_FONTS } from './PremiumNudgesSystem';

/* ════════════════════════════════════════════════════════════════
   DATA CONTRACTS
   ════════════════════════════════════════════════════════════════ */
export type CanvasTextLayer = {
  id: string; text: string;
  fontId: string; fontSize: number; fontWeight: number;
  textColor: string; textBgColor: string; textBgOpacity: number;
  textBgRadius: number; textBgPadding: number;
  textShadow: string; textAlign: 'left' | 'center' | 'right';
  x: number; y: number; scale: number; rotate: number;
  opacity: number; letterSpacing: number;
};
export type StoryPayload = { version: 'story_v3'; bgImage?: string; bgColor: string; layers: CanvasTextLayer[] };

function shadowCSS(id: string): string {
  if (id === 'soft') return '0 3px 14px rgba(0,0,0,0.55)';
  if (id === 'hard') return '2px 3px 0 rgba(0,0,0,0.6)';
  if (id === 'glow') return '0 0 14px rgba(239,200,120,0.6), 0 0 4px rgba(255,241,204,0.7)';
  return 'none';
}

/* ════════════════════════════════════════════════════════════════
   UNIVERSAL STORY CARD — kept for backwards compatibility
   ════════════════════════════════════════════════════════════════ */
export function UniversalStoryCard({ nudgeText, compact, className }: { nudgeText: string; compact?: boolean; className?: string }) {
  const payload = useMemo(() => {
    if (!nudgeText) return null;
    try {
      if (nudgeText.startsWith('[story_v3]')) return JSON.parse(nudgeText.slice(10)) as StoryPayload;
      if (nudgeText.startsWith('[story_v2]')) return JSON.parse(nudgeText.slice(10)) as any;
      if (nudgeText.startsWith('[story_v1]')) return JSON.parse(nudgeText.slice(10)) as any;
    } catch {}
    return null;
  }, [nudgeText]);

  if (!payload) return <div className={`rounded-2xl select-none ${className || ''}`} style={{ minHeight: compact ? 200 : 300, background: '#0B0907' }} />;
  const { bgColor, bgImage, layers } = payload;
  const h = compact ? 200 : 500;
  return (
    <div className={`relative overflow-hidden select-none ${className || ''}`} style={{ background: bgImage ? '#000' : (bgColor || '#0B0907'), minHeight: h, width: '100%' }}>
      {bgImage && <img src={bgImage} alt="" loading="lazy" draggable={false} className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{ objectFit: 'contain', objectPosition: 'center' }} />}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {(layers || []).map((l: any) => {
          const f = PREMIUM_FONTS.find(x => x.id === l.fontId) || PREMIUM_FONTS[0];
          const cs = compact ? 0.55 : 1;
          return (
            <div key={l.id} className="absolute" style={{ transform: `translate(${l.x * cs}px, ${l.y * cs}px) scale(${l.scale * cs}) rotate(${l.rotate}deg)` }}>
              <div style={{ background: l.textBgColor, borderRadius: `${l.textBgRadius}px`, padding: `${l.textBgPadding}px`, textShadow: shadowCSS(l.textShadow) }}>
                <p className="whitespace-pre-wrap break-words text-center" style={{ fontFamily: f.family, fontSize: `${l.fontSize}px`, fontWeight: l.fontWeight, color: l.textColor, letterSpacing: `${l.letterSpacing}px`, maxWidth: compact ? '200px' : '82vw' }}>{l.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   NUDGE STUDIO
   The composer, rebuilt around a single principle:
   "Hide everything. Reveal one thing at a time."
   ════════════════════════════════════════════════════════════════ */

export function StoryCanvasComposer({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const { user } = useAuth();

  /* ─── State ─── */
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [layers, setLayers] = useState<CanvasTextLayer[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);

  /* ─── Refs ─── */
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* ─── Derived ─── */
  const sel = useMemo(() => layers.find(l => l.id === selId) || null, [layers, selId]);
  const isEmpty = layers.length === 0 && !bgImage;

  const patch = useCallback((id: string, p: Partial<CanvasTextLayer>) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...p } : l));
  }, []);

  /* ─── Add Text — center, spawn animation, instantly selected ─── */
  const addText = useCallback(() => {
    const id = 'l' + Date.now().toString(36);
    setLayers(prev => [...prev, {
      id, text: 'New Text', fontId: 'jakarta', fontSize: 38, fontWeight: 700,
      textColor: '#F3EADB', textBgColor: 'transparent', textBgOpacity: 0.7,
      textBgRadius: 14, textBgPadding: 14, textShadow: 'soft', textAlign: 'center',
      x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, letterSpacing: 0,
    }]);
    requestAnimationFrame(() => setSelId(id));
  }, []);

  /* ─── Image attach ─── */
  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { const r = await uploadImageFile(file); if (r.success && r.url) setBgImage(r.url); }
    catch (err) { console.error(err); }
    finally { setUploading(false); }
  };

  /* ─── Publish ─── */
  const handlePublish = async () => {
    if (!user || isEmpty) return;
    setPublishing(true);
    try {
      const payload: StoryPayload = { version: 'story_v3', bgImage: bgImage || undefined, bgColor: '#0B0907', layers };
      const nudge: SocialNudge = {
        id: 'nudge-' + Date.now(), userId: user.uid, userName: user.name || 'User', userAvatar: user.photoURL || '',
        text: `[story_v3]${JSON.stringify(payload)}`, fontId: 'jakarta', fontSize: 26, fontWeight: 700,
        textColor: '#F3EADB', bgColor: '#0B0907', gradientBg: 'none', borderStyle: 'none', borderRadius: 0,
        textShadow: 'none', textAlign: 'center', glassmorphism: 0, layoutStyle: 'full',
        imageUrl: bgImage || undefined, createdAt: Date.now(), updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      };
      await publishSocialNudge(nudge);
      setDone(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1700);
    } catch (err) { console.error(err); setPublishing(false); }
  };

  /* ─── Subtle parallax (canvas breathes) ─── */
  const px = useMotionValue(0); const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 35, damping: 22, mass: 1 });
  const sy = useSpring(py, { stiffness: 35, damping: 22, mass: 1 });
  const bgX = useTransform(sx, v => v * -5);
  const bgY = useTransform(sy, v => v * -5);
  const auroraAX = useTransform(sx, v => v * -10);
  const auroraAY = useTransform(sy, v => v * -10);
  const auroraBX = useTransform(sx, v => v * 8);
  const auroraBY = useTransform(sy, v => v * 8);
  const onParallax = useCallback((e: React.PointerEvent) => {
    if (!rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  }, [px, py]);

  /* ─── Two-finger pinch & rotate ─── */
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ dist: number; angle: number; scale: number; rotate: number; id: string } | null>(null);
  const onPtrDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setSelId(id);
    if (ptrs.current.size === 2) {
      const [a, b] = Array.from(ptrs.current.values());
      const dx = b.x - a.x, dy = b.y - a.y;
      const l = layers.find(x => x.id === id);
      if (l) gesture.current = { dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) * 180 / Math.PI, scale: l.scale, rotate: l.rotate, id };
    }
  };
  const onPtrMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && gesture.current) {
      const [a, b] = Array.from(ptrs.current.values());
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      patch(gesture.current.id, {
        scale: Math.max(0.35, Math.min(5, gesture.current.scale * (dist / gesture.current.dist))),
        rotate: gesture.current.rotate + (angle - gesture.current.angle),
      });
    }
  };
  const onPtrUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) gesture.current = null;
  };

  /* ─── Snap guides ─── */
  const [snapH, setSnapH] = useState(false);
  const [snapV, setSnapV] = useState(false);
  const onDrag = useCallback((id: string, dx: number, dy: number) => {
    const l = layers.find(x => x.id === id);
    if (!l) return;
    let nx = l.x + dx, ny = l.y + dy;
    const inV = Math.abs(nx) < 9;
    const inH = Math.abs(ny) < 9;
    setSnapV(inV); setSnapH(inH);
    if (inV) nx = 0;
    if (inH) ny = 0;
    patch(id, { x: nx, y: ny });
  }, [layers, patch]);

  /* ─── Idle ESC closes selection; Backspace deletes ─── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={rootRef}
      onPointerMove={onParallax}
      onPointerLeave={() => { px.set(0); py.set(0); }}
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden studio-enter"
      style={{ background: '#0B0907' }}
    >
      {/* ══════ ATMOSPHERE LAYER ══════ */}
      {/* Slow drifting aurora — gives the empty canvas felt depth */}
      <motion.div className="absolute inset-0 pointer-events-none studio-aurora-a" style={{ x: auroraAX, y: auroraAY }} />
      <motion.div className="absolute inset-0 pointer-events-none studio-aurora-b" style={{ x: auroraBX, y: auroraBY }} />
      {/* Premium vignette + grain (felt-not-seen) */}
      <div className="absolute inset-0 studio-vignette" />
      <div className="absolute inset-0 studio-grain" />

      {/* ══════ CANVAS ══════ */}
      <div
        className="flex-1 relative overflow-hidden"
        onClick={() => setSelId(null)}
      >
        {/* Background image — fully locked to canvas */}
        <AnimatePresence>
          {bgImage && (
            <motion.div
              key="bg"
              initial={{ opacity: 0, scale: 1.08, filter: 'blur(24px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              style={{ x: bgX, y: bgY, position: 'absolute', inset: 0, overflow: 'hidden' }}
            >
              <img
                src={bgImage}
                alt=""
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload overlay */}
        <AnimatePresence>
          {uploading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(5,4,3,0.55)', backdropFilter: 'blur(14px)' }}>
              <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-4">
                <div className="relative w-12 h-12">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="absolute inset-0 rounded-full border-2 border-[#D4A853]/25 border-t-[#EFC878]" />
                </div>
                <span className="text-[10px] font-bold text-[#6E6353] uppercase tracking-[0.32em]">Loading</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Snap guides — soft gold beams */}
        <AnimatePresence>
          {snapV && (
            <motion.div
              initial={{ opacity: 0, scaleY: 0.6 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0.6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 left-1/2 w-px z-30 pointer-events-none origin-center"
              style={{ background: 'linear-gradient(to bottom, transparent 0%, rgba(239,200,120,0.55) 30%, rgba(239,200,120,0.55) 70%, transparent 100%)', boxShadow: '0 0 10px rgba(239,200,120,0.35)' }}
            />
          )}
          {snapH && (
            <motion.div
              initial={{ opacity: 0, scaleX: 0.6 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, scaleX: 0.6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-0 top-1/2 h-px z-30 pointer-events-none origin-center"
              style={{ background: 'linear-gradient(to right, transparent 0%, rgba(239,200,120,0.55) 30%, rgba(239,200,120,0.55) 70%, transparent 100%)', boxShadow: '0 0 10px rgba(239,200,120,0.35)' }}
            />
          )}
        </AnimatePresence>

        {/* Text layers */}
        <div className="absolute inset-0 flex items-center justify-center">
          {layers.map(layer => {
            const isSel = selId === layer.id;
            const font = PREMIUM_FONTS.find(f => f.id === layer.fontId) || PREMIUM_FONTS[0];
            return (
              <motion.div
                key={layer.id}
                drag={isSel}
                dragMomentum={false}
                dragElastic={0.06}
                onDrag={(_, info) => onDrag(layer.id, info.delta.x, info.delta.y)}
                onDragEnd={() => { setSnapH(false); setSnapV(false); }}
                onPointerDown={(e) => onPtrDown(e, layer.id)}
                onPointerMove={onPtrMove}
                onPointerUp={onPtrUp}
                onPointerCancel={onPtrUp}
                onClick={(e) => { e.stopPropagation(); setSelId(layer.id); }}
                animate={{
                  x: layer.x, y: layer.y, scale: layer.scale, rotate: layer.rotate, opacity: layer.opacity,
                  transition: { type: 'spring', stiffness: 360, damping: 32, mass: 0.6 },
                }}
                className="absolute touch-none cursor-pointer select-none"
                style={{ zIndex: isSel ? 50 : 10 }}
              >
                {/* Selection envelope (marching ant ring + corner nodes) */}
                <AnimatePresence>
                  {isSel && (
                    <motion.svg
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute pointer-events-none"
                      style={{ inset: -14, width: 'calc(100% + 28px)', height: 'calc(100% + 28px)' }}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <rect
                        x="0.6" y="0.6" width="98.8" height="98.8" rx="2" ry="2"
                        fill="none"
                        stroke="rgba(239,200,120,0.7)"
                        strokeWidth="0.45"
                        strokeDasharray="2 1.2"
                        vectorEffect="non-scaling-stroke"
                        style={{ animation: 'studio-march 2.4s linear infinite' }}
                      />
                    </motion.svg>
                  )}
                </AnimatePresence>

                {/* Text body */}
                <div
                  className={isSel ? '' : ''}
                  style={{
                    background: layer.textBgColor === 'transparent' ? 'transparent' : layer.textBgColor,
                    opacity: layer.textBgColor === 'transparent' ? 1 : layer.textBgOpacity,
                    borderRadius: `${layer.textBgRadius}px`,
                    padding: `${layer.textBgPadding}px`,
                    textShadow: shadowCSS(layer.textShadow),
                    transition: 'background 0.25s ease, opacity 0.25s ease, border-radius 0.2s ease, padding 0.2s ease',
                  }}
                >
                  <p
                    className="whitespace-pre-wrap break-words text-center studio-text-spawn"
                    style={{
                      fontFamily: font.family,
                      fontSize: `${layer.fontSize}px`,
                      fontWeight: layer.fontWeight,
                      color: layer.textColor,
                      letterSpacing: `${layer.letterSpacing}px`,
                      maxWidth: '80vw',
                      opacity: layer.textBgColor === 'transparent' ? layer.opacity : 1,
                      transition: 'font-family 0.3s ease, font-size 0.2s ease, color 0.2s ease, font-weight 0.2s ease, letter-spacing 0.2s ease',
                    }}
                  >
                    {layer.text}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Whisper for the empty state */}
        <AnimatePresence>
          {isEmpty && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.55, duration: 0.6 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="flex items-center gap-0.5">
                <span className="text-[28px] font-light tracking-[-0.02em] text-[#3D3833] display">Compose something</span>
                <span className="inline-block w-[2px] h-[26px] bg-[#D4A853]/70 ml-1 studio-caret" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══════ TOP CHROME ══════ */}
      <div className="absolute top-0 inset-x-0 z-[210] px-5 pt-5 flex items-center justify-between pointer-events-none">
        <motion.button
          initial={{ opacity: 0, y: -6, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.18, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          onClick={onClose}
          aria-label="Close"
          className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center text-[#9B8F7C] hover:text-[#EFC878] transition-colors"
          style={{ background: 'rgba(11,9,7,0.6)', border: '1px solid rgba(214,178,110,0.16)', backdropFilter: 'blur(22px)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </motion.button>
      </div>

      {/* ══════ BOTTOM DOCK — always visible while in studio ══════ */}
      <AnimatePresence>
        {(!uploading && !done) && (
          <motion.div
            key="dock"
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30, mass: 0.7 }}
            className="absolute bottom-0 inset-x-0 z-[212] pb-6 pt-10 px-6 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(11,9,7,0.5) 30%, rgba(11,9,7,0.9) 100%)' }}
          >
            <div className="relative flex items-center justify-between max-w-[340px] mx-auto pointer-events-auto">
              {/* LEFT — Image */}
              <DockButton onClick={() => fileRef.current?.click()} label="Image">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
                  <path d="m21 16-5-5L5 21" />
                </svg>
              </DockButton>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />

              {/* CENTER — Text (the hero) */}
              <motion.button
                onClick={addText}
                whileTap={{ scale: 0.9 }}
                whileHover={{ y: -3 }}
                className="relative flex flex-col items-center gap-1 -mt-2"
              >
                {/* Soft halo */}
                <span className="absolute -inset-3 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(239,200,120,0.25) 0%, transparent 65%)' }} />
                <div
                  className="relative w-[58px] h-[58px] rounded-full flex items-center justify-center studio-pulse"
                  style={{
                    background: 'linear-gradient(170deg, #FFF1CC 0%, #F7D185 20%, #E3B25D 42%, #C9913B 62%, #A87527 82%, #885D1C 100%)',
                    border: '3px solid #0B0907',
                  }}
                >
                  {/* inner highlight */}
                  <span className="absolute top-0.5 inset-x-1.5 h-[38%] rounded-full pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,250,235,0.65) 0%, rgba(255,250,235,0) 100%)', borderRadius: '50% 50% 45% 45%' }} />
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A1206" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="relative">
                    <path d="M5 7V4h14v3" />
                    <path d="M9 20h6" />
                    <path d="M12 4v16" />
                  </svg>
                </div>
                <span className="text-[8px] font-bold uppercase tracking-[0.28em] text-[#5C5247]">Text</span>
              </motion.button>

              {/* RIGHT — Publish (this is the one that was missing!) */}
              <PublishButton onClick={handlePublish} disabled={isEmpty || publishing} publishing={publishing} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════ TEXT TOOLBAR ══════ */}
      <AnimatePresence>
        {sel && (
          <StudioTextToolbar
            layer={sel}
            patch={patch}
            onDelete={() => { setLayers(prev => prev.filter(l => l.id !== sel.id)); setSelId(null); }}
            onDeselect={() => setSelId(null)}
          />
        )}
      </AnimatePresence>

      {/* ══════ PUBLISH SUCCESS ══════ */}
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[300] flex flex-col items-center justify-center" style={{ background: 'rgba(5,4,3,0.92)', backdropFilter: 'blur(22px)' }}>
            <motion.div
              initial={{ scale: 0.4 }}
              animate={{ scale: [0.4, 1.12, 1] }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="w-[68px] h-[68px] rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(170deg, #FFF1CC 0%, #F7D185 20%, #E3B25D 42%, #C9913B 62%, #A87527 82%, #885D1C 100%)',
                boxShadow: '0 0 30px rgba(222,178,95,0.55), 0 6px 24px rgba(0,0,0,0.6), 0 1.5px 0.5px rgba(255,243,214,0.5) inset',
              }}
            >
              <motion.svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1A1206" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <motion.path d="M20 6 9 17l-5-5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.35, ease: [0.22, 1, 0.36, 1] }} />
              </motion.svg>
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-5 text-[11px] font-bold uppercase tracking-[0.32em] gold-text">Live</motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   DOCK BUTTON — left/right of the hero
   ════════════════════════════════════════════════════════════════ */
function DockButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.92 }} whileHover={{ y: -2 }} className="flex flex-col items-center gap-1.5">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-[#C9BCA6]"
        style={{
          background: 'linear-gradient(178deg, #1B1814 0%, #14110D 55%, #0F0D0A 100%)',
          boxShadow: '0 1px 0 rgba(255,235,190,0.07) inset, 0 -1px 0 rgba(0,0,0,0.55) inset, 0 3px 10px rgba(0,0,0,0.35)',
          border: '1px solid rgba(214,178,110,0.14)',
        }}
      >
        {children}
      </div>
      <span className="text-[8.5px] font-bold uppercase tracking-[0.3em] text-[#5C5247]">{label}</span>
    </motion.button>
  );
}

function PublishButton({ onClick, disabled, publishing }: { onClick: () => void; disabled: boolean; publishing: boolean }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.92 }}
      whileHover={!disabled ? { y: -2 } : undefined}
      className="flex flex-col items-center gap-1.5"
      style={{ opacity: disabled ? 0.3 : 1, transition: 'opacity 0.3s ease' }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-[#EFC878]"
        style={{
          background: 'linear-gradient(178deg, #1B1814 0%, #14110D 55%, #0F0D0A 100%)',
          boxShadow: '0 1px 0 rgba(255,235,190,0.07) inset, 0 -1px 0 rgba(0,0,0,0.55) inset, 0 3px 10px rgba(0,0,0,0.35)',
          border: '1px solid rgba(214,178,110,0.22)',
        }}
      >
        {publishing ? (
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} className="w-4 h-4 rounded-full border-2 border-[#EFC878]/30 border-t-[#EFC878]" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        )}
      </div>
      <span className="text-[8.5px] font-bold uppercase tracking-[0.3em] text-[#5C5247]">Send</span>
    </motion.button>
  );
}

/* ════════════════════════════════════════════════════════════════
   STUDIO TEXT TOOLBAR
   ════════════════════════════════════════════════════════════════ */
type ToolKey = 'font' | 'color' | 'bg' | 'shadow';

const SHADOW_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'soft', label: 'Soft' },
  { id: 'hard', label: 'Hard' },
  { id: 'glow', label: 'Glow' },
];

const TEXT_COLORS = ['#F3EADB', '#FFFFFF', '#000000', '#EFC878', '#38BDF8', '#4ADE80', '#F43F5E', '#C084FC', '#FBBF24', '#F97316'];
const BG_COLORS  = ['#000000', '#0B0907', '#1A1814', '#7C2D12', '#1E3A8A', '#7E22CE', '#9F1239', '#0F766E', '#F3EADB', '#EFC878'];

const LUXE_STYLE: React.CSSProperties = {
  background: 'linear-gradient(178deg, #1B1814 0%, #14110D 55%, #0F0D0A 100%)',
  boxShadow: '0 1px 0 rgba(255,235,190,0.07) inset, 0 -1px 0 rgba(0,0,0,0.55) inset, 0 3px 10px rgba(0,0,0,0.35)',
  border: '1px solid rgba(214,178,110,0.14)',
};
const GOLD_STYLE: React.CSSProperties = {
  background: 'linear-gradient(170deg, #FFF1CC 0%, #F7D185 20%, #E3B25D 42%, #C9913B 62%, #A87527 82%, #885D1C 100%)',
  boxShadow: '0 1px 0 rgba(255,248,220,0.7) inset, 0 -2px 4px rgba(90,62,14,0.55) inset, 0 2px 5px rgba(0,0,0,0.55)',
  color: '#1A1206',
};

function StudioTextToolbar({
  layer, patch, onDelete, onDeselect,
}: {
  layer: CanvasTextLayer;
  patch: (id: string, p: Partial<CanvasTextLayer>) => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  const [tool, setTool] = useState<ToolKey | null>(null);
  const [editing, setEditing] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 80);
      return () => clearTimeout(t);
    }
  }, [editing, layer.id]);

  const p = (d: Partial<CanvasTextLayer>) => patch(layer.id, d);

  return (
    <>
      {/* Inline editing sheet — appears when editing is true */}
      <AnimatePresence>
        {editing && (
          <motion.div
            key="edit-sheet"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="absolute bottom-[280px] inset-x-5 z-[230] pointer-events-auto"
          >
            <div className="relative max-w-[420px] mx-auto rounded-3xl px-4 py-3" style={LUXE_STYLE}>
              <textarea
                ref={inputRef}
                value={layer.text}
                onChange={(e) => p({ text: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditing(false); } }}
                rows={1}
                placeholder="Type something…"
                className="w-full bg-transparent text-[15px] font-bold text-[#F3EADB] placeholder-[#5C5247] outline-none resize-none leading-snug pr-12"
                style={{ minHeight: 24, maxHeight: 120 }}
              />
              <button
                onClick={() => setEditing(false)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-[#1A1206]"
                style={GOLD_STYLE}
                aria-label="Done editing"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool panel — only one at a time */}
      <AnimatePresence mode="wait">
        {tool && !editing && (
          <motion.div
            key={`tool-${tool}`}
            initial={{ y: 20, opacity: 0, filter: 'blur(6px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: 14, opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-[220px] inset-x-0 z-[225] pointer-events-auto px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-w-[420px] mx-auto rounded-3xl px-3 py-3" style={LUXE_STYLE}>
              {tool === 'font' && <FontStrip layer={layer} onChange={(fontId) => p({ fontId })} />}
              {tool === 'color' && <SwatchStrip value={layer.textColor} colors={TEXT_COLORS} onChange={(c) => p({ textColor: c })} customLabel="+" onCustom={(c) => p({ textColor: c })} />}
              {tool === 'bg' && (
                <div className="space-y-3">
                  <SwatchStrip
                    value={layer.textBgColor}
                    colors={BG_COLORS}
                    onChange={(c) => p({ textBgColor: c, textBgOpacity: layer.textBgColor === 'transparent' ? 0.7 : layer.textBgOpacity })}
                    extraNoneAction={() => p({ textBgColor: 'transparent' })}
                  />
                  {layer.textBgColor !== 'transparent' && (
                    <div className="grid grid-cols-2 gap-3 px-1">
                      <Slider label="Opacity" value={Math.round(layer.textBgOpacity * 100)} min={10} max={100} onChange={(v) => p({ textBgOpacity: v / 100 })} />
                      <Slider label="Radius"  value={layer.textBgRadius} min={0} max={40} onChange={(v) => p({ textBgRadius: v })} />
                    </div>
                  )}
                </div>
              )}
              {tool === 'shadow' && (
                <div className="flex items-center gap-2 justify-center py-1">
                  {SHADOW_OPTIONS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => p({ textShadow: s.id })}
                      className={`h-10 px-4 rounded-2xl text-[11px] font-bold tracking-wide transition-all ${layer.textShadow === s.id ? 'text-[#1A1206]' : 'text-[#C9BCA6]'}`}
                      style={layer.textShadow === s.id ? GOLD_STYLE : LUXE_STYLE}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool dock — sits above the main dock so both are visible */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="absolute bottom-[110px] inset-x-0 z-[222] px-4 pb-2 pt-2 pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative max-w-[420px] mx-auto pointer-events-auto rounded-full flex items-center gap-1.5 px-2 py-2" style={LUXE_STYLE}>
          <ToolIcon active={editing} onClick={() => { setEditing(true); setTool(null); }} label="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
          </ToolIcon>
          <ToolIcon active={tool === 'font'} onClick={() => { setTool(tool === 'font' ? null : 'font'); setEditing(false); }} label="Font">
            <span className="text-[14px] font-extrabold" style={{ fontFamily: (PREMIUM_FONTS.find(f => f.id === layer.fontId) || PREMIUM_FONTS[0]).family }}>Aa</span>
          </ToolIcon>
          <ToolIcon active={layer.fontWeight >= 700} onClick={() => p({ fontWeight: layer.fontWeight >= 700 ? 400 : 700 })} label="Bold">
            <span className="text-[14px] font-black">B</span>
          </ToolIcon>
          <ToolIcon active={tool === 'color'} onClick={() => { setTool(tool === 'color' ? null : 'color'); setEditing(false); }} label="Color">
            <span className="block w-4 h-4 rounded-full" style={{ background: layer.textColor, border: '1.5px solid rgba(255,255,255,0.4)' }} />
          </ToolIcon>
          <ToolIcon active={tool === 'bg'} onClick={() => { setTool(tool === 'bg' ? null : 'bg'); setEditing(false); }} label="Background">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3" /></svg>
          </ToolIcon>
          <ToolIcon active={tool === 'shadow'} onClick={() => { setTool(tool === 'shadow' ? null : 'shadow'); setEditing(false); }} label="Shadow">
            <span className="text-[13px] font-extrabold" style={{ textShadow: layer.textShadow !== 'none' ? shadowCSS(layer.textShadow).split(',')[0] : 'none' }}>S</span>
          </ToolIcon>
          <span className="w-px h-5 mx-0.5 bg-white/[0.06]" />
          <button
            onClick={onDelete}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#9B8F7C] hover:text-rose-400 transition-colors"
            aria-label="Delete"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
          </button>
          <button
            onClick={onDeselect}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#1A1206]"
            style={GOLD_STYLE}
            aria-label="Done"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
          </button>
        </div>
      </motion.div>
    </>
  );
}

function ToolIcon({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.86 }}
      aria-label={label}
      className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${active ? 'text-[#1A1206]' : 'text-[#C9BCA6] hover:text-[#EFC878]'}`}
      style={active ? GOLD_STYLE : undefined}
    >
      {children}
    </motion.button>
  );
}

function FontStrip({ layer, onChange }: { layer: CanvasTextLayer; onChange: (id: string) => void }) {
  return (
    <div className="overflow-x-auto scroll-x -mx-1 px-1">
      <div className="flex gap-1.5 w-max pb-1">
        {PREMIUM_FONTS.map(f => {
          const active = layer.fontId === f.id;
          return (
            <motion.button
              key={f.id}
              whileTap={{ scale: 0.94 }}
              onClick={() => onChange(f.id)}
              className={`min-w-[88px] h-11 rounded-2xl flex flex-col items-center justify-center px-3 transition-all ${active ? 'text-[#1A1206]' : 'text-[#C9BCA6]'}`}
              style={active ? GOLD_STYLE : LUXE_STYLE}
            >
              <span className="text-[15px] font-bold leading-none" style={{ fontFamily: f.family }}>Aa</span>
              <span className={`text-[8px] font-bold uppercase tracking-[0.18em] mt-1 ${active ? 'text-[#1A1206]/70' : 'text-[#6E6353]'}`}>{f.name}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function SwatchStrip({
  value, colors, onChange, customLabel, onCustom, extraNoneAction,
}: {
  value: string;
  colors: string[];
  onChange: (c: string) => void;
  customLabel?: string;
  onCustom?: (c: string) => void;
  extraNoneAction?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 justify-center flex-wrap py-1 px-1">
      {colors.map(c => {
        const active = value.toUpperCase() === c.toUpperCase();
        return (
          <motion.button
            key={c}
            whileTap={{ scale: 0.86 }}
            onClick={() => onChange(c)}
            className="w-8 h-8 rounded-full transition-transform"
            style={{
              background: c,
              border: active ? '2px solid #EFC878' : '1.5px solid rgba(214,178,110,0.18)',
              transform: active ? 'scale(1.18)' : 'scale(1)',
              boxShadow: active ? '0 0 0 2px rgba(11,9,7,1), 0 0 0 3.5px #EFC878' : undefined,
            }}
          />
        );
      })}
      {onCustom && (
        <label className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer relative overflow-hidden" style={{ ...LUXE_STYLE, borderRadius: '999px' }}>
          <input type="color" defaultValue={value} onChange={(e) => onCustom(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
          <span className="text-[#EFC878] text-[14px] font-bold pointer-events-none">{customLabel || '+'}</span>
        </label>
      )}
      {extraNoneAction && (
        <button onClick={extraNoneAction} className="w-8 h-8 rounded-full flex items-center justify-center" style={LUXE_STYLE} aria-label="Clear">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6E6353" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[8.5px] font-bold uppercase tracking-[0.22em] text-[#6E6353]">{label}</span>
        <span className="text-[10px] font-bold text-[#C9BCA6] tabular-nums">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#D4A853] h-1"
      />
    </div>
  );
}
