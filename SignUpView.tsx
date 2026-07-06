import { useMemo, useState } from "react";
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

export default function SignUpView({
  onSuccess,
}: {
  onSuccess: (recoveryToken: string, email: string) => void;
}) {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pwScore = useMemo(() => scorePassword(password), [password]);
  const pwLabels = ["Weak", "Fair", "Good", "Strong", "Excellent"];
  const pwColor = ["#fb7185", "#fbbf24", "#f6d68a", "#b8dec0", "#bde7c8"][pwScore];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("Please add your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr("Enter a valid email.");
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    if (password !== confirm) return setErr("Passwords do not match.");
    if (!agree) return setErr("Please accept the Terms to continue.");
    setLoading(true);
    try {
      const newUser = await signUp(name.trim(), email.trim(), password);
      if (newUser.recoveryToken) {
        onSuccess(newUser.recoveryToken, newUser.email);
      } else {
        setErr("Failed to generate recovery token. Please try again.");
        setLoading(false);
      }
    } catch (e: any) {
      setErr(e.message || "Could not create account.");
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.52, ease: [0.25, 0.1, 0.25, 1] }}>
      <div className="mb-6">
        <div className="mono text-[11px] tracking-widest text-[#b8b1a7]">CREATE ACCOUNT</div>
        <h2 className="display text-[31px] md:text-[35px] leading-[1.06] mt-2 text-[#f4efe7]">Create your account</h2>
        <p className="text-[14.3px] text-[#a49f97] mt-2.5">Get started with Nudgel in seconds.</p>
      </div>

      <form onSubmit={submit} className="space-y-[13px]">
        <Field label="Full name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
        <Field label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        <div>
          <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          {password && (
            <div className="mt-[10px] flex items-center gap-3">
              <div className="flex-1 h-[5px] rounded-full bg-white/[0.09] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(pwScore + 1) / 5 * 100}%`, background: pwColor }} />
              </div>
              <span className="mono text-[11px] text-[#bdb6a9]" style={{ color: pwColor }}>{pwLabels[pwScore]}</span>
            </div>
          )}
        </div>
        <Field label="Confirm password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />

        <label className="flex items-start gap-3 pt-2 text-[13.4px] text-[#c3bdb3] cursor-pointer">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="peer sr-only" />
          <span className="mt-[2px] h-[18px] w-[18px] rounded-[6px] border border-white/[0.18] bg-black/30 flex items-center justify-center peer-checked:bg-[#e9ddd0] peer-checked:border-[#e9ddd0] transition-all">
            {agree && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.8 6.1l2.2 2.2 4.2-4.6" stroke="#2a2116" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </span>
          <span>I agree to the <a className="underline decoration-white/25 underline-offset-2 hover:text-[#f3ebe0]" href="#" onClick={e => e.preventDefault()}>Terms</a> and <a className="underline decoration-white/25 underline-offset-2 hover:text-[#f3ebe0]" href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>.</span>
        </label>

        {err && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-[13px] border border-rose-300/22 bg-rose-500/[0.06] px-3.5 py-2.5 text-[13.3px] text-rose-200/95"
          >{err}</motion.div>
        )}

        <div className="pt-2">
          <NudgelButton type="submit" loading={loading}>Create account</NudgelButton>
        </div>
      </form>
    </motion.div>
  );
}
