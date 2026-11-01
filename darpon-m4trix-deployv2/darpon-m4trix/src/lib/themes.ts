// ============================================================
// darpon.m4trix — Sistema temi CYBERPUNK
// Dark totale + accenti neon. Le CHIAVI restano le stesse della
// versione precedente così le preferenze salvate dagli utenti
// (accentColor) continuano a funzionare: cambia solo la resa,
// ora sempre scura con bagliori neon.
// ============================================================

export type ThemeDef = {
  id: string
  name: string
  primary: string // colore neon principale
}

export const THEMES: ThemeDef[] = [
  { id: 'bosco', name: 'Cyan Pulse', primary: '#00f0ff' },
  { id: 'mare', name: 'Ice Circuit', primary: '#38bdf8' },
  { id: 'cielo', name: 'Digital Sky', primary: '#4d7cfe' },
  { id: 'notte', name: 'Midnight Grid', primary: '#6b7cff' },
  { id: 'lavanda', name: 'Hologram', primary: '#a78bfa' },
  { id: 'viola', name: 'Synthwave', primary: '#b26bff' },
  { id: 'fucsia', name: 'Neon Magenta', primary: '#ff2bd6' },
  { id: 'rosa', name: 'Vice Pink', primary: '#ff4fa3' },
  { id: 'ciliegia', name: 'Blood Code', primary: '#ff3355' },
  { id: 'terracotta', name: 'Rust Chrome', primary: '#ff6a3d' },
  { id: 'arancio', name: 'Ember Drive', primary: '#ff9432' },
  { id: 'miele', name: 'Volt', primary: '#fcee0a' },
  { id: 'lime', name: 'Acid Burn', primary: '#a3ff12' },
  { id: 'menta', name: 'Bio Green', primary: '#00ff9c' },
  { id: 'caffe', name: 'Bronze CPU', primary: '#cd9663' },
  { id: 'ardesia', name: 'Steel Ghost', primary: '#8fa3c4' },
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

/** Accento secondario: se il primario è già caldo/magenta → ciano, altrimenti magenta */
function secondaryNeon(p: string): string {
  const [r, g, b] = hexToRgb(p)
  const magentaish = r > 180 && b > 120 && g < 130
  return magentaish ? '#00f0ff' : '#ff2bd6'
}

// ---------- variabili CSS per tema ----------

export type CssVars = Record<string, string>

/** Calcola tutte le CSS variables di un tema (usato da client e script anti-FOUC). */
export function themeVars(themeId: string): CssVars {
  const t = THEMES.find(x => x.id === themeId) ?? THEMES[0]
  const p = t.primary
  const bright = mix(p, '#ffffff', 0.35)
  const neon2 = secondaryNeon(p)
  const [pr, pg, pb] = hexToRgb(p)
  return {
    // shadcn
    '--background': mix('#05070d', p, 0.02),
    '--foreground': '#e8ecf6',
    '--card': mix('#0b0f1c', p, 0.035),
    '--card-foreground': '#e8ecf6',
    '--popover': mix('#0b0f1c', p, 0.035),
    '--popover-foreground': '#e8ecf6',
    '--primary': p,
    '--primary-foreground': '#04060d',
    '--secondary': 'rgba(255, 255, 255, 0.06)',
    '--secondary-foreground': '#e8ecf6',
    '--muted': 'rgba(255, 255, 255, 0.06)',
    '--muted-foreground': '#9aa3b8',
    '--accent': rgba(p, 0.1),
    '--accent-foreground': '#e8ecf6',
    '--destructive': '#ff3355',
    '--border': rgba(p, 0.2),
    '--input': rgba(p, 0.28),
    '--ring': p,
    // darpon
    '--primary-strong': bright,
    '--primary-soft': rgba(p, 0.12),
    '--site-bg': mix('#05070d', p, 0.025),
    '--site-blob': rgba(p, 0.14),
    '--site-blob-2': rgba(neon2, 0.1),
    '--neon': p,
    '--neon-2': neon2,
    '--line': rgba(p, 0.22),
    '--line-strong': rgba(p, 0.4),
    '--glow': `0 0 12px rgba(${pr}, ${pg}, ${pb}, 0.5), 0 0 34px rgba(${pr}, ${pg}, ${pb}, 0.18)`,
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
