// ============================================================
// Darpx.ai · Motore 3D multi-provider (SOLO SERVER)
// Sostituisce il vecchio ponte solo-Meshy: ora la generazione
// testo→3D e immagine→3D può usare, in cascata:
//   1. Tripo        (api Tripo V3 — qualità top, testo+immagine)
//   2. fal.ai       (Hunyuan 3D v3.1 rapid — veloce, testo+immagine)
//   3. Stability    (Stable Fast 3D — immagine→3D, testo in 2 passi)
//   4. Meshy        (legacy, tenuto per retrocompatibilità chiavi)
// Se un provider rifiuta (chiave/quota), si passa al successivo:
// niente più blocchi.
// ============================================================

export type ProviderId = 'tripo' | 'fal' | 'stability' | 'meshy'

export type ProviderMeta = {
  id: ProviderId
  label: string
  icon: string
  site: string
  keyUrl: string
  keyHint: string
  envVar: string
  supportsText: boolean
  supportsImage: boolean
  synchronous: boolean // Stability: genera nella chiamata POST, niente polling
  note: string
}

export const PROVIDER_ORDER: ProviderId[] = ['tripo', 'fal', 'stability', 'meshy']

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  tripo: {
    id: 'tripo',
    label: 'Tripo 3D',
    icon: '🔷',
    site: 'platform.tripo3d.ai',
    keyUrl: 'https://platform.tripo3d.ai',
    keyHint: 'tsk_...',
    envVar: 'TRIPO_API_KEY',
    supportsText: true,
    supportsImage: true,
    synchronous: false,
    note: 'Qualità molto alta, testo e immagine. Crediti gratuiti alla registrazione.',
  },
  fal: {
    id: 'fal',
    label: 'fal.ai · Hunyuan 3D',
    icon: '🦄',
    site: 'fal.ai',
    keyUrl: 'https://fal.ai/dashboard/keys',
    keyHint: 'xxxxx-xxxxx...:xxxxxxxxxx',
    envVar: 'FAL_API_KEY',
    supportsText: true,
    supportsImage: true,
    synchronous: false,
    note: 'Hunyuan 3D v3.1: veloce ed economico (~0,22 $/generazione), testo e immagine. Crediti omaggio alla registrazione.',
  },
  stability: {
    id: 'stability',
    label: 'Stable Fast 3D',
    icon: '⚡',
    site: 'platform.stability.ai',
    keyUrl: 'https://platform.stability.ai/account/keys',
    keyHint: 'sk-...',
    envVar: 'STABILITY_API_KEY',
    supportsText: true, // testo→immagine (SD core) + immagine→3D (SF3D)
    supportsImage: true,
    synchronous: true,
    note: 'Stable Fast 3D by Stability AI: 25 crediti gratis alla registrazione (10 per modello).',
  },
  meshy: {
    id: 'meshy',
    label: 'Meshy (compatibilità)',
    icon: '🧩',
    site: 'meshy.ai',
    keyUrl: 'https://meshy.ai',
    keyHint: 'msy_...',
    envVar: 'MESHY_API_KEY',
    supportsText: true,
    supportsImage: true,
    synchronous: false,
    note: 'Il vecchio motore: resta disponibile se hai già una chiave Meshy.',
  },
}

export const ART_STYLES = ['realistic', 'cartoon', 'sculpture', 'low_poly'] as const
export type ArtStyle = (typeof ART_STYLES)[number]

const STYLE_HINT: Record<ArtStyle, string> = {
  realistic: 'highly detailed, realistic proportions and materials',
  cartoon: 'stylized cartoon look, smooth shapes, bright colors',
  sculpture: 'clean sculpture / clay render look',
  low_poly: 'low poly game asset style',
}

type FetchOpts = { timeoutMs?: number }

