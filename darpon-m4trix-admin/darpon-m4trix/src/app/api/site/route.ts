import { NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { SITE_DEFAULTS, SITE_KEYS, type SiteConfig } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Testi del sito (modificabili dall'area admin). Pubblico: la landing
// li legge per mostrare title/intro/footer personalizzati.
export async function GET() {
  await ensureSchemaOnce().catch(() => {})
  const config: SiteConfig = { ...SITE_DEFAULTS }
  try {
    const rows = await db.siteConfig.findMany()
    for (const row of rows) {
      if ((SITE_KEYS as string[]).includes(row.key)) {
        config[row.key as keyof SiteConfig] = row.value
      }
    }
  } catch {
    // DB non pronto: restituiamo i valori predefiniti
  }
  return NextResponse.json({ config })
}
