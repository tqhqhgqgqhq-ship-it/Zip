import { useState } from "react";
import { motion } from "framer-motion";
import { Field } from "../ui/Field";
import { NudgelButton } from "../ui/ObButton";
import { useAuth } from "../../context/AuthContext";

export default function ForgotView({
  onBack,
  onTokenVerified,
}: {
  onBack: () => void;
  onTokenVerified: (email: string, uid: string) => void;
}) {
  const { verifyRecoveryToken } = useAuth();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmedEmail = email.trim();
    const trimmedToken = token.trim();
    if (!trimmedEmail) return setErr("Enter your email.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return setErr("Enter a valid email address.");
    if (!trimmedToken) return setErr("Enter your recovery token.");
    setLoading(true);
    try {
      const { uid } = await verifyRecoveryToken(trimmedEmail, trimmedToken);
      onTokenVerified(trimmedEmail, uid);
    } catch (e: any) {
      setErr(e.message || "Invalid recovery token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.52, ease: [0.25, 0.1, 0.25, 1] }}>
      <div className="mb-6">
        <div className="mono text-[11px] tracking-widest text-[#b8b1a7]">ACCOUNT RECOVERY</div>
        <h2 className="display text-[30px] mt-2 text-[#f4efe7]">Recover with token</h2>
        <p className="text-[14px] text-[#a59f95] mt-2">
          Enter your email and the recovery token you saved when you signed up.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <div>
          <Field
            label="Recovery token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="NUDGEL-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            style={{ fontFamily: "monospace", letterSpacing: "1.5px" }}
          />
          <p className="text-[11.5px] text-[#857f74] mt-1.5 ml-1">
            Format: <span className="mono text-[#c9c4bc]">NUDGEL-XXXX-XXXX-XXXX</span>
          </p>
        </div>

        {err && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-[13px] border border-rose-300/22 bg-rose-500/[0.06] px-3.5 py-2.5 text-[13.3px] text-rose-200/95"
          >{err}</motion.div>
        )}

        <NudgelButton type="submit" loading={loading}>Verify Recovery Token</NudgelButton>
      </form>

      <div className="pt-6 text-center">
        <button onClick={onBack} className="text-[14px] text-[#d3cdc3] hover:text-white transition-colors">← Back to sign in</button>
      </div>
    </motion.div>
  );
}
