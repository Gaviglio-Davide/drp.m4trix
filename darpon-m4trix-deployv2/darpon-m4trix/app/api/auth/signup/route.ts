import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db, ensureSchemaOnce } from '@/lib/db'
import { setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    // Crea le tabelle se il database è appena stato collegato (deploy Vercel)
    await ensureSchemaOnce().catch(() => {})
    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const name = String(body.name ?? '').trim() || null

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La password deve avere almeno 6 caratteri' },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'Un account con questa email esiste già' },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await db.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true },
    })

    await setSessionCookie(user.id)
    return NextResponse.json({ user })
  } catch (e) {
    console.error('signup error', e)
    return NextResponse.json({ error: 'Errore del server' }, { status: 500 })
  }
}
