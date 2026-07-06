import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import { cn } from "../../utils/cn";

export function NudgelButton({
  children,
  loading,
  disabled,
  variant = "primary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "ghost";
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<{x:number;y:number;id:number}[]>([]);

  const handleMove = (e: React.MouseEvent) => {
    const el = btnRef.current;
    if (!el || loading) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translate3d(${x * 2.5}px, ${y * 1.8}px, 0) perspective(600px) rotateX(${y * -2.2}deg) rotateY(${x * 3.5}deg)`;
    el.style.setProperty("--mx", `${((e.clientX - r.left)/r.width)*100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top)/r.height)*100}%`);
  };
  const handleLeave = () => {
    const el = btnRef.current;
    if (el) el.style.transform = `translate3d(0,0,0) perspective(600px) rotateX(0deg) rotateY(0deg)`;
  };

  const addRipple = (e: React.MouseEvent) => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const id = Date.now() + Math.random();
    setRipples(rs => [...rs, {x,y,id}]);
    setTimeout(()=> setRipples(rs => rs.filter(p=>p.id !== id)), 640);
    (rest as any).onClick?.(e);
  };

  if (variant === "ghost") {
    const { onDrag, onDragStart, onDragEnd, onAnimationStart, onAnimationEnd, ...bp } = rest as any;
    return (
      <button
        ref={btnRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        disabled={disabled || loading}
        className={cn(
          "w-full rounded-[16px] px-5 py-[15.5px] text-[14.6px] font-[600] transition-all text-[#d2cdc5] hover:text-[#f2ece3] border border-white/[0.10] bg-white/[0.023] hover:bg-white/[0.045]",
          disabled && "opacity-60 cursor-not-allowed",
          className
        )}
        {...bp}
      >
        {children}
      </button>
    );
  }

  const { onDrag, onDragStart, onDragEnd, onAnimationStart, onAnimationEnd, ...buttonProps } = rest as any;

  return (
    <motion.button
      ref={btnRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      whileTap={{ scale: 0.985 }}
      animate={loading ? { scale: 0.99 } : { scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      disabled={disabled || loading}
      onClick={addRipple}
      className={cn(
        "relative w-full rounded-[17px] px-5 py-[17px] text-[15.3px] font-[630] tracking-[-0.008em] text-[#efe8dc] focus-ring overflow-hidden",
        "transition-opacity duration-300",
        disabled && !loading && "opacity-65 cursor-not-allowed",
        loading && "cursor-wait",
        className
      )}
      style={{
        background: "linear-gradient(180deg, #28283a 0%, #1a1a28 30%, #0f0f1a 60%, #08080f 100%)",
        boxShadow: `
          inset 0 1px 0 rgba(255,248,230,0.13),
          inset 0 -1.5px 0 rgba(0,0,0,0.95),
          0 2px 4px rgba(0,0,0,0.7),
          0 8px 20px rgba(0,0,0,0.55),
          0 16px 48px rgba(0,0,0,0.4),
          0 0 0 1px rgba(255,235,200,0.08),
          0 24px 50px -8px rgba(200,175,130,0.12),
          0 6px 30px -2px rgba(225,200,155,0.14)
        `,
        border: "1px solid rgba(255,238,210,0.115)",
      }}
      {...buttonProps}
    >
      {/* deep 3D bevel */}
      <span className="absolute inset-0 rounded-[17px] pointer-events-none"
        style={{
          background: "linear-gradient(180deg, rgba(255,245,222,0.14) 0%, rgba(255,240,215,0.04) 18%, transparent 42%, rgba(0,0,0,0.35) 82%, rgba(0,0,0,0.55) 100%)"
        }}
      />

      {/* ════ PREMIUM RAINBOW LOADING GLOW ════
          Liquid-light aurora, bottom-anchored, GPU-accelerated.
          LEFT → RIGHT ONLY — mathematically seamless infinite loop:
          each layer uses a repeating gradient whose period EXACTLY equals
          the translation distance, so the loop reset is invisible.
          A slow hue-rotation makes the palette continuously evolve. */}
      <AnimatePresence>
        {loading && (
          <motion.span
            key="rainbow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-0 h-[36px] pointer-events-none overflow-hidden rounded-b-[17px]"
            style={{
              maskImage: "linear-gradient(to top, black 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.25) 65%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to top, black 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.25) 65%, transparent 100%)",
              // Slow continuous hue evolution — full 360° is perfectly periodic,
              // so colors shift endlessly without any visible loop point.
              animation: "hueEvolve 10s linear infinite",
            }}
          >
            {/* ═══ LAYER 1 — Main rainbow river ═══
                width 400% / translate 0→50% (of self = 200% of button) per cycle.
                repeating gradient period = 50% of self → reset is invisible. */}
            <span
              className="absolute -bottom-[18px] h-[44px] will-change-transform"
              style={{
                width: "400%",
                left: "-300%",
                background: `repeating-linear-gradient(90deg,
                  rgba(255,105,95,0.62)  0%,
                  rgba(255,150,100,0.7)  3.5%,
                  rgba(255,195,95,0.78)  7%,
                  rgba(255,232,115,0.85) 10.5%,
                  rgba(205,255,135,0.8)  14%,
                  rgba(145,255,150,0.72) 17.5%,
                  rgba(105,250,205,0.7)  21%,
                  rgba(90,215,255,0.76)  24.5%,
                  rgba(95,165,255,0.82)  28%,
                  rgba(125,130,255,0.78) 31.5%,
                  rgba(170,110,255,0.72) 35%,
                  rgba(215,100,250,0.74) 38.5%,
                  rgba(250,105,225,0.78) 42%,
                  rgba(255,120,170,0.74) 45.5%,
                  rgba(255,110,120,0.66) 48.5%,
                  rgba(255,105,95,0.62)  50%)`,
                filter: "blur(15px)",
                animation: "liquidFlowLTR 4s linear infinite",
              }}
            />

            {/* ═══ LAYER 2 — Pastel shimmer (faster, gentle sine timing = organic
                speed variation; still strictly left→right) ═══ */}
            <span
              className="absolute -bottom-[14px] h-[32px] will-change-transform"
              style={{
                width: "400%",
                left: "-300%",
                background: `repeating-linear-gradient(90deg,
                  rgba(255,190,160,0.42) 0%,
                  rgba(255,225,150,0.5)  6%,
                  rgba(215,255,175,0.46) 12%,
                  rgba(165,245,235,0.5)  18%,
                  rgba(165,200,255,0.52) 24%,
                  rgba(195,170,255,0.48) 30%,
                  rgba(245,165,245,0.5)  36%,
                  rgba(255,180,200,0.48) 42%,
                  rgba(255,185,165,0.44) 47%,
                  rgba(255,190,160,0.42) 50%)`,
                filter: "blur(19px)",
                animation: "liquidFlowLTR 2.4s cubic-bezier(0.37, 0.02, 0.63, 0.98) infinite",
                opacity: 0.7,
              }}
            />

            {/* ═══ LAYER 3 — Deep undertone (slowest, widest, adds body) ═══ */}
            <span
              className="absolute -bottom-[22px] h-[50px] will-change-transform"
              style={{
                width: "400%",
                left: "-300%",
                background: `repeating-linear-gradient(90deg,
                  rgba(225,135,115,0.36) 0%,
                  rgba(245,185,120,0.42) 7%,
                  rgba(190,230,150,0.38) 14%,
                  rgba(135,205,225,0.42) 21%,
                  rgba(145,150,230,0.4)  28%,
                  rgba(200,125,210,0.42) 35%,
                  rgba(240,145,165,0.4)  42%,
                  rgba(235,150,125,0.37) 47%,
                  rgba(225,135,115,0.36) 50%)`,
                filter: "blur(23px)",
                animation: "liquidFlowLTR 6.5s linear infinite",
                opacity: 0.62,
              }}
            />

            {/* ═══ LAYER 4 — Bright sparkle streaks (quickest current) ═══ */}
            <span
              className="absolute -bottom-[10px] h-[20px] will-change-transform"
              style={{
                width: "400%",
                left: "-300%",
                background: `repeating-linear-gradient(90deg,
                  rgba(255,255,245,0.02) 0%,
                  rgba(255,252,235,0.2)  9%,
                  rgba(235,255,245,0.26) 14%,
                  rgba(225,242,255,0.22) 20%,
                  rgba(255,255,250,0.04) 27%,
                  rgba(245,235,255,0.22) 34%,
                  rgba(255,240,238,0.26) 39%,
                  rgba(255,248,228,0.18) 45%,
                  rgba(255,255,245,0.02) 50%)`,
                filter: "blur(9px)",
                animation: "liquidFlowLTR 1.8s linear infinite",
                opacity: 0.5,
              }}
            />

            {/* ═══ LAYER 5 — Bottom edge intensifier (stationary, breathing) ═══ */}
            <span
              className="absolute bottom-[-4px] left-0 right-0 h-[14px]"
              style={{
                background: `radial-gradient(ellipse 80% 100% at 50% 100%,
                  rgba(255,240,220,0.32),
                  rgba(255,220,180,0.2) 40%,
                  transparent 75%)`,
                filter: "blur(6px)",
                animation: "edgeGlowPulse 3.2s ease-in-out infinite",
              }}
            />
          </motion.span>
        )}
      </AnimatePresence>

      {/* bottom edge glow line (idle state) */}
      <AnimatePresence>
        {!loading && (
          <motion.span
            key="idleline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-0 left-[15%] right-[15%] h-px pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(238,215,170,0.32) 30%, rgba(240,218,175,0.44) 50%, rgba(238,215,170,0.32) 70%, transparent)"
            }}
          />
        )}
      </AnimatePresence>

      {/* cursor reactive specular sheen */}
      <span className="absolute inset-0 rounded-[17px] pointer-events-none opacity-[0.85] transition-opacity"
        style={{
          background: "radial-gradient(220px 100px at var(--mx,50%) var(--my,0%), rgba(255,240,210,0.1), transparent 58%)"
        }}
      />
      {/* inner top hairline */}
      <span className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
      {/* ripple effects */}
      {ripples.map(r => (
        <span key={r.id} className="absolute w-40 h-40 rounded-full pointer-events-none animate-[obRipple_.62s_ease-out]"
          style={{ left: r.x-80, top: r.y-80, background: "radial-gradient(circle, rgba(255,240,210,0.18) 0%, rgba(255,235,200,0.08) 36%, transparent 68%)" }} />
      ))}

      {/* Label — crossfades between idle and loading state */}
      <span className="relative flex items-center justify-center gap-2.5 min-h-[22px]">
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.span
              key="loading"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-center gap-2.5"
            >
              <span className="relative flex items-center justify-center w-[17px] h-[17px]">
                {/* spinner ring */}
                <span className="absolute inset-0 rounded-full border-[2.2px] border-white/14 border-t-[#f0e4cc]"
                  style={{ animation: "spin 0.9s cubic-bezier(0.5, 0.15, 0.5, 0.85) infinite" }} />
                {/* tiny glow under spinner */}
                <span className="absolute inset-[-3px] rounded-full opacity-50"
                  style={{ background: "radial-gradient(circle, rgba(240,228,195,0.25), transparent 70%)", filter: "blur(2px)" }} />
              </span>
              <span className="text-[#e8e0d2]">{typeof children === "string" ? children : "Working"}…</span>
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-center gap-2.5"
            >
              {children}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  );
}