async function jsonFetch(
  url: string,
  init: RequestInit & FetchOpts
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { timeoutMs = 25000, ...rest } = init
  try {
    const res = await fetch(url, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    let data: unknown = null
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'errore di rete'
    return { ok: false, status: 0, data: { message: msg } }
  }
}

function errMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const m =
      (d.message as string) ??
      (d.detail as string) ??
      (d.error as string) ??
      ((d.data as Record<string, unknown> | undefined)?.message as string)
    if (typeof m === 'string' && m) return m
  }
  if (typeof data === 'string' && data) return data.slice(0, 200)
  return fallback
}

/** true se l'errore del provider suggerisce di provare il successivo */
export function isRetryableStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429 || status === 0
}

// ------------------------------------------------------------
// Invio del job. Ritorna un jobId opaco "provider:kind:id"
// (per Stability, sincrono, ritorna il GLB direttamente).
// ------------------------------------------------------------

export type SubmitResult =
  | { kind: 'job'; jobId: string }
  | { kind: 'glb'; buffer: Buffer; contentType: string }

const TRIPO_BASE = 'https://openapi.tripo3d.ai/v3'
const FAL_BASE = 'https://queue.fal.run/fal-ai'
const FAL_TEXT_MODEL = 'hunyuan-3d/v3.1/rapid/text-to-3d'
const FAL_IMAGE_MODEL = 'hunyuan-3d/v3.1/rapid/image-to-3d'
const STABILITY_SF3D = 'https://api.stability.ai/v2alpha/stable-fast-3d'
const STABILITY_TXT2IMG = 'https://api.stability.ai/v2beta/stable-image/generate/core'
const MESHY_BASE = 'https://api.meshy.ai/openapi/v1'

export async function submit3D(
  provider: ProviderId,
  opts: {
    mode: 'text' | 'image'
    prompt: string
    artStyle: ArtStyle
    imageDataUrl?: string // data:image/...;base64,....
    key: string
  }
): Promise<SubmitResult> {
  if (provider === 'tripo') return submitTripo(opts)
  if (provider === 'fal') return submitFal(opts)
  if (provider === 'stability') return submitStability(opts)
  return submitMeshy(opts)
}

// ---------------- Tripo V3 ----------------

async function tripoUploadImage(
  key: string,
  dataUrl: string
): Promise<string | null> {
  const m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(dataUrl)
  if (!m) return null
  const fd = new FormData()
  fd.append('file', new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), 'input.png')
  const r = await jsonFetch(`${TRIPO_BASE}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
    timeoutMs: 30000,
  })
  if (!r.ok) return null
  const d = r.data as Record<string, unknown> | null
  const token =
    (d?.file_token as string) ??
    ((d?.data as Record<string, unknown> | undefined)?.file_token as string)
  return token ?? null
}

async function submitTripo(opts: {
  mode: 'text' | 'image'
  prompt: string
  artStyle: ArtStyle
  imageDataUrl?: string
  key: string
}): Promise<SubmitResult> {
  const { key, prompt, artStyle } = opts
  let body: Record<string, unknown>
  if (opts.mode === 'image' && opts.imageDataUrl) {
    const token = await tripoUploadImage(key, opts.imageDataUrl)
    body = token
      ? { input: { file_token: token } }
      : { input: opts.imageDataUrl }
  } else {
    body = {
      prompt: opts.mode === 'image' ? prompt || '3D asset from image' : prompt,
    }
  }
  // lo stile viaggia nel prompt: Tripo non ha un campo art_style dedicato
  if (opts.mode === 'text' && artStyle !== 'realistic') {
    body.prompt = `${prompt}, ${STYLE_HINT[artStyle]}`
  }
  const r = await jsonFetch(`${TRIPO_BASE}/generation/text-to-model`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Tripo: ${errMessage(r.data, `errore ${r.status}`)}`)
  const d = r.data as Record<string, unknown>
  const inner = (d.data as Record<string, unknown> | undefined) ?? d
  const id = (inner.task_id as string) ?? (inner.id as string) ?? (d.task_id as string)
  if (!id) throw new Error('Tripo non ha restituito un task')
  return { kind: 'job', jobId: `tripo:${opts.mode}:${id}` }
}

// ---------------- fal.ai (Hunyuan 3D) ----------------

