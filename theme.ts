/* ════════════════════════════════════════════════════════════════
   THEME SYSTEM
   Applies an app-wide theme by setting `data-theme` on the document
   root. CSS variables (see index.css) react to it instantly.
   Default theme is "gold" (Gold Luxe).
   ════════════════════════════════════════════════════════════════ */

export type ThemeId = "obsidian" | "midnight" | "volcanic" | "gold";

export const DEFAULT_THEME: ThemeId = "gold";
const STORAGE_KEY = "glimmer-theme";

export const THEMES: { id: ThemeId; label: string; swatch: [string, string, string] }[] = [
  { id: "gold",     label: "Gold Luxe", swatch: ["#1A1408", "#0F0B05", "#080503"] },
  { id: "obsidian", label: "Obsidian",  swatch: ["#0A0A0A", "#050505", "#000000"] },
  { id: "midnight", label: "Midnight",  swatch: ["#0A0A1A", "#06061A", "#020210"] },
  { id: "volcanic", label: "Volcanic",  swatch: ["#180C08", "#0E0604", "#050201"] },
];

export function getTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId) {
  try {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* ignore */ }
}

/** Apply the saved (or default) theme. Call once at startup. */
export function initTheme(): ThemeId {
  const theme = getTheme();
  try {
    document.documentElement.setAttribute("data-theme", theme);
  } catch { /* ignore */ }
  return theme;
}
