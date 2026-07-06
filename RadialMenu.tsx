'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface RadialMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface RadialMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: RadialMenuItem[];
}

const MENU_RADIUS = 110;

export function RadialMenu({ isOpen, onClose, items }: RadialMenuProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Calculate positions for items in a semi-circle (top half)
  const getItemPosition = (index: number, total: number) => {
    const angleStep = Math.PI / (total + 1);
    const angle = Math.PI - angleStep * (index + 1);
    const x = MENU_RADIUS * Math.cos(angle);
    const y = -MENU_RADIUS * Math.sin(angle);
    return { x, y };
  };

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60]"
            onClick={onClose}
          />

          {/* Radial menu container */}
          <div
            className="fixed z-[61] flex items-center justify-center"
            style={{
              bottom: 80,
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          >
            {/* Menu items */}
            {items.map((item, i) => {
              const pos = getItemPosition(i, items.length);
              return (
                <motion.button
                  key={item.id}
                  initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    x: pos.x,
                    y: pos.y,
                  }}
                  exit={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 22,
                    delay: i * 0.04,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    item.onClick();
                    onClose();
                  }}
                  className="absolute flex flex-col items-center gap-1.5 cursor-pointer group"
                  style={{
                    width: 72,
                    height: 72,
                  }}
                >
                  {/* Icon circle */}
                  <div
                    className="w-[56px] h-[56px] rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, rgba(42,42,50,0.92) 0%, rgba(20,20,26,0.92) 100%)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      boxShadow: '0 6px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
                      backdropFilter: 'blur(12px)',
                      color: 'rgba(255,255,255,0.9)',
                    }}
                  >
                    {item.icon}
                  </div>
                  {/* Label */}
                  <span
                    className="text-[10px] font-bold tracking-wide"
                    style={{
                      color: 'rgba(255,255,255,0.75)',
                      textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                    }}
                  >
                    {item.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

export default RadialMenu;
