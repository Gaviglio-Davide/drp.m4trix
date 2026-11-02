import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import { hashPassword, validatePassword } from '@/lib/password'

export const dynamic = 'force-dynamic'

// ============================================================
// Gestione utenti (admin):
//   GET                      → elenco
//   PATCH {id, name?}        → rinomina utente
//   PATCH {id, password}     → imposta nuova password
//   DELETE ?id=              → elimina (progetti in cascade)
// ============================================================

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
      _count: { select: { projects: true, modelAssets: true } },
    },
  })
  return NextResponse.json({ users })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    name?: string
    password?: string
  }
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  const data: { name?: string; passwordHash?: string } = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (name.length > 40) {
      return NextResponse.json(
        { error: 'Il nome può avere al massimo 40 caratteri' },
        { status: 400 }
      )
    }
    data.name = name || undefined
  }

  if (body.password !== undefined) {
    const pwd = String(body.password)
    const check = validatePassword(pwd)
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }
    data.passwordHash = await hashPassword(pwd)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nessuna modifica' }, { status: 400 })
  }

  try {
    await db.user.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
  }
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