async function submitFal(opts: {
  mode: 'text' | 'image'
  prompt: string
  artStyle: ArtStyle
  imageDataUrl?: string
  key: string
}): Promise<SubmitResult> {
  const { key, prompt, artStyle } = opts
  let url: string
  let body: Record<string, unknown>
  if (opts.mode === 'image' && opts.imageDataUrl) {
    url = `${FAL_BASE}/${FAL_IMAGE_MODEL}`
    body = { image_url: opts.imageDataUrl, enable_pbr: true }
  } else {
    url = `${FAL_BASE}/${FAL_TEXT_MODEL}`
    const p =
      artStyle !== 'realistic' ? `${prompt}, ${STYLE_HINT[artStyle]}` : prompt
    body = { prompt: p.slice(0, 190), enable_pbr: true }
  }
  const r = await jsonFetch(url, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`fal.ai: ${errMessage(r.data, `errore ${r.status}`)}`)
  const d = r.data as Record<string, unknown>
  const id = (d.request_id as string) ?? ((d.response as Record<string, unknown> | undefined)?.request_id as string)
  if (!id) throw new Error('fal.ai non ha restituito la richiesta')
  return { kind: 'job', jobId: `fal:${opts.mode}:${id}` }
}

// ---------------- Stability (SF3D, sincrono) ----------------

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const m = /^data:image\/(png|jpeg|webp);base64,(.*)$/i.exec(dataUrl)
  if (!m) return null
  const type = m[1] === 'jpeg' ? 'image/jpeg' : `image/${m[1]}`
  return {
    blob: new Blob([Buffer.from(m[2], 'base64')], { type }),
    ext: m[1],
  }
}

