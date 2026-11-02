import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const currentPassword = String(body.currentPassword ?? '')
    const newPassword = String(body.newPassword ?? '')

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'La nuova password deve avere almeno 6 caratteri' },
        { status: 400 }
      )
    }

    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { error: 'La password attuale non è corretta' },
        { status: 401 }
      )
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('password change error', e)
    return NextResponse.json({ error: 'Errore del server' }, { status: 500 })
  }
}
