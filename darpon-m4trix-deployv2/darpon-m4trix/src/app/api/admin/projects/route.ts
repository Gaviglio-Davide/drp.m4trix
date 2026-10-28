import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  await ensureSchemaOnce().catch(() => {})
  const projects = await db.project.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      state: true,
      updatedAt: true,
      createdAt: true,
      owner: { select: { email: true, name: true } },
      _count: { select: { saves: true } },
    },
  })
  return NextResponse.json({
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
      owner: p.owner,
      saves: p._count.saves,
      stateBytes: p.state.length,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const name = String(body.name ?? '').trim()
  if (!id || !name) {
    return NextResponse.json({ error: 'ID o nome mancante' }, { status: 400 })
  }
  try {
    await db.project.update({ where: { id }, data: { name } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Progetto non trovato' }, { status: 404 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })
  try {
    await db.project.delete({ where: { id } }) // salvataggi in cascade
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Progetto non trovato' }, { status: 404 })
  }
}
