import { useState } from "react";
import { motion } from "framer-motion";
import { Field } from "../ui/Field";
import { NudgelButton } from "../ui/ObButton";
import { useAuth } from "../../context/AuthContext";

function scorePassword(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  return Math.min(s, 4);
}

export default function ResetPasswordView({
  email,
  token,
  onDone,
  onNewToken,
}: {
  email: string;
  token: string;
  onDone: () => void;
  onNewToken: (newToken: string) => void;
}) {
  const { resetPasswordWithRecoveryToken } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState<{ newToken: string } | null>(null);

  const pwScore = scorePassword(password);
  const pwLabels = ["Weak", "Fair", "Good", "Strong", "Excellent"];
  const pwColor = ["#fb7185", "#fbbf24", "#f6d68a", "#b8dec0", "#86efac"][pwScore];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    if (!/[A-Z]/.test(password)) return setErr("Include at least one uppercase letter.");
    if (!/[0-9]/.test(password)) return setErr("Include at least one number.");
    if (password !== confirm) return setErr("Passwords do not match.");
    setLoading(true);
    try {
      const { newRecoveryToken } = await resetPasswordWithRecoveryToken(email, token, password);
      setSuccess({ newToken: newRecoveryToken });
      onNewToken(newRecoveryToken);
      setTimeout(onDone, 4000);
    } catch (e: any) {
      if (e.code === "auth/weak-password") setErr("Password is too weak.");
      else setErr(e.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 flex flex-col items-center text-center">
        <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className="relative w-20 h-20 rounded-full flex items-center justify-center mb-5"
          style={{ background: "linear-gradient(180deg, rgba(134,239,172,0.16), rgba(134,239,172,0.05))", boxShadow: "0 0 50px rgba(134,239,172,0.18), inset 0 1px 0 rgba(255,255,255,0.12)", border: "1px solid rgba(134,239,172,0.28)" }}
        >
          <motion.svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <motion.path d="M5 12.5l4.5 4.5L19 7" stroke="#86efac" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.55, delay: 0.18, ease: "easeOut" }} />
          </motion.svg>
        </motion.div>
        <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="display text-[25px] text-[#f4efe7]">Password updated</motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="text-[12.5px] text-[#a59f95] mt-1.5">
          Your new recovery token has been generated.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          className="mt-5 rounded-[14px] border border-amber-200/20 bg-amber-200/[0.04] px-4 py-3.5 w-full"
        >
          <div className="mono text-[9.5px] text-amber-200/85 tracking-widest mb-1.5">NEW RECOVERY TOKEN</div>
          <div className="mono text-[14.5px] tracking-[2.5px] text-[#f1eadf] font-[600] break-all">
            {success.newToken}
          </div>
        </motion.div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="text-[11.5px] text-[#857f74] mt-3">
          Save it now — this is the only time it will be shown.
        </motion.p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.52, ease: [0.25, 0.1, 0.25, 1] }}>
      <div className="mb-6">
        <div className="mono text-[11px] tracking-widest text-[#b8b1a7]">NEW PASSWORD</div>
        <h2 className="display text-[28px] mt-2 text-[#f4efe7]">Set new password</h2>
        <p className="text-[13.8px] text-[#a59f95] mt-2">For <b className="text-[#e5ddd0] font-[600]">{email}</b></p>
      </div>

      <form onSubmit={submit} className="space-y-[14px]">
        <div>
          <Field label="New password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
            rightSlot={<button type="button" onClick={() => setShowPw((v) => !v)} className="text-[11.7px] mono text-[#bbb5aa] hover:text-[#f0e8dc] px-1 transition-colors">{showPw ? "Hide" : "Show"}</button>}
          />
          {password && (
            <div className="mt-[10px] flex items-center gap-3">
              <div className="flex-1 h-[5px] rounded-full bg-white/[0.09] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((pwScore + 1) / 5) * 100}%`, background: pwColor }} />
              </div>
              <span className="mono text-[11px]" style={{ color: pwColor }}>{pwLabels[pwScore]}</span>
            </div>
          )}
        </div>

        <Field label="Confirm password" type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
          error={confirm && confirm !== password ? "Passwords do not match." : undefined}
          rightSlot={<button type="button" onClick={() => setShowConfirm((v) => !v)} className="text-[11.7px] mono text-[#bbb5aa] hover:text-[#f0e8dc] px-1 transition-colors">{showConfirm ? "Hide" : "Show"}</button>}
        />

        {err && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-[13px] border border-rose-300/22 bg-rose-500/[0.06] px-3.5 py-2.5 text-[13.3px] text-rose-200/95"
          >{err}</motion.div>
        )}

        <div className="pt-1">
          <NudgelButton type="submit" loading={loading}>Reset Password</NudgelButton>
        </div>
      </form>
    </motion.div>
  );
}
