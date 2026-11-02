import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// URL Blob pubblici (produzione) o /uploads/ locali (sviluppo)
function isValidModelUrl(url: string): boolean {
  if (url.startsWith('/uploads/')) return true
  try {
    const u = new URL(url)
    return (
      u.hostname.endsWith('.public.blob.vercel-storage.com') ||
      u.hostname === 'public.blob.vercel-storage.com'
    )
  } catch {
    return false
  }
}

/** GET: elenco dei modelli importati dall'utente, in ordine di caricamento */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  await ensureSchemaOnce().catch(() => {})
  const models = await db.modelAsset.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      url: true,
      size: true,
      scale: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ models })
}

/** POST: registra un modello appena caricato (dopo l'upload su Blob) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  await ensureSchemaOnce().catch(() => {})
  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    url?: string
    size?: number
  }
  const name = String(body.name ?? '').trim().slice(0, 80) || 'Modello'
  const url = String(body.url ?? '')
  if (!url || !isValidModelUrl(url)) {
    return NextResponse.json(
      { error: 'URL del modello non valido' },
      { status: 400 }
    )
  }
  const size =
    typeof body.size === 'number' && Number.isFinite(body.size)
      ? Math.max(0, Math.round(body.size))
      : null

  // massimo 200 modelli per utente: evita abusi sul free tier
  const count = await db.modelAsset.count({ where: { ownerId: user.id } })
  if (count >= 200) {
    return NextResponse.json(
      { error: 'Hai raggiunto il limite di 200 modelli: cancellane qualcuno' },
      { status: 400 }
    )
  }

  const model = await db.modelAsset.create({
    data: { name, url, size, ownerId: user.id },
    select: { id: true, name: true, url: true, size: true, createdAt: true },
  })
  return NextResponse.json({ model }, { status: 201 })
}
