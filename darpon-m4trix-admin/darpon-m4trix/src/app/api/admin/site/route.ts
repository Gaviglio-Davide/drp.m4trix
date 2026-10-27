import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import { SITE_DEFAULTS, SITE_KEYS, type SiteConfig } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const config: SiteConfig = { ...SITE_DEFAULTS }
  const rows = await db.siteConfig.findMany()
  for (const row of rows) {
    if ((SITE_KEYS as string[]).includes(row.key)) {
      config[row.key as keyof SiteConfig] = row.value
    }
  }
  return NextResponse.json({ config })
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
  for (const u of updates) {
    await db.siteConfig.upsert({
      where: { key: u.key },
      update: { value: u.value },
      create: { key: u.key, value: u.value },
    })
  }
  return NextResponse.json({ ok: true, updated: updates.length })
}
