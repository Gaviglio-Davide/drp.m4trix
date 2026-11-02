import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

function projectIdFromPath(req: NextRequest): string {
  return req.nextUrl.pathname.split('/')[3]
}

async function getOwnedProject(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return { error: 'Non autenticato' as const }
  const project = await db.project.findUnique({
    where: { id: projectIdFromPath(req) },
  })
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
  const saves = await db.save.findMany({
    where: { projectId: r.project.id },
    orderBy: { createdAt: 'desc' },
    take: 15,
  })
  return NextResponse.json({ saves })
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const r = await getOwnedProject(req)
  if ('error' in r) {
    return NextResponse.json({ error: r.error }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const state = typeof body.state === 'string' ? body.state : null
  if (!state) {
    return NextResponse.json({ error: 'Stato mancante' }, { status: 400 })
  }
  try {
    JSON.parse(state)
  } catch {
    return NextResponse.json({ error: 'Stato non valido' }, { status: 400 })
  }
  const count = await db.save.count({ where: { projectId: r.project.id } })
  // keep max 15 snapshots: remove oldest when over limit
  if (count >= 15) {
    const oldest = await db.save.findFirst({
      where: { projectId: r.project.id },
      orderBy: { createdAt: 'asc' },
    })
    if (oldest) await db.save.delete({ where: { id: oldest.id } })
  }
  const name =
    (typeof body.name === 'string' && body.name.trim().slice(0, 40)) ||
    `Salvataggio ${new Date().toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`
  const save = await db.save.create({
    data: { name, state, projectId: r.project.id },
  })
  return NextResponse.json({ save })
}
