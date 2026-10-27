import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getSessionUser } from '@/lib/auth'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

// Limite per l'upload locale (i GLB pesanti in produzione passano da Blob,
// che bypassa il limite di ~4.5MB del body delle serverless Vercel)
const MAX_LOCAL_BYTES = 60 * 1024 * 1024

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  return NextResponse.json({
    mode: process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local',
  })
}

// In produzione (Blob attivo) questo POST riceve la richiesta di token del
// client-upload: il file vero e proprio va DIRETTO dal browser a Blob e non
// passa da qui (così niente limiti di dimensione delle serverless).
// In locale invece salviamo il FormData su public/uploads.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const body = (await req.json()) as HandleUploadBody
      const jsonResponse = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: [
            'model/gltf-binary',
            'model/gltf+json',
            'application/octet-stream',
            'image/png',
            'image/jpeg',
            'image/webp',
          ],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({}),
        }),
        onUploadCompleted: async () => {
          // niente da fare: l'URL viene già usato dal client
        },
      })
      return NextResponse.json(jsonResponse)
    } catch (error) {
      console.error('[upload] blob client-upload failed:', error)
      return NextResponse.json(
        { error: 'Generazione token upload fallita' },
        { status: 400 }
      )
    }
  }

  // ---------- modalità locale (sviluppo) ----------
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File mancante' }, { status: 400 })
  }
  if (file.size > MAX_LOCAL_BYTES) {
    return NextResponse.json(
      { error: 'File troppo grande (max 60MB in locale)' },
      { status: 413 }
    )
  }
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length < 4 || buf.toString('ascii', 0, 4) !== 'glTF') {
    return NextResponse.json(
      { error: 'Formato non valido: servono file .glb (glTF binario)' },
      { status: 415 }
    )
  }
  const dir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(dir, { recursive: true })
  const safeBase =
    file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-_ ]+/g, '_')
      .trim()
      .slice(0, 60) || 'modello'
  const filename = `${safeBase}-${crypto.randomBytes(4).toString('hex')}.glb`
  await writeFile(path.join(dir, filename), buf)
  return NextResponse.json({ url: `/uploads/${filename}`, name: file.name })
}
