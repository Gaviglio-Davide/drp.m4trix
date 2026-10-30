import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import { decryptSecret, encryptSecret } from '@/lib/encrypt'

export const runtime = 'nodejs'
export const maxDuration = 30

// ============================================================
// Pannello admin — Agente AI (Darpx):
//   GET                  → configurazione attuale (senza segreti)
//   PUT {baseUrl, model, apiKey} → salva (chiave cifrata)
//   DELETE               → rimuove la configurazione
// L'Agente Darpx risponde comunque col cervello locale; con
// questa configurazione attiva anche un modello linguistico
// tramite endpoint OpenAI-compatibile (OpenAI, OpenRouter,
// Groq, Together, ecc.).
// ============================================================

const KEY = 'aiConfig'

type Stored = { baseUrl?: string; model?: string; apiKey?: string }

async function readStored(): Promise<Stored> {
  try {
    await ensureSchemaOnce().catch(() => {})
    const row = await db.siteConfig.findUnique({ where: { key: KEY } })
    if (!row) return {}
    return JSON.parse(row.value) as Stored
  } catch {
    return {}
  }
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const stored = await readStored()
  const apiKey = stored.apiKey ? decryptSecret(stored.apiKey) : null
  return NextResponse.json({
    ai: {
      baseUrl: stored.baseUrl ?? '',
      model: stored.model ?? '',
      hasKey: Boolean(apiKey),
      keyPreview: apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : '',
    },
    zaiEnv: Boolean(
      process.env.ZAI_API_KEY ||
        process.env.ZAI_BASE_URL ||
        process.env.Z_AI_API_KEY
    ),
  })
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const body = (await req.json().catch(() => ({}))) as {
    baseUrl?: string
    model?: string
    apiKey?: string
  }
  const stored = await readStored()
  const next: Stored = {
    baseUrl:
      typeof body.baseUrl === 'string'
        ? body.baseUrl.trim().slice(0, 300)
        : stored.baseUrl,
    model:
      typeof body.model === 'string'
        ? body.model.trim().slice(0, 120)
        : stored.model,
  }
  if (typeof body.apiKey === 'string') {
    const k = body.apiKey.trim()
    next.apiKey = k ? encryptSecret(k) : undefined
    if (!k) delete next.apiKey
  } else if (stored.apiKey) {
    next.apiKey = stored.apiKey
  }
  if (next.apiKey) {
    await db.siteConfig.upsert({
      where: { key: KEY },
      update: { value: JSON.stringify(next) },
      create: { key: KEY, value: JSON.stringify(next) },
    })
  } else {
    await db.siteConfig.deleteMany({ where: { key: KEY } })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const denied = await requireAdmin()
  if (denied) return denied
  await db.siteConfig.deleteMany({ where: { key: KEY } })
  return NextResponse.json({ ok: true })
}
