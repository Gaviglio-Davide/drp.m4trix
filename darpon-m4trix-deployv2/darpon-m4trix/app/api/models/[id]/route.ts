import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** PATCH: aggiorna nome e/o dimensione predefinita di un modello importato */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  await ensureSchemaOnce().catch(() => {})
  const { id } = await params
  const existing = await db.modelAsset.findUnique({
    where: { id },
    select: { ownerId: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Modello non trovato' }, { status: 404 })
  }
  if (existing.ownerId !== user.id) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    scale?: number
  }
  const data: { name?: string; scale?: number } = {}
  if (typeof body.name === 'string' && body.name.trim()) {
    data.name = body.name.trim().slice(0, 80)
  }
  if (typeof body.scale === 'number' && Number.isFinite(body.scale)) {
    data.scale = Math.min(3, Math.max(0.2, body.scale))
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Nessuna modifica' }, { status: 400 })
  }
  const model = await db.modelAsset.update({
    where: { id },
    data,
    select: { id: true, name: true, url: true, size: true, scale: true, createdAt: true },
  })
  return NextResponse.json({ model })
}

/** DELETE: rimuove un modello importato (solo se è tuo) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  await ensureSchemaOnce().catch(() => {})
  const { id } = await params
  const existing = await db.modelAsset.findUnique({
    where: { id },
    select: { ownerId: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Modello non trovato' }, { status: 404 })
  }
  if (existing.ownerId !== user.id) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  await db.modelAsset.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
