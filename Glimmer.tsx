import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import {
  askGlimmer as runGlimmerSearch,
  getGlimmerWorld,
  type GlimmerWorld,
  type MemoryCard,
} from "../lib/glimmer";

/*
  Glimmer is a local memory companion, not a chatbot.
  The UI below treats it as a quiet intelligence layer: a persistent lens
  that expands into a composed memory workspace. The expansion uses only
  compositor-friendly clip-path / opacity / transform animation.
*/

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const PRESS = { type: "spring" as const, stiffness: 520, damping: 32, mass: 0.75 };
const LIQUID = { type: "spring" as const, stiffness: 94, damping: 22, mass: 1.22, restDelta: 0.35 };

type Surface = "home" | "chat";
type Presence = "lens" | "expanded";
type Phase = "ready" | "searching" | "available";
type OriginRect = { top: number; left: number; width: number; height: number };

function formatCount(n: number) {
  if (n === 0) return "No matches";
  if (n === 1) return "1 memory";
  return `${n} memories`;
}

function clampText(text: string, max = 150) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/* ════════════════════════════════════════════════════════════════
   MARK / PRESENCE
   ════════════════════════════════════════════════════════════════ */
function GlimmerMark({ active = false, size = 34 }: { active?: boolean; size?: number }) {
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
      }}
    >
      {active && (
        <motion.span
          className="absolute rounded-full"
          style={{
            inset: -4,
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(244,220,168,0.78) 70deg, transparent 135deg)",
            filter: "blur(1.5px)",
            willChange: "transform",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
        />
      )}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 34% 26%, rgba(255,249,232,0.96) 0%, rgba(224,190,122,0.78) 42%, rgba(132,94,36,0.62) 100%)",
          boxShadow:
            "inset 0 1px 1px rgba(255,255,255,0.65), inset 0 -5px 10px rgba(68,42,12,0.42), 0 10px 26px rgba(0,0,0,0.38)",
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          width: size * 0.42,
          height: size * 0.22,
          top: size * 0.14,
          left: size * 0.18,
          background: "radial-gradient(ellipse, rgba(255,255,255,0.82) 0%, transparent 72%)",
          filter: "blur(1px)",
        }}
      />
      <span className="relative text-[#211708] font-black" style={{ fontSize: size * 0.38, letterSpacing: "-0.05em" }}>
        G
      </span>
    </span>
  );
}

function MicroParticles() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 2.5,
            height: 2.5,
            left: 22 + i * 7,
            top: 24,
            background: "rgba(245,223,178,0.7)",
            filter: "blur(0.4px)",
            willChange: "transform, opacity",
          }}
          animate={{ y: [0, -18, 0], x: [0, i === 1 ? 7 : -5, 0], opacity: [0, 0.7, 0] }}
          transition={{ duration: 3.6 + i * 0.4, repeat: Infinity, delay: i * 0.55, ease: "easeInOut" }}
        />
      ))}
    </>
  );
}

