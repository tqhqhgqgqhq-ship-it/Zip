import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import ObsidianBackground from "./ObsidianBackground";
import { NudgelButton } from "./ui/ObButton";
import { Field } from "./ui/Field";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-white/[0.083] bg-white/[0.028] px-4 py-3.5">
      <div className="mono text-[10.3px] tracking-widest text-[#b7b0a5]">{label}</div>
      <div className="text-[14.45px] text-[#f0e8da] mt-1 break-all">{value}</div>
    </div>
  );
}

function RegenerateTokenDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (pw: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!password) return setErr("Enter your current password.");
    setLoading(true);
    try {
      await onConfirm(password);
    } catch (e: any) {
      setErr(e.message || "Failed to regenerate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-[24px] border border-white/[0.13] bg-[#101016] backdrop-blur-[26px] p-6 shadow-[0_24px_100px_rgba(0,0,0,0.7)]"
      >
        <div className="mono text-[11px] tracking-widest text-[#b8b1a7] mb-2">CONFIRM PASSWORD</div>
        <h3 className="display text-[22px] text-[#f4efe7]">Regenerate recovery token?</h3>
        <p className="text-[13.5px] text-[#a59f95] mt-2 leading-relaxed">
          Your current recovery token will be permanently invalidated. Enter your password to confirm.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field
            label="Current password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
          {err && <div className="text-[13.2px] text-rose-200">{err}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel}
              className="flex-1 px-4 py-3 rounded-[14px] border border-white/[0.12] text-[13.5px] text-[#d9d2c6] hover:bg-white/[0.04]">
              Cancel
            </button>
            <div className="flex-1">
              <NudgelButton type="submit" loading={loading}>Regenerate</NudgelButton>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function NewTokenDialog({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(token).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-[24px] border border-white/[0.13] bg-[#101016] backdrop-blur-[26px] p-6 shadow-[0_24px_100px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-400/15 border border-emerald-300/25 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7" stroke="#86efac" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="mono text-[10px] text-[#b8b1a7] tracking-widest">NEW TOKEN</div>
            <h3 className="display text-[19px] text-[#f4efe7]">Recovery token regenerated</h3>
          </div>
        </div>

        <div className="rounded-[14px] bg-black/40 border border-amber-200/20 px-4 py-3 mb-4">
          <div className="mono text-[9.5px] text-amber-200/85 tracking-widest mb-1.5">SAVE THIS NOW</div>
          <div className="mono text-[16px] tracking-[3px] text-[#f1eadf] font-[600] text-center break-all">
            {token}
          </div>
        </div>

        <p className="text-[12.5px] text-[#a59f95] mb-4">
          This is the only time it will be shown. The old token is permanently invalidated.
        </p>

        <div className="flex gap-2">
          <button onClick={copy} className="flex-1 px-4 py-2.5 rounded-[12px] bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.07] text-[13px] text-[#d9d0c1]">
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-[12px] bg-white/[0.04] border border-white/[0.10] hover:bg-white/[0.07] text-[13px] text-[#d9d0c1]">
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { user, signOut, regenerateRecoveryToken } = useAuth();
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  if (!user) return null;

  const createdAt = new Date(user.createdAt).toLocaleString();
  const lastSignIn = user.lastSignIn ? new Date(user.lastSignIn).toLocaleString() : "First session";
  const avatarUrl = user.photoURL || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.name || user.email)}&backgroundColor=f1ede7,ebe4d7&fontWeight=600`;

  const handleRegenerate = async (pw: string) => {
    const token = await regenerateRecoveryToken(pw);
    setShowRegenConfirm(false);
    setNewToken(token);
  };

  return (
    <div className="relative min-h-screen bg-[#050507] overflow-hidden text-[#ece7df]">
      <ObsidianBackground />
      <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-10 py-[56px] md:py-[84px]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.72, ease: [0.25, 0.1, 0.25, 1] }}>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
            <div className="flex items-center gap-4">
              <img src={avatarUrl} alt="" className="w-14 h-14 rounded-[18px] ring-1 ring-white/[0.16] bg-white/[0.05]" />
              <div>
                <div className="mono text-[11px] text-[#b9b2a6] tracking-widest">NUDGEL WORKSPACE</div>
                <h1 className="display text-[35px] md:text-[42px] text-[#f7f1e7]">Welcome, {user.name.split(" ")[0]}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRegenConfirm(true)}
                className="px-4 py-2.5 rounded-[13px] border border-white/[0.14] bg-white/[0.034] hover:bg-white/[0.065] text-[13.8px] text-[#e8e1d5] transition-colors"
              >
                Recovery Token
              </button>
              <button onClick={signOut} className="px-4 py-2.5 rounded-[13px] border border-white/[0.14] bg-white/[0.034] hover:bg-white/[0.065] text-[13.8px] text-[#e8e1d5] transition-colors">Sign out</button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-[30px]">
            <div className="md:col-span-1 rounded-[26px] border border-white/[0.11] bg-[linear-gradient(180deg,rgba(255,255,255,0.053),rgba(255,255,255,0.022))] backdrop-blur-2xl shadow-[0_24px_100px_rgba(0,0,0,0.62)] p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <img src={avatarUrl} alt={user.name} className="w-[98px] h-[98px] rounded-[26px] ring-1 ring-white/[0.18]" />
                  <span className={`absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full border-[3px] border-[#141219] ${user.emailVerified ? "bg-emerald-400" : "bg-amber-400"}`} />
                </div>
                <div className="mt-4 text-[20.5px] font-[650] tracking-[-0.012em]">{user.name}</div>
                <div className="text-[13.8px] text-[#bdb6a9]">{user.email}</div>
              </div>
              <div className="mt-6 pt-5 border-t border-white/[0.085] text-[13.75px] space-y-[11px] text-[#cdc6b8]">
                <div className="flex items-center justify-between"><span className="text-[#a69f94]">Email verified</span><b className={`font-[650] ${user.emailVerified ? "text-emerald-200" : "text-amber-200"}`}>{user.emailVerified ? "Yes" : "Pending"}</b></div>
                <div className="flex items-center justify-between"><span className="text-[#a69f94]">User ID</span><span className="mono text-[12.2px] text-[#d9d0c1]">{user.uid}</span></div>
                <div className="flex items-center justify-between"><span className="text-[#a69f94]">Recovery</span><span className="text-[#86efac]">✓ Active</span></div>
              </div>
            </div>

            <div className="md:col-span-2 rounded-[26px] border border-white/[0.11] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] backdrop-blur-2xl shadow-[0_24px_100px_rgba(0,0,0,0.62)] p-[26px] md:p-8">
              <div className="flex items-center justify-between mb-5">
                <div className="mono text-[11px] tracking-widest text-[#b9b2a6]">ACCOUNT RECORD • FIREBASE AUTH</div>
                <div className="text-[11.8px] text-[#a0988a]">Firebase Auth v2.7</div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3.5">
                <Stat label="USER ID (UID)" value={user.uid} />
                <Stat label="DISPLAY NAME" value={user.name} />
                <Stat label="EMAIL" value={user.email} />
                <Stat label="EMAIL VERIFIED" value={user.emailVerified ? "✅ Verified" : "⏳ Pending"} />
                <Stat label="CREATED AT" value={createdAt} />
                <Stat label="LAST SIGN IN" value={lastSignIn} />
              </div>

              <div className="mt-6 pt-6 border-t border-white/[0.084]">
                <div className="mono text-[11px] tracking-widest text-[#b9b1a5] mb-3">ACCOUNT SECURITY</div>
                <p className="text-[13.5px] text-[#a59f95] leading-relaxed">
                  Your account uses a recovery token system. Keep your token safe — it's required to recover your account if you forget your password.
                </p>
                <button
                  onClick={() => setShowRegenConfirm(true)}
                  className="mt-3 px-3.5 py-2 rounded-[11px] border border-white/[0.12] bg-white/[0.03] hover:bg-white/[0.07] text-[12.5px] text-[#e5ddd0] hover:text-white transition-colors"
                >
                  Regenerate Recovery Token →
                </button>
              </div>
            </div>
          </div>

          <div className="text-center mono text-[11px] tracking-wider text-[#8f8980] mt-9">
            Firebase Auth • word-weaver-9usyc
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showRegenConfirm && (
          <RegenerateTokenDialog
            onConfirm={handleRegenerate}
            onCancel={() => setShowRegenConfirm(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newToken && (
          <NewTokenDialog token={newToken} onClose={() => setNewToken(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
