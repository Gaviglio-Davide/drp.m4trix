import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import {
  SITE_DEFAULTS,
  SITE_KEYS,
  HOME_PARAGRAPHS_KEY,
  DEFAULT_PARAGRAPHS,
  SECTIONS_KEY,
  ANNOUNCEMENT_KEY,
  sanitizeParagraphs,
  sanitizeSections,
  sanitizeAnnouncement,
  type SiteConfig,
  type HomeParagraph,
  type SectionConfig,
  type Announcement,
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
  let sections: Record<string, SectionConfig> = {}
  let announcement: Announcement = { text: '', enabled: false }
  const rows = await db.siteConfig.findMany()
  for (const row of rows) {
    if ((SITE_KEYS as string[]).includes(row.key)) {
      config[row.key as keyof SiteConfig] = row.value
    }
    if (row.key === HOME_PARAGRAPHS_KEY) {
      paragraphs = sanitizeParagraphs(safeJson(row.value))
    }
    if (row.key === SECTIONS_KEY) {
      sections = sanitizeSections(safeJson(row.value))
    }
    if (row.key === ANNOUNCEMENT_KEY) {
      announcement = sanitizeAnnouncement(safeJson(row.value))
    }
  }
  return NextResponse.json({ config, paragraphs, sections, announcement })
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
  // Reparti: titoli, sottotitoli e interruttori on/off
  if ('sections' in body) {
    const clean = sanitizeSections(body.sections)
    updates.push({ key: SECTIONS_KEY, value: JSON.stringify(clean) })
  }
  // Banner annuncio
  if ('announcement' in body) {
    const clean = sanitizeAnnouncement(body.announcement)
    updates.push({ key: ANNOUNCEMENT_KEY, value: JSON.stringify(clean) })
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
