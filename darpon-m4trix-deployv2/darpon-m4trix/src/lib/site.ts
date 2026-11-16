// ============================================================
// Contenuti del sito modificabili dall'area admin:
//  - testi principali (SiteConfig, campi stringa)
//  - paragrafi liberi della home (SiteConfig, JSON in
//    HOME_PARAGRAPHS_KEY) — l'admin può crearne quanti vuole
//  - titoli/descrizioni dei reparti + interruttori on/off
//    (SiteConfig, JSON in SECTIONS_KEY) — aggiornamento .4
//  - banner annuncio mostrato in cima alla home a tutti gli
//    utenti (SiteConfig, JSON in ANNOUNCEMENT_KEY) — .4
// ============================================================

export const SITE_DEFAULTS = {
  siteName: 'darpon.m4trix',
  tagline: 'darpon.m4trix // WORLD BUILDER',
  headline: 'Crea videogiochi veri.',
  headlineAccent: 'Dal tuo script, in rete.',
  intro:
    'Scrivi una sceneggiatura e ottieni un gioco giocabile con nemici, boss e dialoghi. Costruisci livelli nello studio 3D, genera mappe procedurali infinite e quando tutto è pronto... premi Gioca e giocaci dentro.',
  footer: 'darpon.m4trix — scrivi, costruisci, gioca.',
}

export type SiteConfig = typeof SITE_DEFAULTS

export const SITE_KEYS = Object.keys(SITE_DEFAULTS) as (keyof SiteConfig)[]

export const SITE_LABELS: Record<keyof SiteConfig, string> = {
  siteName: 'Nome del sito (header, loader)',
  tagline: 'Slogan (badge sopra il titolo)',
  headline: 'Titolo principale (parole separate da spazi)',
  headlineAccent: 'Riga evidenziata del titolo',
  intro: 'Testo introduttivo (sotto il titolo)',
  footer: 'Footer della home',
}

// ---------- paragrafi liberi della home ----------

export const HOME_PARAGRAPHS_KEY = 'homeParagraphs'

export type HomeParagraph = {
  id: string
  title: string
  text: string
}

export const DEFAULT_PARAGRAPHS: HomeParagraph[] = [
  {
    id: 'p-script',
    title: '📜 Dallo script al gioco',
    text: 'Scrivi l\'idea del tuo gioco come una sceneggiatura: il sistema riconosce ambientazione, nemici, arma, obiettivo e difficoltà (anche se sbagli qualche lettera), ti fa confermare i dettagli e compila un gioco giocabile con combattimento, porte e dialoghi. Stesso script con seed diverso = gioco sempre diverso.',
  },
  {
    id: 'p-studio',
    title: '🛠️ Game Studio 3D',
    text: 'Scene multiple, tilemap da dipingere, nemici con HP e IA, torrette, boss, NPC con dialoghi, casse, chiavi, porte tra livelli e portale obiettivo. Modifichi tutto dall\'ispettore e provi al volo con ▶ Gioca, direttamente nel browser.',
  },
  {
    id: 'p-worldforge',
    title: '🗺️ Mondi procedurali',
    text: 'Genera una mappa del mondo casuale e poi personalizza tutto: biomi col pennello, città con isolati, edifici e mura, villaggi, dungeon, caverne, fiumi e strade. Con un clic la mappa diventa un livello esplorabile nel Game Studio.',
  },
]

export const MAX_PARAGRAPHS = 24

/** Valida e normalizza un array di paragrafi arrivato dal client */
export function sanitizeParagraphs(input: unknown): HomeParagraph[] {
  if (!Array.isArray(input)) return []
  const out: HomeParagraph[] = []
  let i = 1
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 140) : ''
    const text = typeof r.text === 'string' ? r.text.trim().slice(0, 2500) : ''
    if (!title && !text) continue
    const id =
      typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id)
        ? r.id
        : `p-${Date.now().toString(36)}-${i}`
    out.push({ id, title: title || `Paragrafo ${i}`, text })
    i++
    if (out.length >= MAX_PARAGRAPHS) break
  }
  return out
}

// ---------- reparti e funzioni controllate dall'admin (v18) ----------
//
// Ogni funzione del sito ha uno STATO scelto dall'admin nel pannello
// "Controllo Funzioni":
//   on           → normale, disponibile
//   off          → nascosta completamente (non si vede nemmeno il bottone)
//   maintenance  → visibile con 🛠, accesso bloccato: "In manutenzione"
//   updating     → visibile con 🔄, accesso bloccato: "Aggiornamento in corso"
//   suspended    → visibile con ⛔, accesso bloccato: "Sospesa dall'amministratore"

export type FeatureState = 'on' | 'off' | 'maintenance' | 'updating' | 'suspended'

export const FEATURE_STATES: { value: FeatureState; label: string; icon: string; color: string }[] = [
  { value: 'on', label: 'Attiva', icon: '🟢', color: '#22c55e' },
  { value: 'off', label: 'Nascosta', icon: '⚫', color: '#6b7280' },
  { value: 'maintenance', label: 'Manutenzione', icon: '🛠', color: '#f59e0b' },
  { value: 'updating', label: 'Aggiornamento', icon: '🔄', color: '#3b82f6' },
  { value: 'suspended', label: 'Sospesa', icon: '⛔', color: '#ef4444' },
]

export type SectionConfig = {
  title: string
  subtitle: string
  state: FeatureState
  enabled: boolean // retrocompatibilità: false = 'off'
}

export const SECTIONS_KEY = 'homeSections'

