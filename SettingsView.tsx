import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { getMyProfile, updateProfile } from "../lib/turso";
import { uploadImageFile } from "../lib/jscord-upload";
import { fallbackAvatar } from "../MessagingApp";
import { THEMES, getTheme, applyTheme, type ThemeId } from "../lib/theme";

/* ════════════════════════════════════════════════════════════════
   OBSIDIAN CONTROL CENTER
   A premium identity workspace — not an app settings screen.
   Every surface is carved obsidian + polished gold.
   Spring physics on every interaction. GPU-only animations.
   ════════════════════════════════════════════════════════════════ */

const EASE = [0.22, 1, 0.36, 1] as const;
const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 28, mass: 0.9 } as const;
const SPRING_SNAPPY = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;

/* ─── Inject keyframes once ───────────────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("occ-styles")) {
  const s = document.createElement("style");
  s.id = "occ-styles";
  s.textContent = `
    @keyframes occ-sheen {
      0%   { transform: translateX(-140%) skewX(-20deg); }
      100% { transform: translateX(340%)  skewX(-20deg); }
    }
    @keyframes occ-gold-pulse {
      0%, 100% { opacity: 0.55; }
      50%       { opacity: 1;    }
    }
    @keyframes occ-orbit {
      from { transform: rotate(0deg)   translateX(32px) rotate(0deg); }
      to   { transform: rotate(360deg) translateX(32px) rotate(-360deg); }
    }
    .occ-sheen::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        105deg,
        transparent 25%,
        rgba(255,248,220,0.22) 50%,
        transparent 75%
      );
      animation: occ-sheen 3.8s ease-in-out infinite;
      pointer-events: none;
      border-radius: inherit;
      overflow: hidden;
    }
    .occ-gold-pulse { animation: occ-gold-pulse 2.4s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════════════════════════════
   PRIMITIVES
   ════════════════════════════════════════════════════════════════ */

