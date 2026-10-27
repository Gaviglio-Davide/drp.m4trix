// ============================================================
// Testi del sito modificabili dall'area admin (/admin → Testi)
// Questi sono i valori predefiniti usati finché l'admin non
// personalizza qualcosa (salvato nella tabella SiteConfig).
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
