import { memo, useEffect, useRef, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  animate,
} from "framer-motion";

/**
 * ════════════════════════════════════════════════════════════════
 *  GLIMMER — LIVING LIQUID GLASS
 *  ────────────────────────────────────────────────────────────────
 *  A premium, physically-simulated liquid glass object.
 *  Uses dynamic mathematically-generated SVG clip-paths to simulate
 *  flawless surface tension and viscosity without any SVG filter
 *  artifacts.
 * ════════════════════════════════════════════════════════════════ */

const R = 24; // Orb radius
const PEEK = 4; // Visible width when resting
const REST_X = R - PEEK; // Center X at rest (20px offscreen right)
const MAX_STRETCH = 110; // Max bridge stretch before snap
const OPEN_THRESHOLD = 85;

/* ── Premium Flagship Glimmer Logo ── */
export const GlimmerIcon = memo(function GlimmerIcon({ size = R * 2 }: { size?: number }) {
  return (
    <div
      className="relative rounded-full overflow-hidden"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(145deg, #1c150c 0%, #050402 100%)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {/* Deep inner glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,rgba(212,168,83,0.5),transparent_65%)] mix-blend-screen" />
      
      {/* Crystal facet geometry */}
      <svg className="absolute inset-0 w-full h-full opacity-40 mix-blend-overlay" viewBox="0 0 100 100">
        <path d="M 50 5 L 95 50 L 50 95 L 5 50 Z" stroke="url(#gl-gold)" strokeWidth="2" fill="none" />
        <path d="M 25 25 L 75 75 M 25 75 L 75 25" stroke="white" strokeWidth="1" />
        <circle cx="50" cy="50" r="22" stroke="url(#gl-gold)" strokeWidth="1.5" fill="none" />
        <defs>
          <linearGradient id="gl-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFF" />
            <stop offset="50%" stopColor="#D4A853" />
            <stop offset="100%" stopColor="#FFF" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Central luminous core */}
      <motion.div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white blur-[8px] mix-blend-overlay"
        animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Heavy glass reflections */}
      <div className="absolute inset-0 rounded-full shadow-[inset_0_3px_10px_rgba(255,255,255,0.7),inset_0_-8px_20px_rgba(0,0,0,0.9)]" />
      
      {/* Crisp specular highlight */}
      <div className="absolute top-[8%] left-[15%] w-[35%] h-[18%] rounded-full bg-gradient-to-b from-white to-white/0 rotate-[-25deg] blur-[0.5px]" />
    </div>
  );
});

/* ── Dynamic Mathematical Liquid Bridge Path ── */
function getBridgePath(orbX: number) {
  // Orb is at X = orbX (orbX is positive when resting offscreen, goes negative when pulled into screen)
  // Screen edge is at X = 0.
  // Bridge div width is W. Right side of div is X=W (screen edge). Left side is X=0 (orb attachment).
  const ox = orbX + R * 0.45; // Right hemisphere attachment point
  if (ox >= 0) return `M 0,0 Z`; // Orb overlaps edge, no bridge
  
  const stretch = -ox;
  if (stretch >= MAX_STRETCH) return `M 0,0 Z`; // Snapped
  
  const W = stretch;
  const cy = R;
  const t = stretch / MAX_STRETCH; // 0 to 1
  
  // Waist thickness shrinks exponentially as it stretches
  const waist = R * (1 - Math.pow(t, 1.6));
  // Wall anchors squeeze slightly
  const wallY = R * (1 - Math.pow(t, 2) * 0.25);
  // Orb anchors
  const oy = R * 0.88;
  
  const cpWallX = W - stretch * 0.15;
  const cpOrbX = stretch * 0.2; // From left side
  
  return `M ${W},${cy - wallY} C ${cpWallX},${cy - waist} ${cpOrbX},${cy - waist} 0,${cy - oy} L 0,${cy + oy} C ${cpOrbX},${cy + waist} ${cpWallX},${cy + waist} ${W},${cy + wallY} Z`;
}

interface Props {
  onOpen: () => void;
  hidden?: boolean;
  bottomOffset?: number;
}

