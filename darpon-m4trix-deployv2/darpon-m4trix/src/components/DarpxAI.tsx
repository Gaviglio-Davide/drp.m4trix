'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mountain,
  Plus,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchAuth } from '@/lib/http'
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

type JobState = {
  jobId: string
  phase: 'running' | 'succeeded' | 'failed'
  message?: string
  progress?: number
  modelName?: string
}

export default function DarpxAI() {
  const openProject = useWorld(s => s.openProject)

  // ---- immagine → mondo ----
  const fileRef = useRef<HTMLInputElement>(null)
  const [skyDataUrl, setSkyDataUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [asSky, setAsSky] = useState(true)
  const [density, setDensity] = useState(0.6)
  const [creating, setCreating] = useState(false)

  // ---- testo → 3D ----
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [artStyle, setArtStyle] = useState('realistic')
  const [job, setJob] = useState<JobState | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetchAuth('/api/auth/profile')
        if (!res.ok) return
        const data = (await res.json()) as { user?: { hasMeshyKey?: boolean } }
        setHasKey(Boolean(data.user?.hasMeshyKey))
      } catch {
        setHasKey(false)
      }
    })()
  }, [])

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

  const saveKey = async () => {
    const k = keyInput.trim()
    if (!k) return
    setSavingKey(true)
    try {
      const res = await fetchAuth('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meshyKey: k }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Salvataggio chiave non riuscito')
      setHasKey(true)
      setKeyInput('')
      toast.success('Chiave salvata in modo cifrato 🔐')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore salvataggio chiave')
    } finally {
      setSavingKey(false)
    }
  }

  const startJob = async () => {
    if (prompt.trim().length < 3) {
      toast.error('Descrivi cosa vuoi creare')
      return
    }
    setJob(null)
    try {
      const res = await fetchAuth('/api/darpx/text-to-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, artStyle }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string
        error?: string
      }
      if (!res.ok || !data.jobId) {
        throw new Error(data.error ?? 'Impossibile avviare la generazione')
      }
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
        const res = await fetchAuth(`/api/darpx/text-to-3d?jobId=${encodeURIComponent(job.jobId)}`)
        const data = (await res.json().catch(() => ({}))) as {
          status?: string
          progress?: number
          error?: string
          model?: { name: string }
        }
        if (stop) return
        if (data.status === 'succeeded') {
          setJob({
            jobId: job.jobId,
            phase: 'succeeded',
            modelName: data.model?.name,
          })
          toast.success('Modello pronto! Lo trovi in "Progetti importati" e nella barra oggetti dell\'editor 📦')
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
  }, [job?.jobId, job?.phase])

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

      {/* ============ TESTO → 3D ============ */}
      <div className="rounded-3xl bg-white/85 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Mountain className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-lg font-semibold">Darpx.ai · Testo → 3D</h2>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Descrivi un personaggio, una casa, un mostro… e Darpx crea il
          modello 3D. Lo trovi poi nei <b>Progetti importati</b> e nella barra
          oggetti di ogni mondo, come i modelli Meshy che già usi.
        </p>

        {/* chiave Meshy */}
        <div className="mt-4 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <KeyRound className="h-4 w-4" />
            {hasKey ? 'Chiave API Meshy configurata ✅' : 'Serve la tua chiave API Meshy'}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            La creazione dei modelli usa i crediti del tuo account Meshy
            (gratuito). La trovi su <b>meshy.ai → Account → API</b> (o su
            alpha.meshy.ai). La chiave viene salvata <b>cifrata</b> nel
            database: mai in chiaro e mai nel browser.
          </p>
          {!hasKey && (
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="msy_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
              <Button size="sm" onClick={saveKey} disabled={savingKey || !keyInput.trim()}>
                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salva'}
              </Button>
            </div>
          )}
          {hasKey && (
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="Nuova chiave (opzionale, per sostituirla)"
                className="flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
              <Button size="sm" variant="outline" onClick={saveKey} disabled={savingKey || !keyInput.trim()}>
                {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aggiorna'}
              </Button>
            </div>
          )}
        </div>

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
          disabled={hasKey === null || hasKey === false || !!job?.phase.match('running')}
        >
          {job?.phase === 'running' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sto creando il
              modello… {job.progress ? `${job.progress}%` : ''}
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" /> Genera il modello 3D
            </>
          )}
        </Button>
        {hasKey === false && (
          <p className="mt-2 text-center text-xs text-stone-400">
            Aggiungi la chiave qui sopra per attivare il bottone
          </p>
        )}
        {job?.phase === 'failed' && (
          <p className="mt-2 rounded-xl bg-red-50 p-2 text-center text-xs text-red-700 ring-1 ring-red-200">
            {job.message ?? 'Generazione non riuscita'}
          </p>
        )}
        {job?.phase === 'succeeded' && (
          <p className="mt-2 rounded-xl bg-emerald-50 p-2 text-center text-xs text-emerald-700 ring-1 ring-emerald-200">
            Modello «{job.modelName ?? 'Darpx'}» pronto! Vai su «Progetti
            importati» per vederlo e sceglierne la dimensione.
          </p>
        )}
      </div>
    </div>
  )
}
