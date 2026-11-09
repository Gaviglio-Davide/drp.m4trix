'use client'

// ============================================================
// Catalogo Modelli 3D (stile Meshy) — si apre dalla sezione
// "Progetti importati" con il tasto «Catalogo 3D».
// Contiene decine di modelli GLB GRATUITI (licenze aperte
// CC0 / CC-BY / MIT — Khronos, three.js, modelviewer.dev):
// niente soldi, niente gemme, niente crediti.
// Ogni scheda ha:
//  - 👁 anteprima 3D vera (viewer esistente del sito)
//  - 📤 tasto «Manda al mio sito»: scarica il GLB dalla rete
//    e lo carica nei Progetti importati dell'account, pronto
//    nella barra oggetti dell'editor di ogni mondo.
// ============================================================

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  CheckCircle2,
  CloudUpload,
  Eye,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { fetchAuth } from '@/lib/http'
import GLBViewer from '@/components/GLBViewer'
import {
  GLB_CATALOG,
  GLB_CATALOG_CATEGORIES,
  type GlbCatalogEntry,
} from '@/lib/glb-catalog-data'

type Props = {
  open: boolean
  onClose: () => void
  onImported: () => void
}

// colori di sfondo delle schede, uno per categoria (classi statiche
// così Tailwind le include sempre nel bundle)
const CAT_BG: Record<string, string> = {
  personaggi: 'from-sky-500/30 via-sky-500/10 to-transparent',
  creature: 'from-emerald-500/30 via-emerald-500/10 to-transparent',
  veicoli: 'from-orange-500/30 via-orange-500/10 to-transparent',
  casa: 'from-amber-500/30 via-amber-500/10 to-transparent',
  oggetti: 'from-lime-500/30 via-lime-500/10 to-transparent',
  moda: 'from-pink-500/30 via-pink-500/10 to-transparent',
  fantasy: 'from-violet-500/30 via-violet-500/10 to-transparent',
  citta: 'from-cyan-500/30 via-cyan-500/10 to-transparent',
  studio: 'from-slate-500/30 via-slate-500/10 to-transparent',
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function GLBCatalog({ open, onClose, onImported }: Props) {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('tutti')
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  )

  const emojiOf = (k: string) =>
    GLB_CATALOG_CATEGORIES.find(c => c.key === k)?.emoji ?? '📦'
  const labelOf = (k: string) =>
    GLB_CATALOG_CATEGORIES.find(c => c.key === k)?.label ?? 'Altro'

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GLB_CATALOG.filter(
      e =>
        (cat === 'tutti' || e.category === cat) &&
        (!q || e.name.toLowerCase().includes(q)),
    )
  }, [cat, query])

  const countOf = (k: string) =>
    k === 'tutti'
      ? GLB_CATALOG.length
      : GLB_CATALOG.filter(e => e.category === k).length

  // Scarica il GLB dal catalogo e lo carica nei Progetti importati
  // dell'account: stesso identico flusso dell'upload manuale
  // (Vercel Blob in produzione, /api/upload in locale).
  const sendToSite = async (entry: GlbCatalogEntry) => {
    setBusy(entry.id)
    try {
      const res = await fetch(entry.url)
      if (!res.ok) throw new Error('Download del modello non riuscito')
      const blob = await res.blob()
      const file = new File([blob], `${entry.id}.glb`, {
        type: 'model/gltf-binary',
      })

      const modeRes = await fetchAuth('/api/upload')
      const mode = (
        (await modeRes.json().catch(() => ({}))) as { mode?: string }
      ).mode

      let url = ''
      if (mode === 'blob') {
        const up = await upload(`${entry.id}.glb`, file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
        })
        url = up.url
      } else {
        const fd = new FormData()
        fd.append('file', file)
        const upRes = await fetchAuth('/api/upload', {
          method: 'POST',
          body: fd,
        })
        const data = await upRes.json().catch(() => ({}))
        if (!upRes.ok) throw new Error(data.error ?? 'Caricamento non riuscito')
        url = data.url
      }

      const reg = await fetchAuth('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${entry.name}.glb`,
          url,
          size: blob.size,
        }),
      })
      if (!reg.ok) {
        const err = (await reg.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Registrazione non riuscita')
      }

      setDone(prev => new Set(prev).add(entry.id))
      toast.success(`«${entry.name}» è nei tuoi Progetti importati! 📦`)
      onImported()
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Invio non riuscito, riprova',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-h-[92vh] w-full max-w-6xl overflow-hidden border-[var(--line)] bg-[var(--panel)] p-0 sm:rounded-3xl">
        <div className="flex max-h-[92vh] flex-col">
          {/* intestazione: titolo, badge gratis, ricerca, categorie */}
          <div className="border-b border-[var(--line)] px-5 py-4">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-xl font-black tracking-tight text-[var(--tx)]">
              <Sparkles className="h-5 w-5 text-[var(--primary)]" />
              Catalogo Modelli 3D
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black tracking-wide text-emerald-500 ring-1 ring-emerald-500/40">
                TUTTO GRATIS
              </span>
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-[var(--tx-dim)]">
              {GLB_CATALOG.length} modelli GLB pronti all&apos;uso — niente
              soldi, niente gemme, niente crediti: scegli un modello e premi
              «Manda al mio sito», finisce direttamente nei tuoi Progetti
              importati.
            </DialogDescription>

            <div className="relative mt-3">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--tx-faint)]" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cerca un modello… (drago, volpe, robot, auto…)"
                className="border-[var(--line)] bg-[var(--panel-soft)] pl-9 text-[var(--tx)]"
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {GLB_CATALOG_CATEGORIES.map(c => (
                <button
                  key={c.key}
                  onClick={() => setCat(c.key)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                    cat === c.key
                      ? 'bg-[var(--primary)] text-white shadow-md'
                      : 'bg-[var(--panel-hover)] text-[var(--tx-dim)] hover:bg-[var(--primary-soft)]'
                  }`}
                >
                  {c.emoji} {c.label}
                  <span className="ml-1 opacity-60">{countOf(c.key)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* griglia modelli */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {list.length === 0 ? (
              <p className="py-10 text-center text-sm text-[var(--tx-faint)]">
                Nessun modello trovato: prova un&apos;altra parola o categoria.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {list.map(entry => {
                  const isBusy = busy === entry.id
                  const isDone = done.has(entry.id)
                  return (
                    <div
                      key={entry.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] transition-shadow hover:shadow-lg"
                    >
                      <div
                        className={`relative flex h-24 items-center justify-center bg-gradient-to-br ${
                          CAT_BG[entry.category] ?? CAT_BG.studio
                        }`}
                      >
                        <span className="text-4xl drop-shadow-md transition-transform duration-300 group-hover:scale-125">
                          {emojiOf(entry.category)}
                        </span>
                        <span className="absolute top-1.5 left-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white/90">
                          {entry.license}
                        </span>
                        {/* v15: badge per i modelli con animazioni */}
                        {entry.animated && (
                          <span className="absolute top-1.5 right-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-[#ffd23a]">
                            🎬 Animato
                          </span>
                        )}
                        <button
                          onClick={() =>
                            setPreview({ url: entry.url, name: entry.name })
                          }
                          title="Anteprima 3D"
                          className="absolute right-1.5 bottom-1.5 rounded-full bg-black/45 p-1.5 text-white/90 transition-colors hover:bg-black/70"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-2.5">
                        <p
                          className="truncate text-sm font-bold text-[var(--tx)]"
                          title={entry.name}
                        >
                          {entry.name}
                        </p>
                        <p className="text-[11px] text-[var(--tx-faint)]">
                          {labelOf(entry.category)} · {fmtSize(entry.size)}
                        </p>
                        <Button
                          size="sm"
                          className="mt-auto w-full"
                          disabled={isBusy || isDone}
                          onClick={() => void sendToSite(entry)}
                        >
                          {isBusy ? (
                            <>
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              Mando…
                            </>
                          ) : isDone ? (
                            <>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Aggiunto!
                            </>
                          ) : (
                            <>
                              <CloudUpload className="mr-1 h-3.5 w-3.5" />
                              Manda al mio sito
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* nota licenze */}
          <div className="border-t border-[var(--line)] px-5 py-2.5 text-[11px] leading-relaxed text-[var(--tx-faint)]">
            Modelli gratuiti da Khronos glTF Sample Assets, three.js e
            modelviewer.dev · Licenze aperte (CC0, CC-BY, MIT) · Le voci
            «CC-BY-NC» sono solo per uso non commerciale · Nessun pagamento
            richiesto.
          </div>
        </div>

        {/* anteprima 3D vera del modello (viewer del sito) */}
        <GLBViewer
          url={preview?.url ?? null}
          name={preview?.name}
          onClose={() => setPreview(null)}
        />
      </DialogContent>
    </Dialog>
  )
}