export const GlimmerLiquidEdge = memo(function GlimmerLiquidEdge({
  onOpen,
  hidden = false,
  bottomOffset = 150,
}: Props) {
  // Pull distance. 0 = rest. Positive = pulled left into screen.
  const rawPull = useMotionValue(0);
  const springPull = useSpring(rawPull, { stiffness: 450, damping: 28, mass: 0.8 });
  
  // Orb X position: at rest it's REST_X (offscreen right). Pulled left makes it smaller/negative.
  const orbX = useTransform(springPull, p => REST_X - p);
  
  // Bridge path dynamically calculates perfect liquid curves
  const bridgePathString = useTransform(orbX, getBridgePath);
  const clipPath = useMotionTemplate`path('${bridgePathString}')`;
  
  // Bridge width matches exact stretch distance
  const bridgeWidth = useTransform(orbX, x => {
    const ox = x + R * 0.45;
    return ox < 0 && -ox < MAX_STRETCH ? -ox : 0;
  });

  // Physical surface tension deformation on the orb
  const scaleX = useTransform(springPull, p => {
    const ox = REST_X - p + R * 0.45;
    if (-ox >= MAX_STRETCH) return 1; // Snaps back to perfect sphere instantly
    return 1 + (p / MAX_STRETCH) * 0.15;
  });
  const scaleY = useTransform(springPull, p => {
    const ox = REST_X - p + R * 0.45;
    if (-ox >= MAX_STRETCH) return 1;
    return 1 - (p / MAX_STRETCH) * 0.1;
  });

  const startX = useRef(0);
  const dragging = useRef(false);

  const onDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    startX.current = e.clientX + rawPull.get();
    // Instant surface tension bump
    if (rawPull.get() < 5) animate(rawPull, 12, { type: "spring", stiffness: 600, damping: 15 });
  }, [rawPull]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = startX.current - e.clientX;
    const p = Math.max(0, delta);
    // Rubber band resistance
    rawPull.set(p > OPEN_THRESHOLD ? OPEN_THRESHOLD + (p - OPEN_THRESHOLD) * 0.35 : p);
  }, [rawPull]);

  const onUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const p = rawPull.get();
    
    if (p >= OPEN_THRESHOLD * 0.6) {
      // Snap fully out, breaking the bridge
      animate(rawPull, OPEN_THRESHOLD + 60, {
        type: "spring", stiffness: 300, damping: 22,
        onComplete: () => {
          onOpen();
          rawPull.set(0);
        }
      });
    } else {
      // Elastic rebound
      animate(rawPull, 0, { type: "spring", stiffness: 450, damping: 20, mass: 0.8 });
    }
  }, [rawPull, onOpen]);

  // Click handler for quick taps
  const onClick = useCallback(() => {
    if (rawPull.get() > 5) return; // was dragged
    animate(rawPull, OPEN_THRESHOLD + 60, {
      type: "spring", stiffness: 300, damping: 22,
      onComplete: () => { onOpen(); rawPull.set(0); }
    });
  }, [rawPull, onOpen]);

  useEffect(() => { if (hidden) rawPull.set(0); }, [hidden, rawPull]);

  if (hidden) return null;

  return (
    <>
      {/* ── Liquid Bridge (Mathematically drawn CSS clip-path) ── */}
      <motion.div
        className="absolute right-0 pointer-events-none gpu"
        style={{
          bottom: bottomOffset,
          width: bridgeWidth,
          height: R * 2,
          clipPath,
          // Premium glass material
          background: "linear-gradient(90deg, rgba(255,255,255,0.45) 0%, rgba(212,168,83,0.15) 100%)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          zIndex: 79,
        }}
      >
        <div className="absolute inset-0 shadow-[inset_-3px_0_12px_rgba(255,255,255,0.4)]" />
      </motion.div>

      {/* ── Invisible Touch Target (Larger than the sliver) ── */}
      <div
        className="absolute right-0 cursor-grab active:cursor-grabbing z-[81]"
        style={{ bottom: bottomOffset - 12, width: 48, height: R * 2 + 24, touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={onClick}
      />

      {/* ── Glimmer Orb ── */}
      <motion.div
        className="absolute right-0 pointer-events-none gpu"
        style={{
          bottom: bottomOffset,
          marginRight: useTransform(orbX, x => -x),
          width: R * 2,
          height: R * 2,
          scaleX,
          scaleY,
          transformOrigin: "right center",
          zIndex: 80,
        }}
      >
        <GlimmerIcon size={R * 2} />
      </motion.div>
    </>
  );
});
