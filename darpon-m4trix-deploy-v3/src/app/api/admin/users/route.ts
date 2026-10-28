import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  await ensureSchemaOnce().catch(() => {})
  const users = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      accentColor: true,
      createdAt: true,
      _count: { select: { projects: true } },
    },
  })
  return NextResponse.json({ users })
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
  try {
    await db.user.delete({ where: { id } }) // progetti e salvataggi in cascade
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
  }
}
