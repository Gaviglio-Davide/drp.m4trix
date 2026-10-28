import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
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

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  await ensureSchemaOnce().catch(() => {})
  const config: SiteConfig = { ...SITE_DEFAULTS }
  let paragraphs: HomeParagraph[] = DEFAULT_PARAGRAPHS
  const rows = await db.siteConfig.findMany()
  for (const row of rows) {
    if ((SITE_KEYS as string[]).includes(row.key)) {
      config[row.key as keyof SiteConfig] = row.value
    }
    if (row.key === HOME_PARAGRAPHS_KEY) {
      paragraphs = sanitizeParagraphs(safeJson(row.value))
    }
  }
  return NextResponse.json({ config, paragraphs })
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const updates: { key: string; value: string }[] = []
  for (const key of SITE_KEYS) {
    if (typeof body[key] === 'string' && body[key].trim() !== '') {
      updates.push({ key, value: body[key].trim().slice(0, 600) })
    }
  }
  // Paragrafi liberi della home (JSON serializzato in SiteConfig)
  if ('paragraphs' in body) {
    const clean = sanitizeParagraphs(body.paragraphs)
    updates.push({ key: HOME_PARAGRAPHS_KEY, value: JSON.stringify(clean) })
  }
  for (const u of updates) {
    await db.siteConfig.upsert({
      where: { key: u.key },
      update: { value: u.value },
      create: { key: u.key, value: u.value },
    })
  }
  return NextResponse.json({ ok: true, updated: updates.length })
}
