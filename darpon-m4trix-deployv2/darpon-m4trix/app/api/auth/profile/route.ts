import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { THEMES } from '@/lib/themes'
import { encryptSecret, decryptSecret } from '@/lib/encrypt'

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const full = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      accentColor: true,
      meshyKey: true,
    },
  })
  if (!full) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  // test silenzioso: la chiave cifrata è integra?
  const keyOk = full.meshyKey ? Boolean(decryptSecret(full.meshyKey)) : false
  return NextResponse.json({
    user: {
      id: full.id,
      email: full.email,
      name: full.name,
      accentColor: full.accentColor,
      hasMeshyKey: keyOk,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const data: {
    name?: string | null
    accentColor?: string | null
    meshyKey?: string | null
  } = {}

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

  // API key Meshy per Darpx.ai (testo → 3D)
  if (body.meshyKey !== undefined) {
    const key = String(body.meshyKey ?? '').trim()
    if (key && key.length < 16) {
      return NextResponse.json(
        { error: 'La chiave API sembra troppo corta: controllala e riprova' },
        { status: 400 }
      )
    }
    // cifra e conserva; mai in chiaro
    data.meshyKey = key ? encryptSecret(key) : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nessuna modifica' }, { status: 400 })
  }

  try {
    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: { id: true, email: true, name: true, accentColor: true, meshyKey: true },
    })
    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        accentColor: updated.accentColor,
        hasMeshyKey: Boolean(updated.meshyKey),
      },
    })
  } catch (e) {
    console.error('profile update error', e)
    return NextResponse.json({ error: 'Errore del server' }, { status: 500 })
  }
}