export function GlimmerOrb({ surface }: { surface: Surface }) {
  const { user } = useAuth();
  const [presence, setPresence] = useState<Presence>("lens");
  const [origin, setOrigin] = useState<OriginRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!user) return null;

  const open = () => {
    const node = triggerRef.current;
    const parent = node?.offsetParent as HTMLElement | null;
    if (node && parent) {
      const a = node.getBoundingClientRect();
      const b = parent.getBoundingClientRect();
      setOrigin({ top: a.top - b.top, left: a.left - b.left, width: a.width, height: a.height });
      setPresence("expanded");
    }
  };

  return (
    <>
      <motion.button
        ref={triggerRef}
        aria-label="Open Glimmer"
        onClick={open}
        className="absolute right-4 bottom-[86px] z-[80] flex items-center justify-center overflow-visible select-none"
        style={{
          width: 54,
          height: 54,
          borderRadius: 999,
          background: "rgba(18,14,10,0.72)",
          border: "1px solid rgba(245,222,174,0.22)",
          boxShadow:
            "inset 0 1px 0 rgba(255,244,214,0.18), 0 14px 34px rgba(0,0,0,0.42)",
          backdropFilter: "blur(18px) saturate(150%)",
          WebkitBackdropFilter: "blur(18px) saturate(150%)",
          opacity: presence === "expanded" ? 0 : 1,
          pointerEvents: presence === "expanded" ? "none" : "auto",
          willChange: "transform, opacity",
          transform: "translateZ(0)",
        }}
        animate={{ scale: presence === "expanded" ? 0.9 : [1, 1.035, 1] }}
        transition={presence === "expanded" ? { duration: 0.18, ease: EASE } : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        whileTap={{ scale: 0.9 }}
      >
        <MicroParticles />
        <GlimmerMark size={31} />
      </motion.button>

      <AnimatePresence>
        {presence === "expanded" && origin && (
          <GlimmerWorkspace
            key="glimmer-workspace"
            origin={origin}
            surface={surface}
            onClose={() => setPresence("lens")}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   WORKSPACE SHELL
   ════════════════════════════════════════════════════════════════ */
function GlimmerWorkspace({ origin, surface, onClose }: { origin: OriginRect; surface: Surface; onClose: () => void }) {
  const { user } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [bounds, setBounds] = useState<{ w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [query, setQuery] = useState("");
  const [headline, setHeadline] = useState("Consult your memories");
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [world, setWorld] = useState<GlimmerWorld | null>(null);
  const [fieldActive, setFieldActive] = useState(false);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setBounds({ w: r.width, h: r.height });
  }, []);

  useEffect(() => {
    if (!user || surface !== "home") return;
    getGlimmerWorld(user.uid).then(setWorld).catch(() => undefined);
  }, [surface, user]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 980);
    return () => clearTimeout(t);
  }, []);

  const status = phase === "searching" ? "Searching memories" : phase === "available" ? "Memory available" : "Ready";

  const ask = async () => {
    if (!user || !query.trim() || phase === "searching") return;
    setPhase("searching");
    setCards([]);
    setHeadline("Discovering connections");

    const started = performance.now();
    let result;
    try {
      result = await runGlimmerSearch(user.uid, query.trim());
    } catch {
      result = { found: false, headline: "Nothing surfaced yet.", cards: [] as MemoryCard[] };
    }
    const remaining = Math.max(0, 1850 - (performance.now() - started));
    await new Promise((resolve) => setTimeout(resolve, remaining));
    setHeadline(result.found ? result.headline : "No memory matched this moment.");
    setCards(result.cards);
    setPhase("available");
  };

  const submit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ask();
    }
  };

  const clip = useMemo(() => {
    if (!bounds) return null;
    const start = `inset(${origin.top}px ${bounds.w - origin.left - origin.width}px ${bounds.h - origin.top - origin.height}px ${origin.left}px round 999px)`;
    const final = surface === "home"
      ? "inset(0px 0px 0px 0px round 42px)"
      : `inset(${Math.round(bounds.h * 0.36)}px 0px 0px 0px round 42px 42px 28px 28px)`;
    return { start, final };
  }, [bounds, origin, surface]);

  if (!bounds || !clip) return <div ref={rootRef} className="absolute inset-0 z-[95] pointer-events-none" />;

  return (
    <div ref={rootRef} className="absolute inset-0 z-[95]">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: surface === "chat" ? 0.34 : 0.62 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.42, ease: EASE }}
        style={{ background: "rgba(5,4,3,0.62)", willChange: "opacity", transform: "translateZ(0)" }}
        onClick={onClose}
      />

      <motion.section
        className="absolute inset-0 overflow-hidden"
        initial={{ clipPath: clip.start }}
        animate={{ clipPath: clip.final }}
        exit={{ clipPath: clip.start, opacity: 0 }}
        transition={{ clipPath: LIQUID, opacity: { duration: 0.22 } }}
        style={{
          background:
            "linear-gradient(180deg, rgba(23,19,14,0.98) 0%, rgba(9,8,6,0.99) 72%), radial-gradient(ellipse at 20% 0%, rgba(244,220,168,0.1), transparent 52%)",
          boxShadow:
            "inset 0 0 0 1px rgba(247,226,185,0.18), inset 0 1px 0 rgba(255,255,255,0.08), 0 28px 80px rgba(0,0,0,0.58)",
          willChange: "clip-path, opacity",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        <Reflection active={phase === "searching"} />

        <motion.div
          className="flex h-full min-h-0 flex-col"
          initial="hidden"
          animate="show"
          exit="hidden"
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { delay: 0.42, staggerChildren: 0.085 } },
          }}
        >
          <Header status={status} phase={phase} onClose={onClose} />

          <motion.main
            variants={softItem}
            className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 scroll-area"
            style={{ transform: "translateZ(0)" }}
          >
            <IntelligenceOverview
              surface={surface}
              phase={phase}
              query={query}
              headline={headline}
              cards={cards}
              world={world}
            />
          </motion.main>

          <motion.footer variants={softItem} className="shrink-0 px-5 pb-5 pt-2">
            <SearchField
              ref={inputRef}
              value={query}
              active={fieldActive}
              phase={phase}
              onFocus={() => setFieldActive(true)}
              onBlur={() => setFieldActive(false)}
              onChange={setQuery}
              onKeyDown={submit}
              onAsk={ask}
              surface={surface}
            />
          </motion.footer>
        </motion.div>
      </motion.section>
    </div>
  );
}