/** tutte le funzioni controllabili: reparti della home + funzioni interne */
export const FEATURE_DEFS: {
  key: string
  label: string
  desc: string
  section: boolean // true = reparto con tab nella home
}[] = [
  { key: 'gamestudio', label: 'Game Studio', desc: 'Editor di videogiochi: Darpx Engine realistico, mondi vasti e giochi 2D.', section: true },
  { key: 'worldforge', label: 'Mappe & Regni', desc: 'Mappe procedurali personalizzabili: città, villaggi, dungeon.', section: true },
  { key: 'mondi', label: 'Mondi 3D', desc: 'Il laboratorio dei mondi 3D: progetti liberi con terreno, case e alberi.', section: true },
  { key: 'importati', label: 'Progetti importati', desc: 'I tuoi modelli GLB/GLTF caricati, pronti in ogni editor.', section: true },
  { key: 'darpx', label: 'Laboratorio Darpx', desc: 'Immagine → mondo, testo o immagine → 3D, strumenti AI.', section: true },
  { key: 'genera', label: 'Generatore città/paesaggi', desc: 'Il bottone Genera dentro il reparto Mondi 3D.', section: false },
  { key: 'catalogo', label: 'Catalogo modelli 3D', desc: 'La libreria di modelli gratuiti (Cyber Samurai, personaggi animati…) nel sito e nell\u2019editor.', section: false },
  { key: 'agente', label: 'Agente Darpx', desc: 'L\u2019assistente AI fluttuante in basso a destra.', section: false },
  { key: 'hubimport', label: 'Importa mondi da Hub', desc: 'L\u2019importazione universale di mondi e giochi dentro il Game Studio.', section: false },
]

/** i reparti (tab della home): le funzioni con section=true */
export const SECTION_DEFS = FEATURE_DEFS.filter(f => f.section)

export const DEFAULT_SECTION_SUBTITLES: Record<string, string> = {
  gamestudio:
    'Il cuore di darpon.m4trix: costruisci videogiochi veri — Darpx Engine realistico, personaggi animati, mondi vasti e giochi 2D.',
  worldforge:
    'Crea il tuo mondo da zero: mappa casuale poi personalizza tutto — città, villaggi, dungeon, caverne, acqua.',
  mondi:
    'Il laboratorio dei mondi 3D: case, strade e alberi con un clic, terreno scolpibile e il generatore di città e paesaggi con il bottone Genera.',
  importati:
    'Carica qui tutti i modelli 3D che vuoi (.glb / .gltf): restano in ordine, scegli la loro dimensione e li trovi pronti nell\'editor di ogni tuo progetto.',
  darpx: 'Il laboratorio creativo: immagine → mondo, testo o immagine → 3D e l\'Agente che ti aiuta subito.',
}

/** valori predefiniti di una funzione non ancora configurata */
export function defaultSectionConfig(key: string): SectionConfig {
  const def = FEATURE_DEFS.find(f => f.key === key)
  return {
    title: def?.label ?? key,
    subtitle: DEFAULT_SECTION_SUBTITLES[key] ?? '',
    state: 'on',
    enabled: true,
  }
}

/** Valida la configurazione funzioni arrivata dal client (v18: con stati) */
export function sanitizeSections(input: unknown): Record<string, SectionConfig> {
  const out: Record<string, SectionConfig> = {}
  if (!input || typeof input !== 'object') return out
  const raw = input as Record<string, unknown>
  for (const def of FEATURE_DEFS) {
    const r = raw[def.key]
    if (!r || typeof r !== 'object') continue
    const rr = r as Record<string, unknown>
    // stato valido o derivato dal vecchio campo enabled (retrocompatibilità)
    const state: FeatureState =
      typeof rr.state === 'string' && FEATURE_STATES.some(s => s.value === rr.state)
        ? (rr.state as FeatureState)
        : rr.enabled === false
          ? 'off'
          : 'on'
    out[def.key] = {
      title:
        typeof rr.title === 'string' && rr.title.trim()
          ? rr.title.trim().slice(0, 80)
          : def.label,
      subtitle: typeof rr.subtitle === 'string' ? rr.subtitle.trim().slice(0, 400) : '',
      state,
      enabled: state !== 'off',
    }
  }
  return out
}

/** etichetta breve per le schermate di blocco */
export function stateMessage(state: FeatureState, title: string): { icon: string; title: string; text: string } {
  switch (state) {
    case 'maintenance':
      return { icon: '🛠', title: `${title} è in manutenzione`, text: 'Stiamo sistemando questo reparto. Torna tra poco: sarà di nuovo disponibile appena finiamo.' }
    case 'updating':
      return { icon: '🔄', title: `${title} si sta aggiornando`, text: 'Stiamo installando una nuova versione di questo reparto. Non serve ricaricare: quando finisce, torna disponibile da solo.' }
    case 'suspended':
      return { icon: '⛔', title: `${title} è stata sospesa`, text: 'L\'amministratore ha sospeso temporaneamente questo reparto. Contatta l\'amministratore per saperne di più.' }
    default:
      return { icon: '🔒', title: `${title} non è disponibile`, text: 'Questo reparto non è attivo al momento.' }
  }
}

// ---------- banner annuncio (aggiornamento .4) ----------

export const ANNOUNCEMENT_KEY = 'announcement'

export type Announcement = {
  text: string
  enabled: boolean
}

export function sanitizeAnnouncement(input: unknown): Announcement {
  if (!input || typeof input !== 'object') return { text: '', enabled: false }
  const r = input as Record<string, unknown>
  const text = typeof r.text === 'string' ? r.text.trim().slice(0, 600) : ''
  return { text, enabled: Boolean(r.enabled) && text.length > 0 }
}
