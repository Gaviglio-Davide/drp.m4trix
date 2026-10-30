import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { PROVIDERS, PROVIDER_ORDER, type ProviderId } from '@/lib/providers3d'
import { providerStatuses, writeUserKey } from '@/lib/provider-keys'

export const runtime = 'nodejs'

// ============================================================
// Chiavi dei motori 3D dell'utente (Darpx.ai):
//   GET                      → quali motori sono pronti all'uso
//   PUT  {provider, key}     → salva la chiave personale (cifrata)
//   DELETE ?provider=tripo   → rimuove la chiave personale
// ============================================================

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const statuses = await providerStatuses(user.id)
  const providers = PROVIDER_ORDER.map(id => {
    const meta = PROVIDERS[id]
    const st = statuses.find(s => s.id === id)
    return {
      id,
      label: meta.label,
      icon: meta.icon,
      keyUrl: meta.keyUrl,
      keyHint: meta.keyHint,
      note: meta.note,
      supportsText: meta.supportsText,
      supportsImage: meta.supportsImage,
      hasKey: st?.hasKey ?? false,
      source: st?.source ?? null, // personal | site | env
    }
  })
  return NextResponse.json({ providers })
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as {
    provider?: string
    key?: string
  }
  const provider = body.provider as ProviderId
  if (!PROVIDER_ORDER.includes(provider)) {
    return NextResponse.json({ error: 'Motore sconosciuto' }, { status: 400 })
  }
  const key = String(body.key ?? '').trim()
  if (key && key.length < 16) {
    return NextResponse.json(
      { error: 'La chiave API sembra troppo corta: controllala e riprova' },
      { status: 400 }
    )
  }
  try {
    await writeUserKey(user.id, provider, key || null)
    return NextResponse.json({ ok: true, saved: Boolean(key) })
  } catch (e) {
    console.error('provider key save error', e)
    return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const provider = req.nextUrl.searchParams.get('provider') as ProviderId | null
  if (!provider || !PROVIDER_ORDER.includes(provider)) {
    return NextResponse.json({ error: 'Motore sconosciuto' }, { status: 400 })
  }
  try {
    await writeUserKey(user.id, provider, null)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Rimozione non riuscita' }, { status: 500 })
  }
}
