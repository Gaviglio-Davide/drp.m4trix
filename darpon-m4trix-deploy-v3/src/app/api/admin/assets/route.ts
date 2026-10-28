import { NextRequest, NextResponse } from 'next/server'
import { del, list } from '@vercel/blob'
import { readdir, stat, unlink } from 'fs/promises'
import path from 'path'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// Lista dei modelli 3D caricati: da Vercel Blob (produzione) oppure
// da public/uploads (sviluppo locale)
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blobs = await list({ limit: 200 })
    const assets = blobs.blobs.map(b => ({
      url: b.url,
      name: b.pathname,
      bytes: b.size,
      uploadedAt: b.uploadedAt,
      store: 'blob',
    }))
    return NextResponse.json({ assets, store: 'blob' })
  }

  try {
    const dir = path.join(process.cwd(), 'public', 'uploads')
    const files = await readdir(dir)
    const assets = []
    for (const f of files) {
      if (f === '.gitkeep') continue
      const s = await stat(path.join(dir, f))
      assets.push({
        url: `/uploads/${f}`,
        name: f,
        bytes: s.size,
        uploadedAt: s.mtime.toISOString(),
        store: 'local',
      })
    }
    assets.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
    return NextResponse.json({ assets, store: 'local' })
  } catch {
    return NextResponse.json({ assets: [], store: 'local' })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'URL mancante' }, { status: 400 })

  if (process.env.BLOB_READ_WRITE_TOKEN && !url.startsWith('/uploads/')) {
    await del(url)
    return NextResponse.json({ ok: true })
  }

  // evita path traversal: tieni solo il nome del file
  const name = path.basename(url)
  const file = path.join(process.cwd(), 'public', 'uploads', name)
  try {
    await unlink(file)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'File non trovato' }, { status: 404 })
  }
}
