import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function RecoveryTokenView({
  token,
  email,
  onConfirmed,
}: {
  token: string;
  email: string;
  onConfirmed: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const masked = "NUDGEL-••••-••••-••••";

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = token;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadToken = () => {
    const file = {
      type: "NUDGEL Recovery Token",
      email,
      token,
      generatedAt: new Date().toISOString(),
      instructions: "Keep this file in a safe place. You will need this token to recover your account if you forget your password.",
    };
    const content = JSON.stringify(file, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nudgel-recovery-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shareToken = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Nudgel Recovery Token",
          text: `My Nudgel recovery token (keep safe!): ${token}`,
        });
      } catch {}
    } else {
      copyToken();
    }
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setLeaving(true);
    setTimeout(onConfirmed, 500);
  };

  if (leaving) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-[#050507] flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 20 }}
          className="flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-400/15 border border-emerald-300/25 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7" stroke="#86efac" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="display text-[22px] text-[#f1e8da] mt-5">Token saved</div>
          <div className="text-[14px] text-[#a59f95] mt-1.5">Welcome to Nudgel</div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 bg-[#050507] overflow-y-auto"
    >
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-[620px] h-[520px] rounded-full blur-[140px] opacity-30"
          style={{ background: "radial-gradient(circle, #c5b49c 0%, #7e6a52 60%, transparent 75%)" }} />
        <div className="absolute top-24 right-[-80px] w-[460px] h-[430px] rounded-full blur-[120px] opacity-25"
          style={{ background: "radial-gradient(circle, #d9cfc0 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[560px]"
        >
          {/* Animated envelope icon */}
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 16, delay: 0.15 }}
            className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{
              background: "linear-gradient(180deg, rgba(232,212,170,0.16), rgba(232,212,170,0.05))",
              boxShadow: "0 0 50px rgba(232,212,170,0.16), inset 0 1px 0 rgba(255,255,255,0.12)",
              border: "1px solid rgba(232,212,170,0.28)",
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5 3.4 9.5 8 10 4.6-.5 8-5 8-10V6l-8-4z" stroke="#e8d4aa" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4" stroke="#e8d4aa" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>

          <div className="text-center mb-7">
            <div className="mono text-[11px] tracking-widest text-[#b8b1a7]">ACCOUNT SECURED</div>
            <h1 className="display text-[36px] md:text-[42px] mt-2 text-[#f4efe7] leading-[1.05]">
              Save your recovery token
            </h1>
            <p className="text-[14.7px] text-[#a59f95] mt-3 max-w-[440px] mx-auto leading-relaxed">
              This is the <b className="text-[#e5ddd0]">only way</b> to recover your account if you forget your password.
              We do not store it in plain text and we cannot restore it.
            </p>
          </div>

          {/* The token card */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="relative rounded-[24px] border border-white/[0.13] bg-[linear-gradient(180deg,rgba(255,255,255,0.053),rgba(255,255,255,0.022))] backdrop-blur-[26px] shadow-[0_24px_100px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.085)] p-6"
          >
            <div className="absolute top-0 left-7 right-7 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

            <div className="flex items-center justify-between mb-3">
              <div className="mono text-[10.5px] tracking-widest text-[#b8b1a7]">RECOVERY TOKEN</div>
              <button
                onClick={() => setReveal((v) => !v)}
                className="text-[11.5px] mono text-[#cfc8ba] hover:text-white px-2.5 py-1 rounded-[7px] border border-white/[0.12] hover:bg-white/[0.04] transition-colors"
              >
                {reveal ? "Hide" : "Reveal"}
              </button>
            </div>

            <div className="rounded-[14px] bg-black/35 border border-white/[0.09] p-4 mb-4">
              <div className="mono text-[19px] md:text-[20.5px] tracking-[3.5px] text-[#f1eadf] font-[650] text-center break-all select-all">
                {reveal ? token : masked}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={copyToken}
                className="rounded-[12px] bg-white/[0.035] border border-white/[0.10] hover:bg-white/[0.07] py-2.5 text-[12.5px] text-[#d9d0c1] hover:text-white transition-colors flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  {copied ? (
                    <path d="M5 12.5l4.5 4.5L19 7" stroke="#86efac" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <>
                      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" strokeWidth="1.7" />
                    </>
                  )}
                </svg>
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={downloadToken}
                className="rounded-[12px] bg-white/[0.035] border border-white/[0.10] hover:bg-white/[0.07] py-2.5 text-[12.5px] text-[#d9d0c1] hover:text-white transition-colors flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 4v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 18v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                Download
              </button>
              <button
                onClick={shareToken}
                className="rounded-[12px] bg-white/[0.035] border border-white/[0.10] hover:bg-white/[0.07] py-2.5 text-[12.5px] text-[#d9d0c1] hover:text-white transition-colors flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M8.5 13.5l7 4M15.5 6.5l-7 4" stroke="currentColor" strokeWidth="1.7" />
                </svg>
                Share
              </button>
            </div>
          </motion.div>

          {/* Critical warning */}
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-5 rounded-[16px] border border-rose-300/25 bg-rose-500/[0.05] px-4 py-3.5"
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-[10px] bg-rose-300/[0.1] border border-rose-300/20 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4M12 17h.01" stroke="#fda4af" strokeWidth="2" strokeLinecap="round" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#fda4af" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="text-[13.5px] font-[640] text-[#fecdd3]">Critical: this token will NOT be shown again</div>
                <div className="text-[12.6px] text-[#d4b8be] mt-0.5 leading-relaxed">
                  If you lose it, your account will be permanently inaccessible. Save it in a password manager, write it down, or download the file.
                </div>
              </div>
            </div>
          </motion.div>

          {/* Confirm button */}
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            className="mt-7"
          >
            <AnimatePresence>
              {!confirmed ? (
                <motion.button
                  key="confirm"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  onClick={handleConfirm}
                  className="w-full rounded-[16px] py-[16px] text-[15.3px] font-[630] tracking-[-0.008em] text-[#181511] transition-all hover:scale-[1.005] active:scale-[0.995]"
                  style={{
                    background: "linear-gradient(180deg, #f6efe3 0%, #e6d9c5 48%, #d8c8b3 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,.93), inset 0 -1px 0 rgba(84,61,34,.19), 0 10px 32px rgba(0,0,0,.54)",
                    border: "1px solid rgba(255,238,210,0.115)",
                  }}
                >
                  ✓ I have saved my recovery token
                </motion.button>
              ) : (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[16px] py-[16px] text-center text-[14px] text-[#86efac] font-[600] border border-emerald-300/20 bg-emerald-400/[0.06]"
                >
                  Saved — taking you to your dashboard…
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
