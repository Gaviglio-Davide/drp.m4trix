'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Bot,
  CheckCircle2,
  Eye,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mountain,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import GLBViewer from '@/components/GLBViewer'
import { fetchAuth } from '@/lib/http'
import { useUI } from '@/lib/ui-store'
import { useWorld, nextId } from '@/lib/world-store'
import {
  analyzeImage,
  generateWorldFromImage,
  type ImageAnalysis,
} from '@/lib/worldgen'
import { encodeTerrain } from '@/lib/terrain'

// ------------------------------------------------------------
// Immagine → Mondo: riduci l'immagine su canvas (una grande per
// il cielo, una piccola per l'analisi) senza mandarla a nessun
// server: tutto avviene nel browser.
// ------------------------------------------------------------
function shrinkImage(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.width * scale))
      c.height = Math.max(1, Math.round(img.height * scale))
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('canvas non disponibile'))
      ctx.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = dataUrl
  })
}

const ART_STYLES = [
  { id: 'realistic', label: 'Realistico', icon: '🛡️' },
  { id: 'cartoon', label: 'Cartoon', icon: '🎨' },
  { id: 'low_poly', label: 'Low poly', icon: '🔷' },
  { id: 'sculpture', label: 'Scultura', icon: '🗿' },
]

type ProviderRow = {
  id: string
  label: string
  icon: string
  keyUrl: string
  keyHint: string
  note: string
  hasKey: boolean
  source: 'personal' | 'site' | 'env' | null
}

type JobState = {
  jobId: string
  phase: 'running' | 'succeeded' | 'failed'
  message?: string
  progress?: number
  modelName?: string
  modelUrl?: string
}

const SOURCE_LABEL: Record<string, string> = {
  personal: 'chiave tua 🔐',
  site: 'chiave del sito 🌐',
  env: 'chiave del server ⚙️',
}