const softItem = {
  hidden: { opacity: 0, y: 10, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.58, ease: EASE } },
};

function Reflection({ active }: { active: boolean }) {
  return (
    <>
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 h-36"
        style={{ background: "linear-gradient(180deg, rgba(255,245,220,0.12), transparent)", willChange: "opacity" }}
        animate={{ opacity: active ? [0.35, 0.75, 0.35] : 0.42 }}
        transition={{ duration: 2.4, repeat: active ? Infinity : 0, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -left-1/4 top-0 h-full w-1/2 rotate-12"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,244,218,0.08), transparent)",
          willChange: "transform, opacity",
          transform: "translateZ(0)",
        }}
        animate={{ x: active ? ["-20%", "240%"] : "-20%", opacity: active ? [0, 1, 0] : 0 }}
        transition={{ duration: 2.1, repeat: active ? Infinity : 0, ease: EASE }}
      />
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   HEADER
   ════════════════════════════════════════════════════════════════ */
function Header({ status, phase, onClose }: { status: string; phase: Phase; onClose: () => void }) {
  return (
    <motion.header variants={softItem} className="shrink-0 px-6 pb-4 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <GlimmerMark active={phase === "searching"} size={34} />
          <div className="min-w-0">
            <div className="text-[20px] font-semibold tracking-[-0.03em] text-[#F3EADB] leading-none">Glimmer</div>
            <div className="mt-1 flex items-center gap-2 text-[11.5px] font-medium text-[#948872]">
              <motion.span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: phase === "searching" ? "#E8C978" : phase === "available" ? "#B9D79C" : "#9E8A5B" }}
                animate={phase === "searching" ? { scale: [1, 1.45, 1], opacity: [0.55, 1, 0.55] } : { scale: 1, opacity: 0.8 }}
                transition={{ duration: 1.7, repeat: phase === "searching" ? Infinity : 0, ease: "easeInOut" }}
              />
              {status}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full text-[#BCA879]"
          style={{ background: "rgba(255,246,220,0.045)", border: "1px solid rgba(255,246,220,0.07)" }}
          aria-label="Close Glimmer"
        >
          <span className="text-[18px] leading-none">×</span>
        </button>
      </div>
    </motion.header>
  );
}

/* ════════════════════════════════════════════════════════════════
   SEARCH FIELD
   ════════════════════════════════════════════════════════════════ */
type SearchFieldProps = {
  value: string;
  active: boolean;
  phase: Phase;
  surface: Surface;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onAsk: () => void;
};

const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  function SearchFieldInner(
    { value, active, phase, surface, onFocus, onBlur, onChange, onKeyDown, onAsk },
    ref,
  ) {
    return (
      <motion.div
        className="relative overflow-hidden rounded-[26px]"
        animate={{ y: active ? -2 : 0 }}
        transition={PRESS}
        style={{
          background: active ? "rgba(255,248,232,0.085)" : "rgba(255,248,232,0.055)",
          border: active ? "1px solid rgba(238,205,138,0.38)" : "1px solid rgba(238,205,138,0.18)",
          boxShadow: active
            ? "0 18px 42px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.13)"
            : "0 10px 28px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)",
          transform: "translateZ(0)",
          willChange: "transform",
        }}
      >
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(circle at 15% 0%, rgba(255,245,218,0.14), transparent 40%)" }}
          animate={{ opacity: active ? 1 : 0.45 }}
        />
        <div className="relative flex h-[64px] items-center gap-3 px-4">
          <div className="h-6 w-px rounded-full" style={{ background: active ? "rgba(238,205,138,0.54)" : "rgba(238,205,138,0.22)" }} />
          <input
            ref={ref}
            value={value}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={surface === "chat" ? "Search this conversation’s memory" : "Search across your memories"}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium tracking-[-0.01em] text-[#F3EADB] outline-none placeholder:text-[#7E735F] caret-[#E7C571]"
          />
          <motion.button
            onClick={onAsk}
            disabled={!value.trim() || phase === "searching"}
            whileTap={{ scale: 0.92 }}
            whileHover={{ y: -1 }}
            transition={PRESS}
            className="h-10 rounded-full px-4 text-[12px] font-semibold tracking-[-0.01em] text-[#1D1406] disabled:pointer-events-none"
            style={{
              opacity: !value.trim() || phase === "searching" ? 0.45 : 1,
              background: "linear-gradient(180deg, #F4E0A6 0%, #D1A94F 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 8px 18px rgba(0,0,0,0.35)",
            }}
          >
            Ask
          </motion.button>
        </div>
      </motion.div>
    );
  },
);

/* ════════════════════════════════════════════════════════════════
   MAIN CONTENT
   ════════════════════════════════════════════════════════════════ */
function IntelligenceOverview({
  surface,
  phase,
  query,
  headline,
  cards,
  world,
}: {
  surface: Surface;
  phase: Phase;
  query: string;
  headline: string;
  cards: MemoryCard[];
  world: GlimmerWorld | null;
}) {
  if (phase === "searching") return <Processing />;
  if (phase === "available") return <Results query={query} headline={headline} cards={cards} />;
  if (surface === "chat") return <ChatReady />;
  return <HomeWorkspace world={world} />;
}

function Processing() {
  return (
    <div className="grid min-h-[340px] place-items-center">
      <div className="relative grid place-items-center">
        <motion.div
          className="absolute h-48 w-48 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(235,204,143,0.12), transparent 68%)", willChange: "transform, opacity" }}
          animate={{ scale: [0.86, 1.08, 0.86], opacity: [0.35, 0.75, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <GlimmerMark active size={58} />
      </div>
    </div>
  );
}

function Results({ query, headline, cards }: { query: string; headline: string; cards: MemoryCard[] }) {
  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.48, ease: EASE }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8F826B]">Inquiry</div>
        <div className="mt-2 text-[20px] font-semibold leading-tight tracking-[-0.04em] text-[#F3EADB]">{query}</div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.16, duration: 0.48 }}>
        <div className="text-[13px] font-medium text-[#CDBD98]">{headline}</div>
        <div className="mt-1 text-[11.5px] text-[#817662]">{formatCount(cards.length)}</div>
      </motion.div>

      {cards.length === 0 ? <EmptyState /> : <div className="space-y-3.5">{cards.map((card, i) => <MemoryObject key={card.id} card={card} index={i} />)}</div>}
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...PRESS, delay: 0.12 }}
      className="rounded-[28px] p-6 text-center"
      style={{ background: "rgba(255,248,232,0.035)", border: "1px solid rgba(255,248,232,0.08)" }}
    >
      <div className="mx-auto mb-4 h-10 w-10 rounded-full" style={{ background: "radial-gradient(circle, rgba(226,198,140,0.26), rgba(226,198,140,0.04))" }} />
      <div className="text-[16px] font-semibold tracking-[-0.03em] text-[#F3EADB]">No memory matched this moment.</div>
      <p className="mx-auto mt-2 max-w-[260px] text-[12.5px] leading-relaxed text-[#8F826B]">Try a name, a place, a promise, or a specific word you remember saying.</p>
    </motion.div>
  );
}

