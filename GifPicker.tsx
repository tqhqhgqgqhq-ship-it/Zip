import { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion } from "framer-motion";

/* ══════════════════════════════════════════════════════════════════
   GIF PROVIDERS
   Primary  : Tenor v1 — public demo key still active, CORS enabled
   Fallback : GIPHY   — works if you add your own key below
   ══════════════════════════════════════════════════════════════════ */
const TENOR_KEY = "LIVDSRZULELA";           // Tenor v1 public demo key
const GIPHY_KEY = "";                        // optional: your own GIPHY key

interface GifResult {
  id: string;
  title: string;
  url: string;           // full .gif URL to send
  preview: string;       // smaller preview for the grid
  width: number;
  height: number;
}

/* ── Tenor v1 parsing ── */
function parseTenor(results: any[]): GifResult[] {
  return (results || []).map((r) => {
    const media = Array.isArray(r.media) ? r.media[0] : undefined;
    const full = media?.gif ?? media?.mediumgif ?? media?.tinygif;
    const tiny = media?.tinygif ?? media?.nanogif ?? media?.gif;
    return {
      id: String(r.id),
      title: r.content_description || r.h1_title || "",
      url: full?.url ?? "",
      preview: tiny?.url ?? full?.url ?? "",
      width: tiny?.dims?.[0] ?? 100,
      height: tiny?.dims?.[1] ?? 100,
    };
  }).filter((g) => g.url && g.preview);
}

/* ── GIPHY parsing (fallback) ── */
function parseGiphy(data: any[]): GifResult[] {
  return (data || []).map((g) => ({
    id: g.id,
    title: g.title || "",
    url: g.images?.original?.url ?? g.images?.fixed_height?.url ?? "",
    preview: g.images?.fixed_width_small?.url ?? g.images?.fixed_width?.url ?? "",
    width: parseInt(g.images?.fixed_width_small?.width ?? "100", 10),
    height: parseInt(g.images?.fixed_width_small?.height ?? "100", 10),
  })).filter((g) => g.url && g.preview);
}

async function tenorFetch(path: string): Promise<GifResult[]> {
  const r = await fetch(`https://g.tenor.com/v1/${path}&key=${TENOR_KEY}&limit=30&media_filter=minimal&contentfilter=medium`);
  if (!r.ok) throw new Error(`tenor ${r.status}`);
  const json = await r.json();
  const parsed = parseTenor(json.results);
  if (parsed.length === 0 && !json.results) throw new Error("tenor empty response");
  return parsed;
}

async function giphyFetch(path: string): Promise<GifResult[]> {
  if (!GIPHY_KEY) throw new Error("no giphy key");
  const r = await fetch(`https://api.giphy.com/v1/gifs/${path}&api_key=${GIPHY_KEY}&limit=30&rating=pg`);
  if (!r.ok) throw new Error(`giphy ${r.status}`);
  const json = await r.json();
  if (!Array.isArray(json.data)) throw new Error("giphy bad response");
  return parseGiphy(json.data);
}

async function fetchTrending(): Promise<GifResult[]> {
  try {
    return await tenorFetch(`trending?_=1`);
  } catch {
    return await giphyFetch(`trending?_=1`);
  }
}

async function searchGifs(q: string): Promise<GifResult[]> {
  if (!q.trim()) return fetchTrending();
  try {
    return await tenorFetch(`search?q=${encodeURIComponent(q)}`);
  } catch {
    return await giphyFetch(`search?q=${encodeURIComponent(q)}`);
  }
}

/* ── Single GIF tile ── */
const GifTile = memo(({ gif, onSelect }: { gif: GifResult; onSelect: (gif: GifResult) => void }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={() => onSelect(gif)}
      className="relative overflow-hidden rounded-[10px] w-full cursor-pointer"
      style={{ aspectRatio: gif.width ? `${gif.width}/${gif.height}` : "1/1", background: "rgba(255,255,255,0.04)" }}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-white/[0.04] animate-pulse rounded-[10px]" />
      )}
      <img
        src={gif.preview}
        alt={gif.title}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className="w-full h-full object-cover rounded-[10px] transition-opacity duration-200"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </motion.button>
  );
});

/* ── Main GIF Picker Panel ── */
interface GifPickerProps {
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
}

export type { GifResult };

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(false);
    try {
      const results = await (q.trim() ? searchGifs(q) : fetchTrending());
      setGifs(results);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    load("");
    setTimeout(() => inputRef.current?.focus(), 120);
  }, [load]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query), 340);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, load]);

  // Split into 2 balanced columns (masonry-like)
  const col1: GifResult[] = [];
  const col2: GifResult[] = [];
  gifs.forEach((g, i) => (i % 2 === 0 ? col1 : col2).push(g));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      className="absolute left-0 right-0 bottom-full mb-2 rounded-[22px] overflow-hidden flex flex-col z-50 mx-1"
      style={{
        height: 340,
        background: "linear-gradient(180deg, #131316 0%, #0A0A0D 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 -12px 40px rgba(0,0,0,0.7), 0 2px 0 rgba(255,255,255,0.04) inset",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 pt-3 pb-2">
        {/* Search bar */}
        <div className="flex-1 flex items-center gap-2 rounded-[14px] px-3 py-2"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs…"
            className="flex-1 bg-transparent text-[13px] text-white/80 placeholder-white/30 outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-white/30 hover:text-white/60 transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors flex-shrink-0"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Label */}
      <div className="flex-shrink-0 px-3 pb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">
          {query.trim() ? `Results for "${query}"` : "Trending GIFs"}
        </span>
      </div>

      {/* GIF grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 scroll-smooth" style={{ scrollbarWidth: "none" }}>
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-[10px] bg-white/[0.04] animate-pulse" style={{ height: i % 3 === 0 ? 100 : i % 3 === 1 ? 80 : 120 }} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            <span className="text-[12px]">Failed to load GIFs</span>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/30">
            <span className="text-[12px]">No GIFs found</span>
          </div>
        ) : (
          <div className="flex gap-2">
            {/* Column 1 */}
            <div className="flex-1 flex flex-col gap-2">
              {col1.map((g) => <GifTile key={g.id} gif={g} onSelect={onSelect} />)}
            </div>
            {/* Column 2 */}
            <div className="flex-1 flex flex-col gap-2">
              {col2.map((g) => <GifTile key={g.id} gif={g} onSelect={onSelect} />)}
            </div>
          </div>
        )}
      </div>

      {/* Powered by GIPHY badge */}
      <div className="flex-shrink-0 flex justify-end px-3 pb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/15">Powered by GIPHY</span>
      </div>
    </motion.div>
  );
}
