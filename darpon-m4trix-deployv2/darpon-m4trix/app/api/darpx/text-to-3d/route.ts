import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { put } from '@vercel/blob'
import {
  ART_STYLES,
  PROVIDER_ORDER,
  PROVIDERS,
  poll3D,
  submit3D,
  type ArtStyle,
  type ProviderId,
  type SubmitResult,
} from '@/lib/providers3d'
import { providerStatuses, resolveProviderKey } from '@/lib/provider-keys'

export const runtime = 'nodejs'
export const maxDuration = 60

// ============================================================
// Darpx.ai — Testo o Immagine → 3D (multi-provider)
//   POST {prompt, artStyle, provider?, image?}  → avvia il job
//        (provider "auto" = primo disponibile, con fallback)
//   GET  ?jobId=tripo:text:xxxx                 → stato; quando
//        pronto scarica il GLB, lo copia su Blob e lo registra
//        nei "Progetti importati".
// Le chiavi sono cifrate nel database e non passano mai dal browser.
// ============================================================

function sanitizePrompt(s: unknown, max = 600): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max)
}

function nameFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim()
  const short = clean.length > 28 ? `${clean.slice(0, 28)}…` : clean
  return `Darpx · ${short || 'modello'}`
}

/** copia il GLB su Vercel Blob e registra il modello nell'account */
async function storeModel(
  userId: string,
  source: Buffer | string,
  name: string,
  sizeHint?: number
) {
  let buf: Buffer
  if (typeof source === 'string') {
    const dl = await fetch(source, { signal: AbortSignal.timeout(45000) })
    if (!dl.ok) throw new Error(`download ${dl.status}`)
    buf = Buffer.from(await dl.arrayBuffer())
  } else {
    buf = source
  }
  const stamp = Date.now().toString(36).slice(-5)
  const { url } = await put(`darpx/darpx-${stamp}.glb`, buf, {
    access: 'public',
    contentType: 'model/gltf-binary',
    addRandomSuffix: true,
  })
  const created = await db.modelAsset.create({
    data: {
      ownerId: userId,
      name: name.slice(0, 80),
      url,
      size: sizeHint ?? buf.length,
      scale: 1,
    },
    select: { id: true, name: true, url: true, size: true },
  })
  return created
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string
    artStyle?: string
    provider?: string
    image?: string // data URL ridotto lato client (max ~1024px)
  }
  const prompt = sanitizePrompt(body.prompt)
  const image =
    typeof body.image === 'string' && body.image.startsWith('data:image/') && body.image.length < 9_000_000
      ? body.image
      : undefined
  if (prompt.length < 3 && !image) {
    return NextResponse.json(
      { error: 'Descrivi il modello da creare (almeno 3 parole) oppure carica un\'immagine' },
      { status: 400 }
    )
  }
  const artStyle: ArtStyle = ART_STYLES.includes(body.artStyle as ArtStyle)
    ? (body.artStyle as ArtStyle)
    : 'realistic'

  const statuses = await providerStatuses(user.id)
  const available = statuses.filter(s => s.hasKey)
  if (available.length === 0) {
    return NextResponse.json(
      {
        error:
          'Serve almeno una chiave API di un motore 3D (Tripo, fal.ai, Stability o Meshy): aggiungine una qui sotto, oppure chiedi all\'admin di configurarne una globale dal pannello admin.',
        needsKey: true,
      },
      { status: 400 }
    )
  }

  // ordine di tentativo: quello scelto dall'utente, poi gli altri
  const chosen = PROVIDER_ORDER.includes(body.provider as ProviderId)
    ? (body.provider as ProviderId)
    : null
  const order: ProviderId[] = chosen
    ? [chosen, ...PROVIDER_ORDER.filter(p => p !== chosen)]
    : [...PROVIDER_ORDER]
  const queue = order.filter(p => available.some(s => s.id === p))
  if (queue.length === 0) queue.push(...available.map(s => s.id))

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

  const errors: string[] = []
  for (const provider of queue) {
    const { key } = await resolveProviderKey(user.id, provider)
    if (!key) continue
    try {
      const result: SubmitResult = await submit3D(provider, {
        mode: image ? 'image' : 'text',
        prompt,
        artStyle,
        imageDataUrl: image,
        key,
      })
      // Stability (e in futuro altri sincroni): GLB già pronto
      if (result.kind === 'glb') {
        try {
          const model = await storeModel(
            user.id,
            result.buffer,
            nameFromPrompt(prompt || 'da immagine'),
            result.buffer.length
          )
          return NextResponse.json({ status: 'succeeded', model, provider })
        } catch (e) {
          console.error('darpx store error', e)
          return NextResponse.json(
            { status: 'failed', error: 'Download del modello non riuscito: riprova tra poco' }
          )
        }
      }
      return NextResponse.json({ jobId: result.jobId, provider, prompt })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'errore'
      errors.push(`${PROVIDERS[provider].label}: ${msg}`)
      // qualunque errore del provider → prova il successivo nella coda
      continue
    }
  }
  return NextResponse.json(
    {
      error:
        errors.length > 0
          ? `Nessun motore 3D disponibile. ${errors.join(' · ')}`
          : 'Nessun motore 3D disponibile: controlla le chiavi API',
      needsKey: true,
    },
    { status: 502 }
  )
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const params = new URL(req.url).searchParams
  const jobId = params.get('jobId')
  const niceName = sanitizePrompt(params.get('name'), 40)
  if (!jobId) {
    return NextResponse.json({ error: 'jobId mancante' }, { status: 400 })
  }

  // jobId = "provider:modo:id" — così sappiamo quale chiave usare
  const provider = jobId.split(':')[0] as ProviderId
  const { key } = await resolveProviderKey(user.id, provider)
  if (!key) {
    return NextResponse.json(
      { error: 'Chiave del motore 3D non più disponibile', needsKey: true },
      { status: 400 }
    )
  }

  const poll = await poll3D(jobId, key)
  if (poll.status === 'failed') {
    return NextResponse.json({ status: 'failed', error: poll.error })
  }
  if (poll.status !== 'succeeded') {
    return NextResponse.json({ status: poll.status, progress: poll.progress })
  }

  try {
    const model = await storeModel(
      user.id,
      poll.modelUrl,
      niceName ? `Darpx · ${niceName}` : 'Darpx · modello'
    )
    return NextResponse.json({ status: 'succeeded', model })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'errore copia modello'
    console.error('darpx download error', msg)
    return NextResponse.json({
      status: 'failed',
      error: 'Download del modello non riuscito: riprova tra poco',
    })
  }
}
