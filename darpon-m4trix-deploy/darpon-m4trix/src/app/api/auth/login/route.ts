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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json(
        { error: 'Email o password sbagliate' },
        { status: 401 }
      )
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { error: 'Email o password sbagliate' },
        { status: 401 }
      )
    }

    await setSessionCookie(user.id)
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        accentColor: user.accentColor,
      },
    })
  } catch (e) {
    console.error('login error', e)
    return NextResponse.json({ error: 'Errore del server' }, { status: 500 })
  }
}