/* Obsidian slab card — layered volcanic glass */
function ObsidianCard({
  children,
  className = "",
  style = {},
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING_SOFT, delay }}
      className={`relative overflow-hidden ${className}`}
      style={{
        borderRadius: 28,
        background:
          "linear-gradient(160deg, rgba(28,22,16,0.98) 0%, rgba(16,12,9,0.99) 55%, rgba(10,8,6,1) 100%)",
        border: "1px solid rgba(255,244,210,0.1)",
        boxShadow: [
          /* top specular rim */
          "inset 0 1px 0 rgba(255,248,222,0.14)",
          /* bottom caustic */
          "inset 0 -1px 0 rgba(255,230,160,0.06)",
          /* left/right micro-bevel */
          "inset 1px 0 0 rgba(255,248,222,0.05)",
          "inset -1px 0 0 rgba(255,248,222,0.05)",
          /* inner depth glow */
          "inset 0 0 40px rgba(216,173,90,0.04)",
          /* ambient elevation */
          "0 18px 48px rgba(0,0,0,0.65)",
          "0 4px 12px rgba(0,0,0,0.5)",
          /* gold outer trace */
          "0 0 0 0.5px rgba(216,173,90,0.18)",
        ].join(", "),
        ...style,
      }}
    >
      {/* Surface mineral shimmer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 20% 0%, rgba(255,244,210,0.09) 0%, transparent 65%)",
          borderRadius: "inherit",
        }}
      />
      {children}
    </motion.div>
  );
}

/* Liquid gold button */
function GoldButton({
  children,
  onClick,
  disabled = false,
  small = false,
  danger = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  danger?: boolean;
  className?: string;
}) {
  const [pressed, setPressed] = useState(false);

  const bg = danger
    ? pressed
      ? "linear-gradient(180deg,#c0392b 0%,#922b21 100%)"
      : "linear-gradient(180deg,#e74c3c 0%,#b03a2e 100%)"
    : pressed
    ? "linear-gradient(180deg,#C8A84B 0%,#8B6914 40%,#6B4F0E 100%)"
    : "linear-gradient(180deg,#F4E0A6 0%,#D4A84E 28%,#A07428 62%,#7A5518 100%)";

  const shadow = danger
    ? pressed
      ? "inset 0 2px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,140,130,0.18), 0 2px 6px rgba(0,0,0,0.4)"
      : "inset 0 1px 0 rgba(255,180,170,0.35), inset 0 -2px 4px rgba(0,0,0,0.4), 0 8px 20px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.35)"
    : pressed
    ? "inset 0 2px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,244,200,0.15), 0 2px 6px rgba(0,0,0,0.4)"
    : "inset 0 1px 0 rgba(255,252,240,0.6), inset 0 -2px 5px rgba(80,50,10,0.45), inset 1px 0 0 rgba(255,245,200,0.2), inset -1px 0 0 rgba(255,245,200,0.12), 0 10px 24px rgba(0,0,0,0.45), 0 3px 8px rgba(0,0,0,0.38), 0 0 0 0.5px rgba(216,173,90,0.3)";

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`relative overflow-hidden select-none ${className}`}
      style={{
        height: small ? 42 : 52,
        borderRadius: small ? 14 : 18,
        background: bg,
        boxShadow: shadow,
        color: danger ? "#fff" : "#1A0F00",
        fontWeight: 700,
        fontSize: small ? 13 : 14,
        letterSpacing: "-0.01em",
        opacity: disabled ? 0.45 : 1,
        transform: pressed ? "scale(0.97) translateY(1px)" : "scale(1)",
        transition: "background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease",
        willChange: "transform",
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {/* Sheen sweep — only on gold */}
      {!danger && (
        <span
          className="occ-sheen absolute inset-0 pointer-events-none"
          style={{ borderRadius: "inherit" }}
        />
      )}
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}

/* Obsidian row button — inset physical control */
function ObsidianRow({
  label,
  sublabel,
  icon,
  onClick,
  right,
  accent = false,
}: {
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  right?: React.ReactNode;
  accent?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <motion.button
      className="w-full flex items-center gap-3.5 px-5 select-none"
      style={{
        height: 62,
        background: pressed
          ? "rgba(255,244,210,0.055)"
          : "transparent",
        transition: "background 0.12s ease",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {icon && (
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: accent
              ? "linear-gradient(160deg,rgba(244,224,166,0.22),rgba(160,116,40,0.12))"
              : "rgba(255,244,210,0.06)",
            border: `1px solid ${accent ? "rgba(216,173,90,0.28)" : "rgba(255,244,210,0.08)"}`,
          }}
        >
          <span style={{ color: accent ? "#EFC878" : "#8A7D67", fontSize: 15 }}>{icon}</span>
        </span>
      )}
      <div className="flex-1 min-w-0 text-left">
        <div
          className="text-[14px] font-semibold leading-tight"
          style={{ color: accent ? "#EFC878" : "#F3EADB" }}
        >
          {label}
        </div>
        {sublabel && (
          <div className="text-[11.5px] mt-0.5 font-medium" style={{ color: "#8A7D67" }}>
            {sublabel}
          </div>
        )}
      </div>
      {right ?? (
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(140,126,100,0.5)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
    </motion.button>
  );
}

/* Divider */
function Divider() {
  return (
    <div
      className="mx-5"
      style={{
        height: 1,
        background:
          "linear-gradient(90deg,transparent,rgba(216,173,90,0.12) 30%,rgba(216,173,90,0.12) 70%,transparent)",
      }}
    />
  );
}

/* Section label */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-1 mb-3 text-[10.5px] font-bold uppercase tracking-[0.18em]"
      style={{ color: "rgba(140,120,80,0.8)" }}
    >
      {children}
    </div>
  );
}

/* Token display badge */
function TokenBadge({ token }: { token: string }) {
  const chunks = token.match(/.{1,4}/g) ?? [token];
  return (
    <div className="flex gap-2 justify-center flex-wrap">
      {chunks.map((c, i) => (
        <span
          key={i}
          className="px-2.5 py-1 rounded-lg font-mono font-bold text-[15px]"
          style={{
            background: "rgba(239,200,120,0.1)",
            border: "1px solid rgba(239,200,120,0.2)",
            color: "#EFC878",
            letterSpacing: "0.12em",
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PROFILE HERO CARD
   ════════════════════════════════════════════════════════════════ */
function ProfileHero({
  avatarUrl,
  name,
  email,
}: {
  avatarUrl: string;
  name: string;
  email: string;
}) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useTransform(my, [-60, 60], [6, -6]);
  const rotateY = useTransform(mx, [-80, 80], [-6, 6]);

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left - r.width / 2);
    my.set(e.clientY - r.top - r.height / 2);
  };
  const handleLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SOFT, delay: 0.04 }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{ perspective: 900, willChange: "transform" }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          borderRadius: 32,
          background:
            "linear-gradient(150deg, rgba(30,24,16,0.99) 0%, rgba(14,11,8,1) 60%, rgba(8,6,4,1) 100%)",
          border: "1px solid rgba(255,244,210,0.12)",
          boxShadow: [
            "inset 0 1px 0 rgba(255,250,225,0.18)",
            "inset 0 -1px 0 rgba(255,228,150,0.07)",
            "inset 0 0 60px rgba(216,173,90,0.06)",
            "0 24px 60px rgba(0,0,0,0.7)",
            "0 6px 16px rgba(0,0,0,0.55)",
            "0 0 0 0.5px rgba(216,173,90,0.2)",
          ].join(", "),
          padding: "28px 24px 24px",
          position: "relative",
          overflow: "hidden",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Radial light source — top left */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: -40,
            left: -40,
            width: 220,
            height: 220,
            background:
              "radial-gradient(circle, rgba(255,242,196,0.14) 0%, transparent 68%)",
          }}
        />
        {/* Horizon line */}
        <div
          className="absolute inset-x-0 pointer-events-none"
          style={{
            top: "46%",
            height: 1,
            background:
              "linear-gradient(90deg,transparent,rgba(216,173,90,0.14) 30%,rgba(216,173,90,0.14) 70%,transparent)",
          }}
        />

        {/* Avatar + identity */}
        <div className="flex flex-col items-center gap-4">
          {/* Avatar — triple-ring gold halo */}
          <div className="relative">
            <div
              className="rounded-full"
              style={{
                padding: 3,
                background:
                  "conic-gradient(from 180deg, #7C5317, #D9AE5F, #FFF0CC, #E2B566, #9C7126, #C8963F, #F3D392, #B07F2C, #7C5317)",
                boxShadow:
                  "0 0 0 6px rgba(216,173,90,0.08), 0 0 32px rgba(216,173,90,0.22), 0 12px 32px rgba(0,0,0,0.6)",
              }}
            >
              <div
                className="rounded-full"
                style={{ padding: 3, background: "#0A0806" }}
              >
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-[82px] h-[82px] rounded-full object-cover block"
                  draggable={false}
                />
              </div>
            </div>
            {/* Presence dot */}
            <span
              className="absolute bottom-1 right-1 rounded-full"
              style={{
                width: 14,
                height: 14,
                background: "linear-gradient(135deg,#4ade80,#16a34a)",
                border: "2.5px solid #0A0806",
                boxShadow: "0 0 8px rgba(74,222,128,0.6)",
              }}
            />
          </div>

          {/* Name + email */}
          <div className="text-center">
            <div
              className="text-[22px] font-bold tracking-[-0.03em]"
              style={{ color: "#F4EBD9" }}
            >
              {name}
            </div>
            <div className="text-[12.5px] mt-1 font-medium" style={{ color: "#8A7D67" }}>
              {email}
            </div>
          </div>

          {/* Gold accent rule */}
          <div
            className="w-16 h-px occ-gold-pulse"
            style={{ background: "linear-gradient(90deg,transparent,#D4A853,transparent)" }}
          />

          {/* Stats row */}
          <div className="flex gap-6 text-center">
            {[
              { label: "Member", value: "Active" },
              { label: "Security", value: "High" },
              { label: "Status", value: "Online" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[15px] font-bold" style={{ color: "#EFC878" }}>
                  {s.value}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: "#6E6353" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   THEME SELECTOR
   ════════════════════════════════════════════════════════════════ */
function ThemeSelector({ active, onChange }: { active: ThemeId; onChange: (id: ThemeId) => void }) {
  return (
    <div className="flex gap-3 px-5 pb-5">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className="flex-1 flex flex-col items-center gap-2 select-none"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          <div
            style={{
              height: 44,
              width: "100%",
              borderRadius: 14,
              background: `linear-gradient(160deg, ${t.swatch[0]}, ${t.swatch[1]}, ${t.swatch[2]})`,
              border:
                active === t.id
                  ? "2px solid rgba(216,173,90,0.75)"
                  : "1px solid rgba(255,244,210,0.1)",
              boxShadow:
                active === t.id
                  ? "0 0 14px rgba(216,173,90,0.3), inset 0 1px 0 rgba(255,248,220,0.18)"
                  : "inset 0 1px 0 rgba(255,248,220,0.07)",
              transition: "border 0.22s ease, box-shadow 0.22s ease",
            }}
          />
          <span
            className="text-[10px] font-semibold"
            style={{ color: active === t.id ? "#EFC878" : "#6E6353" }}
          >
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   OBSIDIAN SHARE BUTTON
   Exact match of NudgelButton 3D obsidian style from login page
   ════════════════════════════════════════════════════════════════ */
function ObsidianShareButton({
  children,
  onClick,
  disabled = false,
  small = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleMove = (e: React.MouseEvent) => {
    const el = btnRef.current;
    if (!el || disabled) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translate3d(${x * 2}px, ${y * 1.5}px, 0) perspective(600px) rotateX(${y * -2}deg) rotateY(${x * 3}deg)`;
  };

  const handleLeave = () => {
    const el = btnRef.current;
    if (el) el.style.transform = `translate3d(0,0,0) perspective(600px) rotateX(0deg) rotateY(0deg)`;
  };

  return (
    <motion.button
      ref={btnRef}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      whileTap={{ scale: 0.985 }}
      disabled={disabled}
      className="relative overflow-hidden select-none"
      style={{
        height: small ? 42 : 52,
        borderRadius: small ? 16 : 17,
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
        color: "#efe8dc",
        fontWeight: 630,
        fontSize: small ? 13 : 15.3,
        letterSpacing: "-0.008em",
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        willChange: "transform",
      }}
    >
      {/* deep 3D bevel */}
      <span className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: small ? 16 : 17,
          background: "linear-gradient(180deg, rgba(255,245,222,0.14) 0%, rgba(255,240,215,0.04) 18%, transparent 42%, rgba(0,0,0,0.35) 82%, rgba(0,0,0,0.55) 100%)"
        }}
      />
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ════════════════════════════════════════════════════════════════ */
export function SettingsViewPremium({ onBack }: { onBack?: () => void }) {
  const { user, signOut } = useAuth();
  const [copied, setCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [liveToken, setLiveToken] = useState<string | null>(
    (user as any)?.contactToken || null,
  );
  const [liveAvatar, setLiveAvatar] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);
  const [nameModal, setNameModal] = useState(false);
  const [newName, setNewName] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Load theme from localStorage on mount
  const [theme, setTheme] = useState<ThemeId>(() => getTheme());

  // Load profile on mount
  useEffect(() => {
    if (!user || liveToken) return;
    getMyProfile(user.uid).then((p) => {
      if (p) {
        setLiveToken(p.contactToken);
        if (p.avatar) setLiveAvatar(p.avatar);
      }
    });
  }, [user?.uid, liveToken]);

  const contactToken = liveToken ?? "";
  const avatarUrl = liveAvatar || user?.photoURL || fallbackAvatar(user?.name || "U");

  const showToast = (msg: string) => {
    const id = Date.now();
    setToast({ msg, id });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 2200);
  };

  const copyToken = async () => {
    if (!contactToken) return;
    try {
      await navigator.clipboard.writeText(contactToken);
      setCopied(true);
      showToast("Copied to clipboard");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      showToast("Failed to copy");
    }
  };

  const shareToken = async () => {
    if (!contactToken) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: contactToken });
      } catch { /* cancelled */ }
    } else {
      copyToken();
    }
  };

  const handleSignOut = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      showToast("Signed out");
    } catch {
      setLoggingOut(false);
      showToast("Sign out failed");
    }
  };

  // Avatar upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const res = await uploadImageFile(file);
      if (res.success && res.url) {
        await updateProfile(user.uid, { avatar: res.url });
        setLiveAvatar(res.url);
        showToast("Avatar updated");
      } else {
        showToast("Upload failed");
      }
    } catch {
      showToast("Upload failed");
    }
    e.target.value = "";
  };

  // Name edit
  const openNameEdit = () => {
    setNewName(user?.name || "");
    setNameModal(true);
  };

  const saveName = async () => {
    if (!user || !newName.trim()) return;
    try {
      await updateProfile(user.uid, { name: newName.trim() });
      showToast("Name updated");
      setNameModal(false);
      // Refresh profile
      const p = await getMyProfile(user.uid);
      if (p) setLiveAvatar(p.avatar || liveAvatar);
    } catch {
      showToast("Failed to save");
    }
  };

  // Theme change — applies app-wide instantly + persists
  const handleThemeChange = (newTheme: ThemeId) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    const label = THEMES.find((t) => t.id === newTheme)?.label || newTheme;
    showToast(`${label} applied`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="h-full w-full flex flex-col relative"
      style={{ background: "linear-gradient(180deg,#080604 0%,#050403 100%)" }}
    >
      {/* Hidden file input for avatar upload */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ ...SPRING_SNAPPY }}
            className="absolute top-20 left-0 right-0 z-50 flex justify-center pointer-events-none px-4"
          >
            <div
              className="px-4 py-2.5 rounded-2xl shadow-lg"
              style={{
                background: "linear-gradient(160deg, rgba(28,22,16,0.98), rgba(10,8,6,1))",
                border: "1px solid rgba(255,244,210,0.15)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,248,222,0.1)",
              }}
            >
              <span className="text-[12.5px] font-semibold" style={{ color: "#EFC878" }}>
                {toast.msg}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name edit modal */}
      <AnimatePresence>
        {nameModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: "rgba(0,0,0,0.7)" }}
            onClick={() => setNameModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={SPRING_SOFT}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm"
              style={{
                background: "linear-gradient(160deg, rgba(28,22,16,0.98), rgba(10,8,6,1))",
                border: "1px solid rgba(255,244,210,0.15)",
                borderRadius: 28,
                boxShadow: "0 24px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,248,222,0.1)",
                padding: "24px",
              }}
            >
              <h3 className="text-[18px] font-bold mb-4" style={{ color: "#F4EBD9" }}>
                Change Display Name
              </h3>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                autoFocus
                className="w-full px-4 py-3 rounded-xl outline-none"
                style={{
                  background: "rgba(255,244,210,0.05)",
                  border: "1px solid rgba(255,244,210,0.1)",
                  color: "#F4EBD9",
                  fontSize: 15,
                }}
                placeholder="Your display name"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setNameModal(false)}
                  className="flex-1 py-3 rounded-xl font-semibold"
                  style={{
                    background: "rgba(255,244,210,0.05)",
                    border: "1px solid rgba(255,244,210,0.1)",
                    color: "#8A7D67",
                  }}
                >
                  Cancel
                </button>
                <GoldButton small onClick={saveName} disabled={!newName.trim()}>
                  Save
                </GoldButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_SNAPPY, delay: 0.02 }}
        className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(216,173,90,0.08)" }}
      >
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="tappable-soft p-1 -ml-1 text-[#C9A969]"
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}
          <span
            className="text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#8A7D67" }}
          >
            Control Center
          </span>
        </div>
        <div
          className="h-5 w-px"
          style={{ background: "rgba(216,173,90,0.18)" }}
        />
        <span
          className="text-[10.5px] font-semibold"
          style={{ color: "rgba(140,120,80,0.7)" }}
        >
          v1.0
        </span>
      </motion.div>

      {/* ── SCROLL BODY ── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scroll-area"
        style={{ overscrollBehavior: "contain" }}
      >
        <div className="px-4 pt-4 pb-10 space-y-6">

          {/* Profile hero */}
          <ProfileHero
            avatarUrl={avatarUrl}
            name={user?.name || "User"}
            email={user?.email || ""}
          />

          {/* Identity section */}
          <div>
            <SectionLabel>Identity</SectionLabel>
            <ObsidianCard delay={0.08}>
              <ObsidianRow
                label="Display Name"
                sublabel={user?.name || "—"}
                icon="✦"
                accent
                onClick={openNameEdit}
              />
              <Divider />
              <ObsidianRow
                label="Change Avatar"
                sublabel="Gallery · Camera"
                icon="◈"
                onClick={() => avatarInputRef.current?.click()}
              />
            </ObsidianCard>
          </div>

          {/* Contact token */}
          <div>
            <SectionLabel>Contact Token</SectionLabel>
            <ObsidianCard delay={0.12}>
              <div className="px-5 pt-5 pb-4">
                <p className="text-[11.5px] font-medium mb-4 leading-relaxed" style={{ color: "#8A7D67" }}>
                  Share this token so others can add you. It never changes.
                </p>

                <div
                  className="py-4 px-3 rounded-2xl mb-4"
                  style={{
                    background: "rgba(239,200,120,0.05)",
                    border: "1px solid rgba(239,200,120,0.14)",
                    minHeight: 58,
                  }}
                >
                  {contactToken ? (
                    <TokenBadge token={contactToken} />
                  ) : (
                    <div className="flex items-center justify-center gap-2" style={{ color: "#6E6353" }}>
                      <div
                        className="w-4 h-4 rounded-full border-2 border-[#D4A853] border-t-transparent animate-spin"
                      />
                      <span className="text-[12px] font-medium">Fetching token…</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <GoldButton small onClick={copyToken} disabled={!contactToken}>
                    {copied ? (
                      <>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        Copy
                      </>
                    )}
                  </GoldButton>
                  {/* Obsidian Share button */}
                  <ObsidianShareButton small onClick={shareToken} disabled={!contactToken}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                    Share
                  </ObsidianShareButton>
                </div>
              </div>
            </ObsidianCard>
          </div>

          {/* Appearance */}
          <div>
            <SectionLabel>Appearance</SectionLabel>
            <ObsidianCard delay={0.16}>
              <div className="px-5 pt-5 pb-2">
                <div className="text-[12.5px] font-semibold mb-4" style={{ color: "#C9BCA6" }}>
                  Interface Theme
                </div>
              </div>
              <ThemeSelector active={theme} onChange={handleThemeChange} />
            </ObsidianCard>
          </div>

          {/* Sign out */}
          <div className="pt-2">
            <GoldButton
              onClick={handleSignOut}
              disabled={loggingOut}
              danger
              className="w-full"
            >
              {loggingOut ? (
                <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Sign Out
                </>
              )}
            </GoldButton>
          </div>

          {/* Build stamp */}
          <div className="text-center pb-2">
            <span className="text-[10px] font-semibold tracking-[0.14em] uppercase" style={{ color: "rgba(110,99,83,0.5)" }}>
              Nudgel · Obsidian Edition
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
