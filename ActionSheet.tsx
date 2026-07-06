import { AnimatePresence, motion } from 'framer-motion';

type ActionItem = {
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  items: ActionItem[];
};

export default function ActionSheet({ isOpen, onClose, title, items }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.6 }}
            className="fixed bottom-0 left-0 right-0 z-[91] pb-8 px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="rounded-[26px] overflow-hidden"
              style={{
                background: 'linear-gradient(180deg, rgba(28,24,20,0.97), rgba(18,15,12,0.98))',
                border: '1px solid rgba(255,243,210,0.13)',
                boxShadow: '0 -8px 48px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,248,224,0.10)',
              }}
            >
              {/* Top drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-[3.5px] rounded-full" style={{ background: 'rgba(255,243,210,0.22)' }} />
              </div>

              {title && (
                <div className="px-5 pt-1 pb-3">
                  <span className="text-[12px] font-semibold text-[#9E968A] mono tracking-wide uppercase">
                    {title}
                  </span>
                </div>
              )}

              <div className="pb-2">
                {items.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => { item.onClick(); onClose(); }}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors duration-150 active:bg-white/[0.04] hover:bg-white/[0.03]"
                    style={{
                      borderTop: i > 0 ? '1px solid rgba(255,243,210,0.07)' : undefined,
                    }}
                  >
                    {item.icon && (
                      <span className={item.destructive ? 'text-rose-400' : 'text-[#D4A853]'}>
                        {item.icon}
                      </span>
                    )}
                    <span
                      className={`text-[15px] font-semibold ${
                        item.destructive ? 'text-rose-400' : 'text-[#F3EADB]'
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cancel button */}
            <button
              onClick={onClose}
              className="mt-2.5 w-full py-4 rounded-[22px] text-[15px] font-bold text-[#F3EADB] active:bg-white/[0.04]"
              style={{
                background: 'linear-gradient(180deg, rgba(28,24,20,0.97), rgba(18,15,12,0.98))',
                border: '1px solid rgba(255,243,210,0.10)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              }}
            >
              Cancel
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