export default function DarpxAI() {
  const openProject = useWorld(s => s.openProject)
  const darpxPrefill = useUI(s => s.darpxPrefill)
  const setDarpxPrefill = useUI(s => s.setDarpxPrefill)

  // ---- immagine → mondo ----
  const fileRef = useRef<HTMLInputElement>(null)
  const [skyDataUrl, setSkyDataUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [asSky, setAsSky] = useState(true)
  const [density, setDensity] = useState(0.6)
  const [creating, setCreating] = useState(false)

  // ---- testo o immagine → 3D ----
  const [providers, setProviders] = useState<ProviderRow[] | null>(null)
  const [chosen, setChosen] = useState<string>('auto')
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [savingKeyFor, setSavingKeyFor] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [artStyle, setArtStyle] = useState('realistic')
  const [job, setJob] = useState<JobState | null>(null)
  const [image3d, setImage3d] = useState<string | null>(null)
  const img3dRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState<string>('')

  const refreshProviders = useCallback(async () => {
    try {
      const res = await fetchAuth('/api/darpx/providers')
      if (!res.ok) return
      const data = (await res.json()) as { providers?: ProviderRow[] }
      setProviders(data.providers ?? [])
    } catch {
      setProviders([])
    }
  }, [])

  useEffect(() => {
    void refreshProviders()
  }, [refreshProviders])

  // prefill dall'Agente Darpx
  useEffect(() => {
    if (darpxPrefill) {
      setPrompt(darpxPrefill)
      setDarpxPrefill(null)
      toast.info('Prompt preparato dall\'Agente: premi «Crea il modello 3D» 🧊')
    }
  }, [darpxPrefill, setDarpxPrefill])

  const anyKey = (providers ?? []).some(p => p.hasKey)

  // ---------- immagine → mondo ----------

  const pickImage = useCallback(async (file: File) => {
    setAnalyzing(true)
    setAnalysis(null)
    setSkyDataUrl(null)
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('Lettura non riuscita'))
        r.readAsDataURL(file)
      })
      const [big, small] = await Promise.all([
        shrinkImage(raw, 2048, 0.72),
        shrinkImage(raw, 512, 0.7),
      ])
      const a = await analyzeImage(small)
      setSkyDataUrl(big)
      setAnalysis(a)
      toast.success(
        `Immagine letta: ambiente ${a.label}, stile ${a.style} 🪄`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Immagine non valida')
    } finally {
      setAnalyzing(false)
    }
  }, [])

  const createWorld = async () => {
    if (!analysis) return
    setCreating(true)
    try {
      const result = generateWorldFromImage(analysis, density)
      const objects = result.objects.map(o => ({ ...o, id: nextId() }))
      const terrain = encodeTerrain(result.terrain)
      const name = `Darpx · ${analysis.label} #${analysis.seed}`
      const stateJson = JSON.stringify({
        objects,
        customAssets: [],
        ...(terrain ? { terrain } : {}),
        ...(asSky && skyDataUrl ? { skyboxUrl: skyDataUrl } : {}),
      })
      const res = await fetchAuth('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        project?: { id: string; createdAt: string; updatedAt: string }
        error?: string
      }
      if (!res.ok || !data.project) throw new Error(data.error ?? 'Creazione non riuscita')
      const p = data.project
      const patch = await fetchAuth(`/api/projects/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: stateJson }),
      })
      if (!patch.ok) throw new Error('Salvataggio non riuscito')
      useWorld.getState().setWorldStyle(analysis.style)
      openProject({
        id: p.id,
        name,
        state: stateJson,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })
      toast.success('Mondo creato dall\'immagine! Esploralo e modificalo ✨')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore creazione mondo')
    } finally {
      setCreating(false)
    }
  }

  // ---------- chiavi dei motori 3D ----------

  const saveKey = async (provider: ProviderRow) => {
    const k = (keyInputs[provider.id] ?? '').trim()
    if (!k) return
    setSavingKeyFor(provider.id)
    try {
      const res = await fetchAuth('/api/darpx/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, key: k }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Salvataggio chiave non riuscito')
      setKeyInputs(prev => ({ ...prev, [provider.id]: '' }))
      await refreshProviders()
      toast.success(`Chiave ${provider.label} salvata in modo cifrato 🔐`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore salvataggio chiave')
    } finally {
      setSavingKeyFor(null)
    }
  }

  const removeKey = async (provider: ProviderRow) => {
    try {
      const res = await fetchAuth(
        `/api/darpx/providers?provider=${encodeURIComponent(provider.id)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error()
      await refreshProviders()
      toast.success(`Chiave ${provider.label} rimossa`)
    } catch {
      toast.error('Rimozione non riuscita')
    }
  }

  // ---------- immagine per il 3D ----------

  const pickImage3d = async (file: File) => {
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('Lettura non riuscita'))
        r.readAsDataURL(file)
      })
      const small = await shrinkImage(raw, 1024, 0.82)
      setImage3d(small)
      if (!prompt.trim()) setPrompt('Modello 3D da questa immagine')
    } catch {
      toast.error('Immagine non valida')
    }
  }

  // ---------- job 3D ----------

  const startJob = async () => {
    if (prompt.trim().length < 3 && !image3d) {
      toast.error('Descrivi cosa vuoi creare (o carica un\'immagine)')
      return
    }
    setJob(null)
    try {
      const res = await fetchAuth('/api/darpx/text-to-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim() || '3D model from image',
          artStyle,
          ...(chosen !== 'auto' ? { provider: chosen } : {}),
          ...(image3d ? { image: image3d } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string
        provider?: string
        status?: string
        model?: { name: string; url: string }
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? 'Impossibile avviare la generazione')
      // Stability è sincrono: può arrivare già pronto
      if (data.status === 'succeeded' && data.model) {
        setJob({
          jobId: 'done',
          phase: 'succeeded',
          modelName: data.model.name,
          modelUrl: data.model.url,
        })
        toast.success('Modello pronto! Lo trovi in «Progetti importati» 📦')
        return
      }
      if (!data.jobId) throw new Error('Nessun job ricevuto')
      setJob({ jobId: data.jobId, phase: 'running', progress: 0 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore avvio generazione')
    }
  }

  // polling del job (ogni 4 secondi)
  useEffect(() => {
    if (!job || job.phase !== 'running') return
    let stop = false
    const tick = async () => {
      try {
        const res = await fetchAuth(
          `/api/darpx/text-to-3d?jobId=${encodeURIComponent(job.jobId)}&name=${encodeURIComponent(prompt.slice(0, 40))}`
        )
        const data = (await res.json().catch(() => ({}))) as {
          status?: string
          progress?: number
          error?: string
          model?: { name: string; url: string }
        }
        if (stop) return
        if (data.status === 'succeeded') {
          setJob({
            jobId: job.jobId,
            phase: 'succeeded',
            modelName: data.model?.name,
            modelUrl: data.model?.url,
          })
          toast.success('Modello pronto! Lo trovi in «Progetti importati» e nella barra oggetti dell\'editor 📦')
          return
        }
        if (data.status === 'failed') {
          setJob({ jobId: job.jobId, phase: 'failed', message: data.error })
          toast.error(data.error ?? 'Generazione non riuscita')
          return
        }
        setJob(j =>
          j && j.phase === 'running'
            ? { ...j, progress: Math.round((data.progress ?? 0) * 100) }
            : j
        )
      } catch {
        // singolo errore di rete: si riprova al prossimo tick
      }
    }
    void tick()
    const iv = setInterval(() => void tick(), 4000)
    return () => {
      stop = true
      clearInterval(iv)
    }
  }, [job?.jobId, job?.phase, prompt])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* ============ IMMAGINE → MONDO ============ */}
      <div className="rounded-3xl bg-white/85 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-lg font-semibold">Darpx.ai · Immagine → Mondo</h2>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Carica una qualsiasi immagine: Darpx la analizza (colori, luce,
          paesaggio) e costruisce un mondo 3D coerente, con colline, laghi e
          boschi. Se vuoi, l&apos;immagine diventa anche il cielo del mondo.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void pickImage(f)
            e.target.value = ''
          }}
        />

        {!skyDataUrl ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 p-8 transition-colors hover:border-[var(--primary)] hover:bg-stone-50"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                <span className="text-sm text-stone-500">Analizzo l&apos;immagine…</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-8 w-8 text-stone-400" />
                <span className="text-sm font-medium">Trascina o clicca per scegliere un&apos;immagine</span>
                <span className="text-xs text-stone-400">PNG · JPG · WEBP — resta sul tuo browser</span>
              </>
            )}
          </button>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl ring-1 ring-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={skyDataUrl} alt="Immagine caricata" className="h-44 w-full object-cover" />
              <button
                onClick={() => {
                  setSkyDataUrl(null)
                  setAnalysis(null)
                }}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
                title="Rimuovi immagine"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4 text-sm">
              {analysis && (
                <>
                  <div className="font-semibold">Cosa ha visto Darpx:</div>
                  <ul className="mt-2 space-y-1 text-stone-600">
                    <li>🌍 Ambiente: <b>{analysis.label}</b></li>
                    <li>💡 Luce: {Math.round(analysis.brightness * 100)}%</li>
                    <li>🎨 Stile suggerito: <b>{analysis.style}</b></li>
                    <li>🧬 Variante: #{analysis.seed}</li>
                  </ul>
                </>
              )}
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-stone-700">
                <input
                  type="checkbox"
                  checked={asSky}
                  onChange={e => setAsSky(e.target.checked)}
                  className="accent-[var(--primary)]"
                />
                Usa l&apos;immagine anche come cielo del mondo
              </label>
            </div>
          </div>
        )}

        {analysis && (
          <>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Densità della natura
                </p>
                <span className="text-xs font-medium text-stone-500">
                  {Math.round(density * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={density}
                onChange={e => setDensity(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--primary)]"
              />
            </div>
            <Button className="mt-3 w-full" onClick={createWorld} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Costruisco il mondo…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" /> Crea mondo da questa immagine
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* ============ TESTO O IMMAGINE → 3D ============ */}
      <div className="rounded-3xl bg-white/85 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Mountain className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-lg font-semibold">Darpx.ai · Testo o Immagine → 3D</h2>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Descrivi un personaggio, una casa, un mostro… oppure parti da
          un&apos;immagine. Darpx usa <b>quattro motori in cascata</b> — Tripo,
          fal.ai (Hunyuan 3D), Stable Fast 3D e Meshy — quindi se uno si
          blocca, passa al successivo da solo. Il modello arriva nei{' '}
          <b>Progetti importati</b> con anteprima 👁️.
        </p>

        {/* motori disponibili */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(providers ?? []).map(p => (
            <div
              key={p.id}
              className={`rounded-2xl p-3 text-sm ring-1 transition-all ${
                chosen === p.id
                  ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                  : p.hasKey
                    ? 'bg-emerald-50/60 ring-emerald-200'
                    : 'bg-stone-50 ring-stone-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  className="flex min-w-0 items-center gap-1.5 text-left"
                  onClick={() => setChosen(chosen === p.id ? 'auto' : p.id)}
                  title={chosen === p.id ? 'Torna a selezione automatica' : 'Usa solo questo motore'}
                >
                  <span className="text-base">{p.icon}</span>
                  <span className="truncate font-semibold text-stone-700">{p.label}</span>
                </button>
                {p.hasKey ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    {SOURCE_LABEL[p.source ?? ''] ?? 'pronto'}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-500">
                    senza chiave
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-stone-500">{p.note}</p>
              {p.hasKey && p.source === 'personal' && (
                <button
                  onClick={() => void removeKey(p)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> rimuovi la tua chiave
                </button>
              )}
              {!p.hasKey && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="password"
                    value={keyInputs[p.id] ?? ''}
                    onChange={e =>
                      setKeyInputs(prev => ({ ...prev, [p.id]: e.target.value }))
                    }
                    placeholder={p.keyHint}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 text-xs outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  <Button
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    disabled={savingKeyFor === p.id || !(keyInputs[p.id] ?? '').trim()}
                    onClick={() => void saveKey(p)}
                  >
                    {savingKeyFor === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}
              {!p.hasKey && (
                <a
                  href={p.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] font-medium text-[var(--primary-strong)] underline-offset-2 hover:underline"
                >
                  prendi la chiave gratuita ↗
                </a>
              )}
            </div>
          ))}
          {providers === null && (
            <div className="col-span-full flex items-center justify-center gap-2 rounded-2xl bg-stone-50 p-4 text-sm text-stone-400 ring-1 ring-stone-200">
              <Loader2 className="h-4 w-4 animate-spin" /> Controllo i motori disponibili…
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-purple-50 px-3 py-2 text-[11px] text-purple-800 ring-1 ring-purple-200">
          <span className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5" />
            {chosen === 'auto'
              ? anyKey
                ? 'Modalità AUTO: uso il primo motore pronto e passo al successivo se si blocca'
                : 'Aggiungi almeno una chiave per attivare la generazione (l\'admin può anche metterne una globale)'
              : 'Motore scelto: se si blocca, riprovo automaticamente con gli altri'}
          </span>
          {chosen !== 'auto' && (
            <button
              onClick={() => setChosen('auto')}
              className="shrink-0 font-bold underline-offset-2 hover:underline"
            >
              torna ad AUTO
            </button>
          )}
        </div>

        {/* immagine di partenza (opzionale) */}
        <input
          ref={img3dRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void pickImage3d(f)
            e.target.value = ''
          }}
        />
        {image3d ? (
          <div className="relative mt-4 overflow-hidden rounded-2xl ring-1 ring-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image3d} alt="Immagine per il 3D" className="h-40 w-full object-cover" />
            <button
              onClick={() => setImage3d(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
              title="Rimuovi immagine"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
              🖼️ Creo il 3D da questa immagine
            </div>
          </div>
        ) : (
          <button
            onClick={() => img3dRef.current?.click()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 p-3 text-sm text-stone-500 transition-colors hover:border-[var(--primary)] hover:bg-stone-50"
          >
            <ImageIcon className="h-4 w-4" />
            <span className="font-medium">(opzionale) parti da un&apos;immagine</span>
          </button>
        )}

        {/* prompt */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Es: un cavaliere con armatura dorata e spada fiammeggiante, oppure: casa a graticcio con tetto di paglia e finestre di legno"
          className="mt-4 w-full resize-none rounded-2xl border border-stone-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {ART_STYLES.map(s => (
            <button
              key={s.id}
              onClick={() => setArtStyle(s.id)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                artStyle === s.id
                  ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                  : 'hover:bg-stone-50'
              }`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        <Button
          className="mt-4 w-full"
          onClick={startJob}
          disabled={providers === null || !anyKey || job?.phase === 'running'}
        >
          {job?.phase === 'running' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sto creando il
              modello… {job.progress ? `${job.progress}%` : ''}
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" /> Crea il modello 3D
            </>
          )}
        </Button>
        {providers !== null && !anyKey && (
          <p className="mt-2 text-center text-xs text-stone-400">
            Aggiungi una chiave sopra (o chiedi all&apos;admin di configurarne
            una globale) per attivare il bottone
          </p>
        )}
        {job?.phase === 'failed' && (
          <p className="mt-2 rounded-xl bg-red-50 p-2 text-center text-xs text-red-700 ring-1 ring-red-200">
            {job.message ?? 'Generazione non riuscita'}
          </p>
        )}
        {job?.phase === 'succeeded' && (
          <div className="mt-2 rounded-xl bg-emerald-50 p-3 text-center text-xs text-emerald-700 ring-1 ring-emerald-200">
            <p>
              Modello «{job.modelName ?? 'Darpx'}» pronto! Lo trovi in «Progetti
              importati» e nella barra oggetti dell&apos;editor.
            </p>
            {job.modelUrl && (
              <Button
                size="sm"
                variant="outline"
                className="mx-auto mt-2"
                onClick={() => {
                  setPreviewUrl(job.modelUrl ?? null)
                  setPreviewName(job.modelName ?? 'Modello Darpx')
                }}
              >
                <Eye className="mr-1 h-3.5 w-3.5" /> Guarda l&apos;anteprima 3D
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ============ ANTEPRIMA ============ */}
      <GLBViewer
        url={previewUrl}
        name={previewName}
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  )
}
