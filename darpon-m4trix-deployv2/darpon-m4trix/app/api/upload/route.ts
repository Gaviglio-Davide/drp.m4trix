import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionUser } from '@/lib/auth'
import { mkdir, writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import path from 'path'

export const runtime = 'nodejs'

// ---------------------------------------------------------------
// Upload modelli 3D (GLB/GLTF) con doppia modalità:
//  - "blob"  (produzione Vercel): client-upload diretto dal browser
//    al CDN di Vercel Blob tramite handleUpload — bypassa il limite
//    di ~4.5MB del body delle serverless e serve i file via CDN.
//  - "local" (sviluppo): FormData → public/uploads con validazione
//    magic-bytes del formato glTF.
// Il client sceglie la modalità con una GET di probe → { mode }.
// ---------------------------------------------------------------

const BLOB_MAX_SIZE = 200 * 1024 * 1024 // 200MB
const LOCAL_MAX_SIZE = 60 * 1024 * 1024 // 60MB su disco locale
const ALLOWED_EXTENSIONS = ['.glb', '.gltf']
const ALLOWED_CONTENT_TYPES = [
  'model/gltf-binary',
  'model/gltf+json',
  'application/octet-stream',
]

function safeExt(name: string): string {
  const ext = path.extname(name).toLowerCase()
  return ALLOWED_EXTENSIONS.includes(ext) ? ext : ''
}

/** GET: probe — dice al client quale modalità di upload usare */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }
  const mode = process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local'
  return NextResponse.json({ mode })
}

/**
 * POST con doppio ruolo:
 *  (a) blob attivo → genera il token client-upload (dal browser, con
 *      sessione) e riceve il callback di completamento (dai server
 *      Vercel, senza cookie ma firmato e validato da handleUpload);
 *  (b) blob assente → upload FormData classico su public/uploads.
 */
export async function POST(request: NextRequest) {
  const blobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN)

  if (blobEnabled) {
    const body = (await request.json().catch(() => null)) as HandleUploadBody | null
    if (!body) {
      return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
    }

    // Il callback "blob.upload-completed" arriva dai server Vercel senza
    // cookie di sessione: l'autenticazione utente serve solo quando il
    // browser chiede il token per l'upload.
    const bodyType = (body as { type?: string }).type
    if (bodyType === 'blob.generate-client-token') {
      const user = await getSessionUser()
      if (!user) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
      }
    }

    try {
      const jsonResponse = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname: string) => {
          if (!safeExt(pathname)) {
            throw new Error('Formato non supportato: carica un file .glb o .gltf')
          }
          return {
            allowedContentTypes: ALLOWED_CONTENT_TYPES,
            maximumSizeInBytes: BLOB_MAX_SIZE,
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ via: 'darpon-m4trix' }),
          }
        },
        onUploadCompleted: async ({ blob }) => {
          try {
            console.log('[upload] completato su Blob:', blob.pathname, blob.url)
          } catch (err) {
            console.error('[upload] errore callback:', err)
          }
        },
      })
      return NextResponse.json(jsonResponse)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload fallito'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  // ---- fallback locale: FormData → public/uploads ----
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Nessun file ricevuto' }, { status: 400 })
  }
  if (file.size > LOCAL_MAX_SIZE) {
    return NextResponse.json(
      { error: 'File troppo grande: il limite è 60MB' },
      { status: 413 }
    )
  }
  const ext = safeExt(file.name)
  if (!ext) {
    return NextResponse.json(
      { error: 'Formato non supportato: carica un file .glb o .gltf' },
      { status: 415 }
    )
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length < 4 || buf.subarray(0, 4).toString('ascii') !== 'glTF') {
    return NextResponse.json(
      { error: 'Il file non è un modello glTF valido' },
      { status: 415 }
    )
  }

  const base =
    path
      .basename(file.name, ext)
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'modello'
  const filename = `${base}-${randomBytes(4).toString('hex')}${ext}`
  const dir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), buf)

  return NextResponse.json({ name: file.name, url: `/uploads/${filename}` })
}