function MemoryObject({ card, index }: { card: MemoryCard; index: number }) {
  const label = card.tone === "emotional" ? "important" : card.tone === "funny" ? "warm" : "memory";
  return (
    <motion.article
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -2 }}
      transition={{ ...PRESS, delay: 0.08 + index * 0.06 }}
      className="group relative overflow-hidden rounded-[28px] p-5"
      style={{
        background: "linear-gradient(180deg, rgba(255,250,238,0.07), rgba(255,250,238,0.028))",
        border: "1px solid rgba(255,244,215,0.1)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 14px 34px rgba(0,0,0,0.36)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E8CC8A]/40 to-transparent" />
      <div className="flex items-center justify-between gap-4">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#9B8F77]">{label}</div>
        <div className="text-[11px] font-medium text-[#8B7E67]">{card.dateLabel}</div>
      </div>
      <blockquote className="mt-4 text-[16px] font-medium leading-[1.42] tracking-[-0.025em] text-[#F2E7D2]">“{card.text}”</blockquote>
      {card.context && <p className="mt-4 text-[12px] leading-relaxed text-[#8F826B]">Context: {clampText(card.context, 130)}</p>}
      <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-[#241808]" style={{ background: "linear-gradient(180deg, #F2DFA9, #B89141)" }}>{card.withName.charAt(0).toUpperCase()}</div>
          <div className="min-w-0 text-[12px] text-[#9D917A]">Conversation with <span className="font-semibold text-[#CBBB93]">{card.withName}</span></div>
        </div>
        <div className="h-1.5 w-1.5 rounded-full bg-[#D6B76B]/70" />
      </div>
    </motion.article>
  );
}

function ChatReady() {
  return (
    <div className="flex min-h-[340px] flex-col justify-center">
      <div className="max-w-[310px]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8F826B]">Context lens</div>
        <h2 className="mt-3 text-[30px] font-semibold leading-[0.98] tracking-[-0.06em] text-[#F3EADB]">Search the conversation without leaving it.</h2>
        <p className="mt-4 text-[13px] leading-relaxed text-[#92856E]">Ask for a topic, person, date, or feeling. Glimmer will surface the closest memory from this thread.</p>
      </div>
    </div>
  );
}

function HomeWorkspace({ world }: { world: GlimmerWorld | null }) {
  if (!world) return <div className="h-[420px]" />;
  return (
    <div className="space-y-8 pb-3">
      <HeroWorld world={world} />
      <MemorySection title="Memory timeline" cards={world.timeline.slice(0, 5)} empty="Recent conversations will gather here." />
      <MemorySection title="Important moments" cards={world.important.slice(0, 4)} empty="Meaningful messages will surface here." />
      <MemorySection title="Light moments" cards={world.funny.slice(0, 4)} empty="Warm and playful memories will appear here." />
      <Connections cards={world.friendship} />
    </div>
  );
}

function HeroWorld({ world }: { world: GlimmerWorld }) {
  const count = world.timeline.length;
  return (
    <div className="pt-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8F826B]">Memory workspace</div>
      <h2 className="mt-3 text-[38px] font-semibold leading-[0.94] tracking-[-0.075em] text-[#F4EBD9]">Your conversations, organized quietly.</h2>
      <p className="mt-4 max-w-[330px] text-[13px] leading-relaxed text-[#92856E]">Glimmer searches what already exists. It does not generate memories. It helps you find them.</p>
      <div className="mt-6 flex gap-2">
        <Pill label={`${count} recent`} />
        <Pill label={`${world.friendship.length} connections`} />
      </div>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return <span className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-[#BDAA80]" style={{ background: "rgba(255,248,232,0.05)", border: "1px solid rgba(255,248,232,0.08)" }}>{label}</span>;
}

function MemorySection({ title, cards, empty }: { title: string; cards: MemoryCard[]; empty: string }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#CDBD98]">{title}</h3>
        <span className="text-[11px] text-[#766B59]">{cards.length ? formatCount(cards.length) : "Empty"}</span>
      </div>
      {cards.length ? <div className="space-y-3">{cards.map((c, i) => <MemoryObject key={c.id} card={c} index={i} />)}</div> : <p className="rounded-[22px] p-4 text-[12.5px] text-[#8F826B]" style={{ background: "rgba(255,248,232,0.035)", border: "1px solid rgba(255,248,232,0.07)" }}>{empty}</p>}
    </section>
  );
}

function Connections({ cards }: { cards: MemoryCard[] }) {
  return (
    <section>
      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#CDBD98]">Friendship highlights</h3>
      <div className="flex gap-3 overflow-x-auto scroll-x pb-1">
        {cards.length ? cards.map((c, i) => (
          <motion.div key={`${c.withName}-${i}`} whileHover={{ y: -2 }} transition={PRESS} className="w-[164px] shrink-0 rounded-[24px] p-4" style={{ background: "rgba(255,248,232,0.05)", border: "1px solid rgba(255,248,232,0.08)" }}>
            <div className="grid h-9 w-9 place-items-center rounded-full text-[12px] font-semibold text-[#241808]" style={{ background: "linear-gradient(180deg, #F2DFA9, #B89141)" }}>{c.withName.charAt(0).toUpperCase()}</div>
            <div className="mt-3 truncate text-[13px] font-semibold text-[#F3EADB]">{c.withName}</div>
            <p className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-[#8F826B]">{clampText(c.text, 86)}</p>
          </motion.div>
        )) : <p className="text-[12.5px] text-[#8F826B]">Connection highlights will appear as conversations grow.</p>}
      </div>
    </section>
  );
}