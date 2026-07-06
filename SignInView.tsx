import { useState } from "react";
import { motion } from "framer-motion";
import { Field } from "../ui/Field";
import { NudgelButton } from "../ui/ObButton";
import { useAuth } from "../../context/AuthContext";

export default function SignInView({ onForgot }: { onForgot: ()=>void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email || !password) { setErr("Enter your email and password."); return; }
    setLoading(true);
    try {
      await signIn(email.trim(), password, remember);
      // Don't manually setLoading(false) — successful signIn will
      // unmount this component (parent switches to Dashboard).
      // A safety timeout ensures loading clears even if something hangs.
      setTimeout(() => setLoading(false), 8000);
    } catch (e: any) {
      setErr(e.message || "Unable to sign in.");
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .52, ease: [0.25, 0.1, 0.25, 1] }}>
      <div className="mb-7">
        <div className="mono text-[11px] tracking-widest text-[#b8b1a7]">WELCOME BACK</div>
        <h2 className="display text-[32px] md:text-[36px] leading-[1.06] mt-2 text-[#f4efe7]">Sign in to Nudgel</h2>
        <p className="text-[14.4px] text-[#a49f97] mt-3">Enter your credentials to continue.</p>
      </div>

      <form onSubmit={submit} className="space-y-[14px]">
        <Field
          label="Email address"
          type="email"
          value={email}
          onChange={e=>setEmail(e.target.value)}
          autoComplete="email"
          error={err && !email ? err : undefined}
        />
        <Field
          label="Password"
          type={showPw ? "text" : "password"}
          value={password}
          onChange={e=>setPassword(e.target.value)}
          autoComplete="current-password"
          error={err && email && !password ? err : undefined}
          rightSlot={
            <button type="button" onClick={()=>setShowPw(v=>!v)} className="text-[11.7px] mono text-[#bbb5aa] hover:text-[#f0e8dc] px-1">
              {showPw ? "Hide" : "Show"}
            </button>
          }
        />

        <div className="flex items-center justify-between pt-[4px] pb-2 text-[13.7px]">
          <label className="flex items-center gap-[10px] cursor-pointer text-[#c9c4bc]">
            <input
              type="checkbox"
              checked={remember}
              onChange={e=>setRemember(e.target.checked)}
              className="peer sr-only"
            />
            <span className="h-[18px] w-[18px] rounded-[6px] border border-white/[0.18] bg-black/30 flex items-center justify-center peer-checked:bg-[#e9ddd0] peer-checked:border-[#e9ddd0] transition-all">
              {remember && (
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.8 6.1l2.2 2.2 4.2-4.6" stroke="#2a2116" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
            </span>
            Remember me
          </label>

          <button type="button" onClick={onForgot} className="text-[#cfc8bb] hover:text-[#f3ece2] transition-colors">
            Forgot password?
          </button>
        </div>

        {err && email && password && (
          <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }}
            className="rounded-[13px] border border-rose-300/22 bg-rose-500/[0.06] px-3.5 py-2.5 text-[13.3px] text-rose-200/95"
          >
            {err}
          </motion.div>
        )}

        <div className="pt-2">
          <NudgelButton type="submit" loading={loading}>Sign In</NudgelButton>
        </div>
      </form>
    </motion.div>
  );
}
