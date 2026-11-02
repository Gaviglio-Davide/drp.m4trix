import { NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import {
  SITE_DEFAULTS,
  SITE_KEYS,
  HOME_PARAGRAPHS_KEY,
  DEFAULT_PARAGRAPHS,
  sanitizeParagraphs,
  sanitizeSections,
  sanitizeAnnouncement,
  type SiteConfig,
  type HomeParagraph,
  type SectionConfig,
} from '@/lib/site'

export const dynamic = 'force-dynamic'

// Contenuti pubblici della home: testi principali, paragrafi liberi,
// reparti (titoli + on/off) e banner annuncio.
export async function GET() {
  await ensureSchemaOnce().catch(() => {})
  const config: SiteConfig = { ...SITE_DEFAULTS }
  let paragraphs: HomeParagraph[] = DEFAULT_PARAGRAPHS
  let sections: Record<string, SectionConfig> = {}
  let announcement = { text: '', enabled: false }
  try {
    const rows = await db.siteConfig.findMany()
    for (const row of rows) {
      if ((SITE_KEYS as string[]).includes(row.key)) {
        config[row.key as keyof SiteConfig] = row.value
      }
      if (row.key === HOME_PARAGRAPHS_KEY) {
        const parsed = sanitizeParagraphs(safeJson(row.value))
        paragraphs = parsed.length ? parsed : []
      }
      if (row.key === 'homeSections') {
        sections = sanitizeSections(safeJson(row.value))
      }
      if (row.key === 'announcement') {
        announcement = sanitizeAnnouncement(safeJson(row.value))
      }
    }
  } catch {
    // DB non pronto: restituiamo i valori predefiniti
  }
  return NextResponse.json({ config, paragraphs, sections, announcement })
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
