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
  tagline: 'GAME FACTORY // CYBERPUNK',
  headline: 'Crea videogiochi veri.',
  headlineAccent: 'Dal tuo script, in rete.',
  intro:
    'Scrivi una sceneggiatura e ottieni un gioco giocabile con nemici, boss e dialoghi. Costruisci livelli nello studio stile Godot/Unity, genera mappe procedurali infinite e quando tutto è pronto... premi Gioca e giocaci dentro.',
  footer: 'darpon.m4trix — scrivi, costruisci, gioca. // CYBERPUNK',
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
    title: '🛠️ Game Studio stile Godot/Unity',
    text: 'Scene multiple, tilemap da dipingere, nemici con HP e IA, torrette, boss, NPC con dialoghi, casse, chiavi, porte tra livelli e portale obiettivo. Modifichi tutto dall\'ispettore e provi al volo con ▶ Gioca, direttamente nel browser.',
  },
  {
    id: 'p-worldforge',
    title: '🗺️ Mondi procedurali (Watabou style)',
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

// ---------- reparti della home (aggiornamento .4) ----------

export type SectionConfig = {
  title: string
  subtitle: string
  enabled: boolean
}

export const SECTIONS_KEY = 'homeSections'

/** chiavi dei reparti modificabili + etichette per l'admin */
export const SECTION_DEFS: { key: string; defaultTitle: string; label: string }[] = [
  { key: 'gamestudio', defaultTitle: 'Game Studio', label: 'Game Studio (editor di videogiochi)' },
  { key: 'creagame', defaultTitle: 'Crea da Script', label: 'Crea da Script (gioco da sceneggiatura)' },
  { key: 'worldforge', defaultTitle: 'World Forge', label: 'World Forge (mappe procedurali)' },
  { key: 'mondi', defaultTitle: 'Mondi 3D', label: 'Mondi 3D (laboratorio mondi)' },
  { key: 'genera', defaultTitle: 'Genera', label: 'Genera (città e paesaggi)' },
  { key: 'importati', defaultTitle: 'Progetti importati', label: 'Progetti importati (modelli 3D)' },
  { key: 'strutture', defaultTitle: 'Strutture', label: 'Strutture (costruttore)' },
  { key: 'darpx', defaultTitle: 'Darpx.ai', label: 'Darpx.ai (AI del sito)' },
]

export const DEFAULT_SECTION_SUBTITLES: Record<string, string> = {
  gamestudio:
    'Il reparto stile Godot/Unity: costruisci videogiochi veri — scene, nemici, boss, dialoghi, combattimento e porte tra livelli.',
  creagame:
    'Scrivi il tuo gioco come una sceneggiatura: dettagli confermabili, compilazione e variazioni infinite.',
  worldforge:
    'Crea il tuo mondo da zero: mappa casuale poi personalizza tutto — città, villaggi, dungeon, caverne, acqua.',
  mondi:
    'Il laboratorio dei mondi 3D: crea mondi a mano o generali città e paesaggi in un click con il bottone Genera.',
  genera: 'Città medievali, villaggi, fortezze e paesaggi generati in un click.',
  importati:
    'Carica qui tutti i modelli 3D che vuoi (.glb / .gltf): restano in ordine, scegli la loro dimensione e li trovi pronti nell\'editor di ogni tuo progetto.',
  strutture:
    'Progetta case e edifici pezzo per pezzo: la tua libreria è disponibile in ogni mondo.',
  darpx: "L'AI del sito: immagine → mondo, testo o immagine → 3D e l'Agente Darpx che ti aiuta subito.",
}

/** Valida la configurazione reparti arrivata dal client */
export function sanitizeSections(input: unknown): Record<string, SectionConfig> {
  const out: Record<string, SectionConfig> = {}
  if (!input || typeof input !== 'object') return out
  const raw = input as Record<string, unknown>
  for (const def of SECTION_DEFS) {
    const r = raw[def.key]
    if (!r || typeof r !== 'object') continue
    const rr = r as Record<string, unknown>
    out[def.key] = {
      title:
        typeof rr.title === 'string' && rr.title.trim()
          ? rr.title.trim().slice(0, 80)
          : def.defaultTitle,
      subtitle: typeof rr.subtitle === 'string' ? rr.subtitle.trim().slice(0, 400) : '',
      enabled: rr.enabled !== false,
    }
  }
  return out
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