async function stabilityTextToImage(
  key: string,
  prompt: string,
  artStyle: ArtStyle
): Promise<Blob> {
  const fd = new FormData()
  fd.append('prompt', `${prompt}, ${STYLE_HINT[artStyle] || 'high quality'}`.slice(0, 900))
  fd.append('output_format', 'png')
  const res = await fetch(STABILITY_TXT2IMG, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'image/*',
    },
    body: fd,
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Stability (immagine): ${errMessage(t, `errore ${res.status}`)}`)
  }
  return await res.blob()
}

async function submitStability(opts: {
  mode: 'text' | 'image'
  prompt: string
  artStyle: ArtStyle
  imageDataUrl?: string
  key: string
}): Promise<SubmitResult> {
  const { key } = opts
  // SF3D vuole un'immagine: col testo generiamo prima la concept image
  let image: Blob
  if (opts.mode === 'image' && opts.imageDataUrl) {
    const conv = dataUrlToBlob(opts.imageDataUrl)
    if (!conv) throw new Error('Formato immagine non supportato da Stable Fast 3D')
    image = conv.blob
  } else {
    image = await stabilityTextToImage(key, opts.prompt, opts.artStyle)
  }
  const fd = new FormData()
  fd.append('image', image, 'input.png')
  const res = await fetch(STABILITY_SF3D, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
    signal: AbortSignal.timeout(55000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Stable Fast 3D: ${errMessage(t, `errore ${res.status}`)}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1000) throw new Error('Stable Fast 3D: risposta vuota')
  return { kind: 'glb', buffer: buf, contentType: 'model/gltf-binary' }
}

// ---------------- Meshy (legacy) ----------------

async function submitMeshy(opts: {
  mode: 'text' | 'image'
  prompt: string
  artStyle: ArtStyle
  imageDataUrl?: string
  key: string
}): Promise<SubmitResult> {
  const { key, prompt, artStyle } = opts
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  let r: { ok: boolean; status: number; data: unknown }
  if (opts.mode === 'image' && opts.imageDataUrl) {
    r = await jsonFetch(`${MESHY_BASE}/image-to-3d`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ image_url: opts.imageDataUrl, should_remove_background: false }),
      timeoutMs: 20000,
    })
  } else {
    r = await jsonFetch(`${MESHY_BASE}/text-to-3d`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        art_style: artStyle,
        topology: 'quad',
        target_polygons: 30000,
      }),
    })
  }
  if (!r.ok) throw new Error(`Meshy: ${errMessage(r.data, `errore ${r.status}`)}`)
  const d = r.data as Record<string, unknown>
  const id = d.result as string
  if (!id) throw new Error('Meshy non ha restituito un job')
  return { kind: 'job', jobId: `meshy:${opts.mode}:${id}` }
}

// ------------------------------------------------------------
// Polling del job (provider asincroni)
// ------------------------------------------------------------

export type PollResult =
  | { status: 'pending' | 'running'; progress: number }
  | { status: 'succeeded'; modelUrl: string }
  | { status: 'failed'; error?: string }

export function parseJobId(jobId: string): { provider: ProviderId; mode: 'text' | 'image'; id: string } | null {
  const m = /^(tripo|fal|stability|meshy):(text|image):(.+)$/.exec(jobId)
  if (!m) return null
  return { provider: m[1] as ProviderId, mode: m[2] as 'text' | 'image', id: m[3] }
}

export async function poll3D(jobId: string, key: string): Promise<PollResult> {
  const parsed = parseJobId(jobId)
  if (!parsed) return { status: 'failed', error: 'Job non riconosciuto' }
  if (parsed.provider === 'tripo') return pollTripo(parsed.id, key)
  if (parsed.provider === 'fal') return pollFal(parsed.id, key)
  return pollMeshy(parsed, key)
}

async function pollTripo(id: string, key: string): Promise<PollResult> {
  const r = await jsonFetch(`${TRIPO_BASE}/tasks/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
    timeoutMs: 15000,
  })
  if (!r.ok) {
    return { status: 'failed', error: `Tripo: ${errMessage(r.data, `errore ${r.status}`)}` }
  }
  const d = r.data as Record<string, unknown>
  const inner = (d.data as Record<string, unknown> | undefined) ?? d
  const status = String(inner.status ?? 'queued').toLowerCase()
  const progress = Math.max(0, Math.min(99, Math.round(Number(inner.progress ?? 0) || 0)))
  if (status === 'success' || status === 'succeeded' || status === 'completed') {
    const out = (inner.output ?? {}) as Record<string, unknown>
    const url =
      (out.pbr_model as string) ??
      (out.model as string) ??
      (out.base_model as string) ??
      (out.glb as string)
    if (url) return { status: 'succeeded', modelUrl: url }
    return { status: 'failed', error: 'Tripo: nessun modello nel risultato' }
  }
  if (status === 'failed' || status === 'cancelled' || status === 'banned' || status === 'expired') {
    return { status: 'failed', error: 'La generazione non è riuscita: riprova' }
  }
  return { status: status === 'running' ? 'running' : 'pending', progress }
}

async function pollFal(id: string, key: string): Promise<PollResult> {
  const r = await jsonFetch(`${FAL_BASE}/requests/${id}/status?logs=0`, {
    headers: { Authorization: `Key ${key}` },
    timeoutMs: 15000,
  })
  if (!r.ok) {
    return { status: 'failed', error: `fal.ai: ${errMessage(r.data, `errore ${r.status}`)}` }
  }
  const d = r.data as Record<string, unknown>
  const st = String(d.status ?? 'IN_QUEUE').toUpperCase()
  if (st === 'COMPLETED') {
    // recupera il risultato vero
    const rr = await jsonFetch(`${FAL_BASE}/requests/${id}`, {
      headers: { Authorization: `Key ${key}` },
      timeoutMs: 20000,
    })
    if (!rr.ok) {
      return { status: 'failed', error: `fal.ai: risultato non leggibile (${rr.status})` }
    }
    const out = rr.data as Record<string, unknown>
    const mu = out.model_urls as Record<string, unknown> | undefined
    const glb = mu?.glb as Record<string, unknown> | string | undefined
    const url = typeof glb === 'string' ? glb : (glb?.url as string | undefined)
    // fallback: qualche versione mette i file in surfaces/model_file
    const alt =
      url ??
      ((out.surfaces as Record<string, unknown> | undefined)?.model_file as string | undefined)
    if (alt) return { status: 'succeeded', modelUrl: alt }
    return { status: 'failed', error: 'fal.ai: nessun modello nel risultato' }
  }
  if (st === 'FAILED' || st === 'ERROR') {
    return { status: 'failed', error: 'fal.ai: generazione non riuscita, riprova' }
  }
  const pos = Number(d.queue_position ?? 0)
  return { status: st === 'IN_PROGRESS' ? 'running' : 'pending', progress: st === 'IN_PROGRESS' ? 60 : Math.max(5, 30 - pos * 5) }
}

