import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import {
  PROVIDERS,
  PROVIDER_ORDER,
  testProviderKey,
  type ProviderId,
} from '@/lib/providers3d'
import { setSiteKey } from '@/lib/provider-keys'
import { decryptSecret } from '@/lib/encrypt'

export const runtime = 'nodejs'
export const maxDuration = 30

// ============================================================
// Pannello admin — chiavi GLOBALI dei motori 3D (Darpx.ai):
//   GET                       → stato delle chiavi globali
//   PUT  {provider, key}      → imposta/rimuove la chiave globale
//   POST {provider, key?}     → test rapido della chiave
// Una chiave globale vale per TUTTI gli utenti del sito.
// ============================================================

async function siteKeyRows(): Promise<Map<string, string>> {
  await ensureSchemaOnce().catch(() => {})
  const rows = await db.siteConfig
    .findMany({ where: { key: { startsWith: 'key3d:' } } })
    .catch(() => [] as { key: string; value: string }[])
  const map = new Map<string, string>()
  for (const r of rows) map.set(r.key.slice(6), r.value)
  return map
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const rows = await siteKeyRows()
  const providers = PROVIDER_ORDER.map(id => ({
    id,
    ...meta(id),
    siteKey: rows.has(id), // presente su DB (cifrata)
    envKey: Boolean(envVarOf(id)),
  }))
  return NextResponse.json({ providers })
}

function meta(id: ProviderId) {
  const m = PROVIDERS[id]
  return {
    label: m.label,
    icon: m.icon,
    keyUrl: m.keyUrl,
    keyHint: m.keyHint,
    note: m.note,
    supportsText: m.supportsText,
    supportsImage: m.supportsImage,
  }
}

function envVarOf(id: ProviderId): string {
  return (
    {
      tripo: 'TRIPO_API_KEY',
      fal: 'FAL_API_KEY',
      stability: 'STABILITY_API_KEY',
      meshy: 'MESHY_API_KEY',
    } as const
  )[id]
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
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
      { error: 'La chiave sembra troppo corta: controllala' },
      { status: 400 }
    )
  }
  try {
    await setSiteKey(provider, key || null)
    return NextResponse.json({ ok: true, saved: Boolean(key) })
  } catch (e) {
    console.error('admin provider key save error', e)
    return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = (await req.json().catch(() => ({}))) as {
    provider?: string
    key?: string // opzionale: se manca, testa quella già salvata
  }
  const provider = body.provider as ProviderId
  if (!PROVIDER_ORDER.includes(provider)) {
    return NextResponse.json({ error: 'Motore sconosciuto' }, { status: 400 })
  }
  let key = String(body.key ?? '').trim()
  if (!key) {
    const rows = await siteKeyRows()
    const sealed = rows.get(provider)
    key = sealed ? (decryptSecret(sealed) ?? '') : ''
    if (!key) key = process.env[envVarOf(provider)] ?? ''
  }
  if (!key) {
    return NextResponse.json({ ok: false, message: 'Nessuna chiave da testare' })
  }
  const result = await testProviderKey(provider, key)
  return NextResponse.json(result)
}
