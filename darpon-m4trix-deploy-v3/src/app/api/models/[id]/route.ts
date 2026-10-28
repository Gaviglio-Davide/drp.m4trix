import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

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
