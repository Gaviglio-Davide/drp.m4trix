import { NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import {
  SITE_DEFAULTS,
  SITE_KEYS,
  HOME_PARAGRAPHS_KEY,
  DEFAULT_PARAGRAPHS,
  sanitizeParagraphs,
  type SiteConfig,
  type HomeParagraph,
} from '@/lib/site'

export const dynamic = 'force-dynamic'

// Contenuti pubblici della home: testi principali + paragrafi liberi.
export async function GET() {
  await ensureSchemaOnce().catch(() => {})
  const config: SiteConfig = { ...SITE_DEFAULTS }
  let paragraphs: HomeParagraph[] = DEFAULT_PARAGRAPHS
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
    }
  } catch {
    // DB non pronto: restituiamo i valori predefiniti
  }
  return NextResponse.json({ config, paragraphs })
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
