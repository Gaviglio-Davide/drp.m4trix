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
  tagline: "L'hub per creare videogiochi",
  headline: 'Costruisci mondi 3D.',
  headlineAccent: 'Giocaci dentro.',
  intro:
    'Costruisci il tuo mondo con un semplice clic: case, torri, strade e alberi prendono vita davanti ai tuoi occhi. Scegli i colori, carica i tuoi modelli 3D e quando tutto è pronto... premi Gioca ed esplora il mondo da dentro.',
  footer: 'darpon.m4trix — costruisci, gioca, sogna. 🏰',
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
    id: 'p-costruisci',
    title: '🏗️ Costruisci il tuo mondo',
    text: 'Piazza case, torri, strade e alberi con un clic: scegli i colori, ruota gli oggetti e disegna il tuo villaggio. Con il costruttore di strutture puoi anche creare case da zero, pezzo per pezzo, e salvarle come oggetti da riutilizzare.',
  },
  {
    id: 'p-gioca',
    title: '🎮 Gioca dentro i tuoi mondi',
    text: "Premi Gioca ed esplora in prima persona quello che hai costruito: cammina tra le strade, entra nelle tue creazioni e goditi la resa realistica di edifici e natura. Scopri tutti gli oggetti nella Legenda dell'editor.",
  },
  {
    id: 'p-riservatezza',
    title: '🔒 Le tue creazioni restano tue',
    text: 'Progetti, modelli e strutture sono visibili solo dentro il tuo account: nessun altro può vedere, usare o scaricare quello che hai creato.',
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
  { key: 'mondi', defaultTitle: 'I miei mondi', label: 'I miei mondi (progetti)' },
  { key: 'genera', defaultTitle: 'Genera', label: 'Genera (città e paesaggi)' },
  { key: 'importati', defaultTitle: 'Progetti importati', label: 'Progetti importati (modelli 3D)' },
  { key: 'strutture', defaultTitle: 'Strutture', label: 'Strutture (costruttore)' },
  { key: 'darpx', defaultTitle: 'Darpx.ai', label: 'Darpx.ai (AI del sito)' },
]

export const DEFAULT_SECTION_SUBTITLES: Record<string, string> = {
  mondi: 'Crea un nuovo progetto, costruisci il mondo e trasformalo in un videogioco.',
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
