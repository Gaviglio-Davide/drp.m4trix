import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { THEMES } from '@/lib/themes'

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const data: { name?: string; accentColor?: string | null } = {}

  // cambio nome
  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (name.length > 40) {
      return NextResponse.json(
        { error: 'Il nome può avere al massimo 40 caratteri' },
        { status: 400 }
      )
    }
    data.name = name || null
  }

  // cambio tema colore
  if (body.accentColor !== undefined) {
    const accent = String(body.accentColor ?? '')
    if (accent && !THEMES.some(t => t.id === accent)) {
      return NextResponse.json({ error: 'Tema non valido' }, { status: 400 })
    }
    data.accentColor = accent || null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nessuna modifica' }, { status: 400 })
  }

  try {
    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: { id: true, email: true, name: true, accentColor: true },
    })
    return NextResponse.json({ user: updated })
  } catch (e) {
    console.error('profile update error', e)
    return NextResponse.json({ error: 'Errore del server' }, { status: 500 })
  }
}
