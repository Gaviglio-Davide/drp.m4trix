import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { decryptSecret } from '@/lib/encrypt'
import { put } from '@vercel/blob'

export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================
// Darpx.ai — Testo → 3D (personaggi, mostri, edifici, oggetti)
// Ponte sicuro verso l'API di Meshy: la chiave dell'utente sta
// cifrata nel database e non passa mai dal browser.
//   POST {prompt, artStyle}  → crea il job e risponde {jobId}
//   GET  ?jobId=...         → stato; quando pronto scarica il
//                             modello, lo copia su Blob e lo
//                             registra nei "Progetti importati"
// ============================================================

const MESHY_API = 'https://api.meshy.ai/openapi/v1'
const ART_STYLES = ['realistic', 'cartoon', 'sculpture', 'low_poly'] as const
type ArtStyle = (typeof ART_STYLES)[number]

async function getUserKey(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { meshyKey: true },
  })
  if (u?.meshyKey) {
    const k = decryptSecret(u.meshyKey)
    if (k) return k
  }
  return process.env.MESHY_API_KEY || null
}

async function meshyFetch(
  path: string,
  key: string,
  init?: RequestInit
): Promise<unknown> {
  const res = await fetch(`${MESHY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const msg =
      (data as { message?: string; detail?: string } | null)?.message ??
      (data as { detail?: string } | null)?.detail ??
      `Meshy ha risposto ${res.status}`
    throw new Error(String(msg))
  }
  return data
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string
    artStyle?: string
  }
  const prompt = String(body.prompt ?? '').trim().slice(0, 600)
  if (prompt.length < 3) {
    return NextResponse.json(
      { error: 'Descrivi il modello da creare (almeno 3 parole)' },
      { status: 400 }
    )
  }
  const artStyle: ArtStyle = ART_STYLES.includes(body.artStyle as ArtStyle)
    ? (body.artStyle as ArtStyle)
    : 'realistic'

  const key = await getUserKey(user.id)
  if (!key) {
    return NextResponse.json(
      {
        error:
          'Serve la chiave API di Meshy: inseriscila qui sotto (la trovi gratis su meshy.ai, in Account → API Key)',
        needsKey: true,
      },
      { status: 400 }
    )
  }

  // limite gentile: max 10 generazioni Darpx all'ora per utente
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000)
    const recent = await db.modelAsset.count({
      where: { ownerId: user.id, name: { startsWith: 'Darpx ·' }, createdAt: { gt: since } },
    })
    if (recent >= 10) {
      return NextResponse.json(
        { error: 'Troppe generazioni: riprova tra poco (limite 10/ora)' },
        { status: 429 }
      )
    }
  } catch {
    // se il conteggio fallisce, prosegui
  }

  try {
    const data = (await meshyFetch('/text-to-3d', key, {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        art_style: artStyle,
        topology: 'quad',
        target_polygons: 30000,
      }),
    })) as { result?: string }
    const jobId = data?.result
    if (!jobId) {
      throw new Error('Meshy non ha restituito un job')
    }
    return NextResponse.json({ jobId, prompt })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Errore Meshy'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const jobId = new URL(req.url).searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'jobId mancante' }, { status: 400 })
  }

  const key = await getUserKey(user.id)
  if (!key) {
    return NextResponse.json({ error: 'Chiave Meshy non configurata', needsKey: true }, { status: 400 })
  }

  let task: {
    status?: string
    progress?: number
    result?: { model_url?: string }
  }
  try {
    task = (await meshyFetch(`/text-to-3d/${jobId}`, key)) as typeof task
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Errore Meshy'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const status = String(task.status ?? 'PENDING')
  if (status === 'FAILED') {
    return NextResponse.json({
      status: 'failed',
      error: 'La generazione non è riuscita: prova a riformulare la descrizione',
    })
  }
  if (status === 'EXPIRED') {
    return NextResponse.json({ status: 'failed', error: 'Il risultato è scaduto: rigenera' })
  }
  if (status !== 'SUCCEEDED') {
    return NextResponse.json({
      status: status === 'IN_PROGRESS' ? 'running' : 'pending',
      progress: task.progress ?? 0,
    })
  }

  // completato: scarica il GLB e portalo su Vercel Blob
  const modelUrl = task.result?.model_url
  if (!modelUrl) {
    return NextResponse.json({ status: 'failed', error: 'Nessun modello nel risultato' })
  }
  try {
    const dl = await fetch(modelUrl)
    if (!dl.ok) throw new Error(`download ${dl.status}`)
    const buf = Buffer.from(await dl.arrayBuffer())
    const safe = jobId.replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'darpx'
    const { url } = await put(`darpx/darpx-${safe}.glb`, buf, {
      access: 'public',
      contentType: 'model/gltf-binary',
      addRandomSuffix: true,
    })

    const created = await db.modelAsset.create({
      data: {
        ownerId: user.id,
        name: `Darpx · modello ${Date.now().toString(36).slice(-4)}`,
        url,
        size: buf.length,
        scale: 1,
      },
      select: { id: true, name: true, url: true, size: true },
    })
    return NextResponse.json({ status: 'succeeded', model: created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'errore copia modello'
    console.error('darpx download error', msg)
    return NextResponse.json({
      status: 'failed',
      error: 'Download del modello non riuscito: riprova tra poco',
    })
  }
}
