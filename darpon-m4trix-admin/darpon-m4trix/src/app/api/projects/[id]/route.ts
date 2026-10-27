import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

async function getOwnedProject(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return { error: 'Non autenticato' as const }
  const id = req.nextUrl.pathname.split('/')[3]
  const project = await db.project.findUnique({ where: { id } })
  if (!project || project.ownerId !== user.id) {
    return { error: 'Progetto non trovato' as const }
  }
  return { project }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const r = await getOwnedProject(req)
  if ('error' in r) {
    return NextResponse.json({ error: r.error }, { status: 401 })
  }
  return NextResponse.json({ project: r.project })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const r = await getOwnedProject(req)
  if ('error' in r) {
    return NextResponse.json({ error: r.error }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const data: { name?: string; state?: string } = {}
  if (typeof body.name === 'string' && body.name.trim()) {
    data.name = body.name.trim().slice(0, 60)
  }
  if (typeof body.state === 'string') {
    try {
      JSON.parse(body.state)
      if (body.state.length > 8_000_000) throw new Error('too big')
      data.state = body.state
    } catch {
      return NextResponse.json({ error: 'Stato non valido' }, { status: 400 })
    }
  }
  const project = await db.project.update({
    where: { id: r.project.id },
    data,
  })
  return NextResponse.json({ ok: true, updatedAt: project.updatedAt })
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const r = await getOwnedProject(req)
  if ('error' in r) {
    return NextResponse.json({ error: r.error }, { status: 401 })
  }
  await db.project.delete({ where: { id: r.project.id } })
  return NextResponse.json({ ok: true })
}
