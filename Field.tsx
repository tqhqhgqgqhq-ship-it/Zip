import { useState, InputHTMLAttributes } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../utils/cn";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  rightSlot?: React.ReactNode;
};

export function Field({ label, error, rightSlot, className, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = !!props.value || !!props.defaultValue;

  return (
    <div className="relative">
      <div
        className={cn(
          "relative rounded-[17px] transition-all duration-300",
          "bg-[#101016]/95 border",
          focused
            ? "border-[#ddd7cc]/35 shadow-[0_0_36px_rgba(236,230,217,0.061), inset_0_1px_0_rgba(255,255,255,0.077)]"
            : "border-white/[0.089]",
          error && "border-rose-400/60 shadow-[0_0_22px_rgba(244,63,94,0.10)] shake",
          className
        )}
      >
        <div className="absolute top-0 left-[18px] right-[18px] h-px bg-gradient-to-r from-transparent via-white/[0.22] to-transparent pointer-events-none" />
        <label
          className={cn(
            "absolute left-[19px] pointer-events-none transition-all duration-200 mono",
            focused || hasValue
              ? "top-[9px] text-[10.5px] tracking-widest uppercase text-[#c9c4bc]"
              : "top-[19px] text-[13.8px] text-[#928d86]"
          )}
        >
          {label}
        </label>
        <input
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
          className={cn(
            "w-full bg-transparent outline-none text-[15.5px] text-[#f3ede4] placeholder-[#807b74]",
            "pt-[28px] pb-[14px] px-[19px]",
            rightSlot && "pr-[52px]"
          )}
          {...props}
        />
        {rightSlot && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mono text-[11.5px] text-rose-300/95 mt-[10px] ml-1"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
