'use client'

// ============================================================
// Sezione "Progetti importati": spazio dedicato della home dove
// caricare TUTTI i modelli 3D che si vogliono (.glb/.gltf, anche
// più file insieme). Restano in ordine, sono salvati nell'account
// e vengono trovati automaticamente dall'editor di ogni progetto.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  CloudUpload,
  Eye,
  Loader2,
  Package,
  Trash2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { upload } from '@vercel/blob/client'
import { fetchAuth } from '@/lib/http'
import GLBViewer from '@/components/GLBViewer'
import { sectionOf, useUI } from '@/lib/ui-store'

type ModelRow = {
  id: string
  name: string
  url: string
  size: number | null
  scale?: number | null
  createdAt: string
}

const SIZES = [0.5, 1, 1.5, 2, 3]

function fmtScale(s?: number | null) {
  const v = s ?? 1
  return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}x`
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImportedModels() {
  const [models, setModels] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const site = useUI(s => s.site)
  const section = sectionOf(site.sections, 'importati')
  const [preview, setPreview] = useState<ModelRow | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetchAuth('/api/models')
      if (!res.ok) return
      const data = (await res.json()) as { models?: ModelRow[] }
      setModels(data.models ?? [])
    } catch {
      // silenzioso
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const uploadFiles = async (files: FileList) => {
    const list = Array.from(files).filter(f => /\.(glb|gltf)$/i.test(f.name))
    if (!list.length) {
      const meshyFiles = Array.from(files).filter(f => /\.meshy$/i.test(f.name))
      if (meshyFiles.length) {
        toast.error(
          'I file .meshy di Meshy sono cifrati e non si possono usare: scarica il modello in GLB (i link GLB che ti ho preparato) e carica quello 📦'
        )
      } else {
        toast.error('Formato non supportato: carica file .glb o .gltf')
      }
      return
    }
    setProgress({ done: 0, total: list.length })
    let okCount = 0
    try {
      // blob mode = produzione (Vercel): upload diretto browser → Blob
      const modeRes = await fetchAuth('/api/upload')
      const mode = (
        (await modeRes.json().catch(() => ({}))) as { mode?: string }
      ).mode

      for (let i = 0; i < list.length; i++) {
        const file = list[i]
        setProgress({ done: i, total: list.length })
        let url = ''
        let name = file.name
        if (mode === 'blob') {
          const blob = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/upload',
          })
          url = blob.url
        } else {
          const fd = new FormData()
          fd.append('file', file)
          const res = await fetchAuth('/api/upload', { method: 'POST', body: fd })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error ?? 'Upload fallito')
          name = data.name ?? name
          url = data.url
        }
        // registra il modello nell'account (lista ordinata della home)
        const reg = await fetchAuth('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, url, size: file.size }),
        })
        if (!reg.ok) {
          const err = (await reg.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? 'Registrazione non riuscita')
        }
        okCount++
      }
      toast.success(
        okCount === 1
          ? 'Modello importato! Lo trovi nella barra oggetti dell\u2019editor 📦'
          : `${okCount} modelli importati! Li trovi nella barra oggetti dell\u2019editor 📦`
      )
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import non riuscito')
    } finally {
      setProgress(null)
    }
  }

  const removeModel = async (m: ModelRow) => {
    try {
      const res = await fetchAuth(`/api/models/${m.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setModels(prev => prev.filter(x => x.id !== m.id))
      toast.success(`"${m.name}" rimosso dai progetti importati`)
    } catch {
      toast.error('Cancellazione non riuscita')
    }
  }

  const setScale = async (m: ModelRow, scale: number) => {
    // aggiornamento ottimista: la nuova dimensione vale per i prossimi
    // piazzamenti del modello in qualunque mondo
    setModels(prev => prev.map(x => (x.id === m.id ? { ...x, scale } : x)))
    try {
      const res = await fetchAuth(`/api/models/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scale }),
      })
      if (!res.ok) throw new Error()
      toast.success(
        `Dimensione di "${m.name}": ${fmtScale(scale)} (vale nei nuovi piazzamenti)`
      )
    } catch {
      setModels(prev => prev.map(x => (x.id === m.id ? { ...x, scale: m.scale } : x)))
      toast.error('Impossibile salvare la dimensione')
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="mt-8"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-stone-800">
            <Package className="h-5 w-5 text-[var(--primary)]" />
            {section.title}
          </h2>
          <p className="text-sm text-stone-500">
            {section.subtitle ||
              'Carica qui tutti i modelli 3D che vuoi (.glb / .gltf): restano in ordine, scegli la loro dimensione e li trovi pronti nell\'editor di ogni tuo progetto.'}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) void uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <Button
          className="shadow-md"
          disabled={!!progress}
          onClick={() => fileRef.current?.click()}
        >
          {progress ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Carico {progress.done + 1}/{progress.total}...
            </>
          ) : (
            <>
              <CloudUpload className="mr-1 h-4 w-4" /> Importa modelli
            </>
          )}
        </Button>
      </div>

      <Card className="border-black/5 bg-white/70">
        <CardContent className="p-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Carico i tuoi
              modelli...
            </div>
          ) : models.length === 0 ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-300 py-10 transition-colors hover:bg-[var(--primary-soft)]"
            >
              <CloudUpload className="h-8 w-8 text-stone-400" />
              <p className="text-sm font-medium text-stone-500">
                Nessun modello ancora: clicca qui o su «Importa modelli»
              </p>
              <p className="text-xs text-stone-400">
                Puoi selezionare più file insieme — es. i modelli esportati da
                Meshy
              </p>
            </button>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {models.map((m, i) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-black/5 bg-white px-3 py-2"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[11px] font-bold text-[var(--primary-strong)]">
                    {i + 1}
                  </span>
                  <span className="shrink-0 text-lg">📦</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-800">
                      {m.name}
                    </p>
                    <p className="text-xs text-stone-400">
                      {[
                        fmtSize(m.size),
                        new Date(m.createdAt).toLocaleDateString('it-IT', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {/* dimensione predefinita del modello */}
                  <div
                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-stone-100 p-0.5"
                    title="Dimensione con cui il modello viene piazzato nei mondi"
                  >
                    {SIZES.map(s => (
                      <button
                        key={s}
                        onClick={() => void setScale(m, s)}
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-all ${
                          Math.abs((m.scale ?? 1) - s) < 0.01
                            ? 'bg-[var(--primary)] text-white shadow-sm'
                            : 'text-stone-500 hover:bg-white'
                        }`}
                      >
                        {fmtScale(s)}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-stone-500"
                    title="Anteprima 3D: ruota, wireframe, statistiche"
                    onClick={() => setPreview(m)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-stone-400 hover:text-red-600"
                    title="Rimuovi"
                    onClick={() => void removeModel(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* anteprima 3D a schermo intero */}
      <GLBViewer
        url={preview?.url ?? null}
        name={preview?.name}
        onClose={() => setPreview(null)}
      />
    </motion.section>
  )
}