async function pollMeshy(
  parsed: { provider: ProviderId; mode: 'text' | 'image'; id: string },
  key: string
): Promise<PollResult> {
  const r = await jsonFetch(`${MESHY_BASE}/${parsed.mode}-to-3d/${parsed.id}`, {
    headers: { Authorization: `Bearer ${key}` },
    timeoutMs: 15000,
  })
  if (!r.ok) {
    return { status: 'failed', error: `Meshy: ${errMessage(r.data, `errore ${r.status}`)}` }
  }
  const d = r.data as Record<string, unknown>
  const status = String(d.status ?? 'PENDING')
  const progress = Math.round((Number(d.progress ?? 0) || 0) * 100)
  if (status === 'SUCCEEDED') {
    const res = (d.result ?? {}) as Record<string, unknown>
    const url = res.model_url as string | undefined
    if (url) return { status: 'succeeded', modelUrl: url }
    return { status: 'failed', error: 'Meshy: nessun modello nel risultato' }
  }
  if (status === 'FAILED') {
    return { status: 'failed', error: 'La generazione non è riuscita: riformula la descrizione' }
  }
  if (status === 'EXPIRED') {
    return { status: 'failed', error: 'Risultato scaduto: rigenera' }
  }
  return { status: status === 'IN_PROGRESS' ? 'running' : 'pending', progress }
}

// ------------------------------------------------------------
// Test rapido delle chiavi (usato dal pannello admin)
// ------------------------------------------------------------

export async function testProviderKey(
  provider: ProviderId,
  key: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === 'stability') {
      const r = await jsonFetch('https://api.stability.ai/v1/user/account', {
        headers: { Authorization: `Bearer ${key}` },
        timeoutMs: 12000,
      })
      if (r.ok) {
        const d = r.data as Record<string, unknown>
        const email = d.email as string | undefined
        return { ok: true, message: `Chiave valida${email ? ` (${email})` : ''} ✅` }
      }
      if (r.status === 401) return { ok: false, message: 'Chiave non valida (401)' }
      return { ok: false, message: `Risposta inattesa (${r.status})` }
    }
    if (provider === 'fal') {
      // richiesta su un id inesistente: 401 = chiave sbagliata, 404/400 = chiave buona
      const r = await jsonFetch(
        `${FAL_BASE}/requests/00000000-0000-0000-0000-000000000000/status`,
        { headers: { Authorization: `Key ${key}` }, timeoutMs: 12000 }
      )
      if (r.status === 401 || r.status === 403) {
        return { ok: false, message: 'Chiave non valida (401)' }
      }
      return { ok: true, message: 'Chiave valida ✅' }
    }
    if (provider === 'tripo') {
      const r = await jsonFetch(`${TRIPO_BASE}/tasks/00000000-0000-0000-0000-000000000000`, {
        headers: { Authorization: `Bearer ${key}` },
        timeoutMs: 12000,
      })
      if (r.status === 401 || r.status === 403) {
        return { ok: false, message: 'Chiave non valida (401)' }
      }
      // 404 = rotta raggiunta con chiave valida
      return { ok: true, message: 'Chiave valida ✅' }
    }
    // meshy
    const r = await jsonFetch(`${MESHY_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${key}` },
      timeoutMs: 12000,
    })
    if (r.status === 401 || r.status === 403) {
      return { ok: false, message: 'Chiave non valida (401)' }
    }
    return { ok: true, message: r.ok ? 'Chiave valida ✅' : 'Chiave salvata (test non disponibile)' }
  } catch {
    return { ok: false, message: 'Test non riuscito (rete)' }
  }
}
