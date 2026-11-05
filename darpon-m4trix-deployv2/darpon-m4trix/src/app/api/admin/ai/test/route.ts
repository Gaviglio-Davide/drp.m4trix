import { NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import { decryptSecret } from '@/lib/encrypt'

export const runtime = 'nodejs'
export const maxDuration = 30

// ============================================================
// Pannello admin — TEST della chiave AI dell'Agente Darpx (v12).
// POST → prova davvero la chiave contro il servizio configurato
// e risponde con esito e motivo chiaro (chiave rifiutata,
// indirizzo sbagliato, quota…), così l'admin capisce subito
// perché la chiave "non va".
// ============================================================

type Stored = { baseUrl?: string; model?: string; apiKey?: string }

async function readStored(): Promise<Stored | null> {
  try {
    await ensureSchemaOnce().catch(() => {})
    const row = await db.siteConfig.findUnique({ where: { key: 'aiConfig' } })
    if (!row) return null
    return JSON.parse(row.value) as Stored
  } catch {
    return null
  }
}

function providerBaseOf(cfg: { baseUrl?: string; model?: string }): string {
  const base = (cfg.baseUrl ?? '').trim()
  const model = (cfg.model ?? '').toLowerCase()
  if (base.includes('generativelanguage')) {
    return 'https://generativelanguage.googleapis.com/v1beta/openai'
  }
  if (model.startsWith('gemini') && !base) {
    return 'https://generativelanguage.googleapis.com/v1beta/openai'
  }
  return base || 'https://api.openai.com/v1'
}

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied

  const stored = await readStored()
  if (!stored?.apiKey) {
    return NextResponse.json({
      ok: false,
      hint: 'Nessuna chiave salvata: scrivi la chiave nel campo e premi prima «Salva».',
    })
  }

  const apiKey = decryptSecret(stored.apiKey)
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      hint: 'Chiave salvata ma non leggibile: rimuovi la configurazione e risalvala.',
    })
  }

  const model = stored.model?.trim() || 'gpt-4o-mini'
  const base = providerBaseOf({ baseUrl: stored.baseUrl, model })

  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Rispondi con una sola parola: OK' }],
        max_tokens: 10,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) {
      let detail = ''
      try {
        const j = (await res.json()) as { error?: { message?: string } }
        detail = String(j?.error?.message ?? '').slice(0, 220)
      } catch {
        /* risposta non JSON */
      }
      const hint =
        res.status === 401 || res.status === 403
          ? 'Chiave rifiutata dal servizio: controlla di aver copiato la chiave COMPLETA e valida.'
          : res.status === 404
            ? 'Indirizzo o modello sbagliati. Per Google Gemini: Base URL VUOTO + modello gemini-2.5-flash.'
            : res.status === 429
              ? 'Quota/limiti superati (per Gemini: genera una chiave in AI Studio e controlla il piano).'
              : 'Il servizio risponde ma con un errore: controlla modello e configurazione.'
      return NextResponse.json({ ok: false, status: res.status, detail, hint })
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const sample = data.choices?.[0]?.message?.content?.trim().slice(0, 60) ?? ''
    return NextResponse.json({ ok: true, model, base, sample })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      detail: e instanceof Error ? e.message.slice(0, 160) : undefined,
      hint: 'Connessione al servizio non riuscita: controlla la connessione o l\'indirizzo.',
    })
  }
}
