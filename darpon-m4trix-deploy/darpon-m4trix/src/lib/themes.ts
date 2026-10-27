// ============================================================
// darpon.m4trix — Sistema temi colore
// 16 temi che ridisegnano l'intero sito tramite CSS variables.
// ============================================================

export type ThemeDef = {
  id: string
  name: string
  primary: string // colore principale (bottoni, accenti)
}

export const THEMES: ThemeDef[] = [
  { id: 'bosco', name: 'Bosco', primary: '#2e7d5b' },
  { id: 'mare', name: 'Mare', primary: '#0f8a8a' },
  { id: 'cielo', name: 'Cielo', primary: '#2f7fb8' },
  { id: 'notte', name: 'Notte', primary: '#3b5488' },
  { id: 'lavanda', name: 'Lavanda', primary: '#7c6bb8' },
  { id: 'viola', name: 'Viola', primary: '#8e4fa8' },
  { id: 'fucsia', name: 'Fucsia', primary: '#c2439a' },
  { id: 'rosa', name: 'Rosa', primary: '#d96a93' },
  { id: 'ciliegia', name: 'Ciliegia', primary: '#c94f4f' },
  { id: 'terracotta', name: 'Terracotta', primary: '#c96b4a' },
  { id: 'arancio', name: 'Arancio', primary: '#d97e35' },
  { id: 'miele', name: 'Miele', primary: '#b8860b' },
  { id: 'lime', name: 'Lime', primary: '#6f9a2a' },
  { id: 'menta', name: 'Menta', primary: '#2ba38a' },
  { id: 'caffe', name: 'Caffè', primary: '#8a6248' },
  { id: 'ardesia', name: 'Ardesia', primary: '#64707d' },
]

export const DEFAULT_THEME_ID = 'bosco'

// ---------- helper colori ----------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Mescola due colori hex. t=0 → a, t=1 → b */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ---------- variabili CSS per tema ----------

export type CssVars = Record<string, string>

/** Calcola tutte le CSS variables di un tema (usato da client e script anti-FOUC). */
export function themeVars(themeId: string): CssVars {
  const t = THEMES.find(x => x.id === themeId) ?? THEMES[0]
  const p = t.primary
  const deep = mix(p, '#000000', 0.24) // versione scura per testi/gradienti
  return {
    '--primary': p,
    '--ring': p,
    '--primary-strong': deep,
    '--primary-soft': mix(p, '#ffffff', 0.88),
    '--site-bg': mix('#f6f1e7', p, 0.055),
    '--site-blob': rgba(p, 0.32),
    '--site-blob-2': rgba(deep, 0.2),
    '--accent': mix(p, '#ffffff', 0.9),
  }
}

/** Mappa { themeId: vars } precalcolata per lo script anti-FOUC. */
export const THEME_VARS_MAP: Record<string, CssVars> = Object.fromEntries(
  THEMES.map(t => [t.id, themeVars(t.id)])
)

// ---------- applicazione lato client ----------

export const ACCENT_STORAGE_KEY = 'mf_accent'

export function applyTheme(themeId: string) {
  if (typeof document === 'undefined') return
  const vars = themeVars(themeId)
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v)
  }
}

export function readStoredTheme(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID
  try {
    return localStorage.getItem(ACCENT_STORAGE_KEY) ?? DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}
