'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Group } from 'three'
import {
  Bot,
  CheckCircle2,
  Dna,
  Download,
  Eye,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mountain,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  Wrench,
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
import { upload } from '@vercel/blob/client'
import {
  generateModel,
  generateVariant,
  exportGlbFile,
  parsePrompt,
  loadGlbFromUrl,
  loadGlbFromArrayBuffer,
  enhanceModel,
  PROMPT_SUGGESTIONS,
  type ModelStats,
  type EnhanceAdditions,
} from '@/lib/darpx3d'
import MiniPreview from '@/lib/darpx3d/MiniPreview'

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

  // ---- MOTORE INTERNO Darpx3D ----
  const [iprompt, setIPrompt] = useState('')
  const [igen, setIGen] = useState(false)
  const [istep, setIStep] = useState('')
  const [isaving, setIsaving] = useState(false)
  const [iresult, setIResult] = useState<{
    url: string
    name: string
    file: File
    stats: ModelStats
    prompt: string
  } | null>(null)
  const iobjUrlRef = useRef<string | null>(null)
  const igenRef = useRef(false)

  // ---- DOMANDE SUI DETTAGLI (v7: l'AI chiede prima di generare) ----
  const [iqOpen, setIqOpen] = useState(false)
  const [iqBase, setIqBase] = useState('')
  const [iqMissing, setIqMissing] = useState<{ colore: boolean; taglia: boolean; materiale: boolean; dettagli: boolean }>({
    colore: false, taglia: false, materiale: false, dettagli: false,
  })
  const [qColore, setQColore] = useState('')
  const [qTaglia, setQTaglia] = useState('')
  const [qMateriale, setQMateriale] = useState('')
  const [qDettagli, setQDettagli] = useState<string[]>([])
  const [askDetails, setAskDetails] = useState(true)

  useEffect(() => {
    try {
      const v = localStorage.getItem('darpx.askDetails')
      if (v !== null) setAskDetails(v === '1')
    } catch {
      // storage non disponibile
    }
  }, [])
  const toggleAskDetails = (v: boolean) => {
    setAskDetails(v)
    try {
      localStorage.setItem('darpx.askDetails', v ? '1' : '0')
    } catch {
      // ignore
    }
  }

  // ---- LABORATORIO GLB (v7: migliora i modelli che già hai) ----
  const [labModels, setLabModels] = useState<{ id: string; name: string; url: string }[] | null>(null)
  const [labSrc, setLabSrc] = useState<{ name: string; scene: Group } | null>(null)
  const [labLoading, setLabLoading] = useState(false)
  const [labMode, setLabMode] = useState<'originale' | 'tinta' | 'materiale'>('tinta')
  const [labColor, setLabColor] = useState('#d9a72e')
  const [labStyle, setLabStyle] = useState('oro')
  const [labAdds, setLabAdds] = useState<EnhanceAdditions>({})
  const [labHeight, setLabHeight] = useState(0)
  const [labBusy, setLabBusy] = useState(false)
  const [labSaving, setLabSaving] = useState(false)
  const [labResult, setLabResult] = useState<{
    url: string
    name: string
    file: File
    stats: ModelStats
  } | null>(null)
  const labFileRef = useRef<HTMLInputElement>(null)
  const labUrlRef = useRef<string | null>(null)

  const refreshLabModels = useCallback(async () => {
    try {
      const res = await fetchAuth('/api/models')
      if (!res.ok) return
      const data = (await res.json()) as {
        models?: { id: string; name: string; url: string }[]
      }
      setLabModels(data.models ?? [])
    } catch {
      setLabModels([])
    }
  }, [])

  useEffect(() => {
    void refreshLabModels()
  }, [refreshLabModels])

  useEffect(() => () => {
    if (labUrlRef.current) URL.revokeObjectURL(labUrlRef.current)
  }, [])

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

  // prefill dall'Agente Darpx → apre le DOMANDE sui dettagli (o genera se disattivate)
  const startInternalRef = useRef<(p?: string) => void>(() => {})
  useEffect(() => {
    if (darpxPrefill) {
      const p = darpxPrefill
      setDarpxPrefill(null)
      setIPrompt(p)
      startInternalRef.current(p)
    }
  }, [darpxPrefill, setDarpxPrefill])

  const anyKey = (providers ?? []).some(p => p.hasKey)

  // ---------- MOTORE INTERNO Darpx3D ----------

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  const runInternal = useCallback(async (promptText?: string, variant = false) => {
    const p = (promptText ?? iprompt).trim()
    if (!p || igenRef.current) return
    igenRef.current = true
    setIGen(true)
    setIResult(null)
    try {
      setIStep('Analizzo il prompt (italiano, colori, materiali)…')
      await sleep(360)
      const built = variant ? generateVariant(p) : generateModel(p)
      setIStep('Assemblo anatomia e geometria…')
      await sleep(300)
      setIStep('Applico i materiali PBR…')
      await sleep(260)
      const file = await exportGlbFile(built.group, built.spec.name)
      setIStep('Esporto il file GLB…')
      await sleep(220)
      // libera il vecchio object URL
      if (iobjUrlRef.current) URL.revokeObjectURL(iobjUrlRef.current)
      const url = URL.createObjectURL(file)
      iobjUrlRef.current = url
      setIResult({
        url,
        name: built.spec.name,
        file,
        stats: built.stats,
        prompt: p,
      })
      setIStep('')
      toast.success(`«${built.spec.name}» pronto! 🧬`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generazione non riuscita')
    } finally {
      setIGen(false)
      setIStep('')
      igenRef.current = false
    }
  }, [iprompt])

  // ---- v7: flusso con DOMANDE SUI DETTAGLI ----
  const COLOR_CHOICES = [
    { id: 'rosso', hex: '#c0392b' }, { id: 'blu', hex: '#2563a8' },
    { id: 'verde', hex: '#3f8f4f' }, { id: 'oro', hex: '#d9a72e' },
    { id: 'viola', hex: '#7c4fa8' }, { id: 'nero', hex: '#26262b' },
    { id: 'bianco', hex: '#eeeeea' }, { id: 'rosa', hex: '#e087ab' },
  ]
  const SIZE_CHOICES = ['piccolo', 'normale', 'grande', 'enorme']
  const MATERIAL_CHOICES = ['naturale', 'oro', 'argento', 'ferro', 'legno', 'pietra', 'cristallo']
  const DETAIL_CHOICES = [
    { id: 'ali', label: 'Ali 🪽' }, { id: 'corna', label: 'Corna 🐂' },
    { id: 'armatura', label: 'Armatura 🛡️' }, { id: 'fuoco', label: 'Fuoco 🔥' },
    { id: 'spine', label: 'Spine 🌵' }, { id: 'squame', label: 'Squame 🐉' },
  ]

  /** analizza il prompt: cosa manca? apre il pannello domande o genera */
  const startInternal = useCallback(
    (promptText?: string) => {
      const p = (promptText ?? iprompt).trim()
      if (!p || igenRef.current) return
      setIPrompt(p)
      if (!askDetails) {
        setIqOpen(false)
        void runInternal(p)
        return
      }
      const spec = parsePrompt(p)
      const hasColor = !!spec.colorHex
      const hasSize = spec.sizeClass !== 'normal'
      const hasStyle = !!spec.styleId
      const featureWords = ['ali', 'corna', 'armatura', 'fuoco', 'spine', 'squame']
      const hasDetails = featureWords.some(w => spec.features.has(w))
      const missing = { colore: !hasColor, taglia: !hasSize, materiale: !hasStyle, dettagli: !hasDetails }
      if (!missing.colore && !missing.taglia && !missing.materiale && !missing.dettagli) {
        // il prompt è già completo: vai dritto
        setIqOpen(false)
        void runInternal(p)
        return
      }
      setIqBase(p)
      setIqMissing(missing)
      setQColore('')
      setQTaglia('')
      setQMateriale('')
      setQDettagli([])
      setIqOpen(true)
    },
    [iprompt, askDetails, runInternal]
  )
  startInternalRef.current = startInternal

  /** applica le risposte e genera */
  const applyQuestionsAndRun = useCallback(
    (skip = false) => {
      setIqOpen(false)
      let p = iqBase
      if (!skip) {
        if (qColore) p += ` ${qColore}`
        if (qMateriale && qMateriale !== 'naturale') p += ` di ${qMateriale}`
        if (qTaglia && qTaglia !== 'normale') p += ` ${qTaglia}`
        if (qDettagli.length) p += ` con ${qDettagli.join(' e ')}`
      }
      setIPrompt(p)
      void runInternal(p)
    },
    [iqBase, qColore, qMateriale, qTaglia, qDettagli, runInternal]
  )

  // ---- v7: LABORATORIO GLB ----

  const pickLabModel = useCallback(async (name: string, url: string) => {
    setLabLoading(true)
    setLabResult(null)
    try {
      const scene = await loadGlbFromUrl(url)
      setLabSrc({ name, scene })
      toast.success(`«${name}» caricato: ora scegli come migliorarlo 🔧`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Modello non leggibile')
    } finally {
      setLabLoading(false)
    }
  }, [])

  const pickLabFile = useCallback(async (file: File) => {
    setLabLoading(true)
    setLabResult(null)
    try {
      const buf = await file.arrayBuffer()
      const scene = await loadGlbFromArrayBuffer(buf)
      setLabSrc({ name: file.name.replace(/\.glb$/i, ''), scene })
      toast.success(`«${file.name}» caricato: ora scegli come migliorarlo 🔧`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'File non leggibile')
    } finally {
      setLabLoading(false)
    }
  }, [])

  const runLab = useCallback(async () => {
    if (!labSrc || labBusy) return
    setLabBusy(true)
    setLabResult(null)
    try {
      const { group, stats } = enhanceModel(labSrc.scene, {
        mode: labMode,
        colorHex: labMode === 'originale' ? undefined : labColor,
        styleId: labMode === 'materiale' ? labStyle : undefined,
        additions: labAdds,
        targetHeight: labHeight > 0 ? labHeight : undefined,
      })
      const name = `${labSrc.name} · Darpx Lab`
      const file = await exportGlbFile(group, name)
      if (labUrlRef.current) URL.revokeObjectURL(labUrlRef.current)
      const url = URL.createObjectURL(file)
      labUrlRef.current = url
      setLabResult({ url, name, file, stats })
      toast.success('Modello migliorato pronto! 🔧✨')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Elaborazione non riuscita')
    } finally {
      setLabBusy(false)
    }
  }, [labSrc, labBusy, labMode, labColor, labStyle, labAdds, labHeight])

  const saveLab = useCallback(async () => {
    if (!labResult || labSaving) return
    setLabSaving(true)
    try {
      const modeRes = await fetchAuth('/api/upload')
      const mode = ((await modeRes.json().catch(() => ({}))) as { mode?: string }).mode
      let url = ''
      if (mode === 'blob') {
        const blob = await upload(labResult.file.name, labResult.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
        })
        url = blob.url
      } else {
        const fd = new FormData()
        fd.append('file', labResult.file)
        const res = await fetchAuth('/api/upload', { method: 'POST', body: fd })
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
        if (!res.ok || !data.url) throw new Error(data.error ?? 'Upload fallito')
        url = data.url
      }
      const reg = await fetchAuth('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: labResult.name, url, size: labResult.file.size }),
      })
      if (!reg.ok) {
        const d = (await reg.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error ?? 'Registrazione non riuscita')
      }
      await refreshLabModels()
      toast.success('Salvato in «Progetti importati»! Lo trovi anche nella barra oggetti 📦')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito')
    } finally {
      setLabSaving(false)
    }
  }, [labResult, labSaving, refreshLabModels])

  const saveInternal = useCallback(async () => {
    if (!iresult || isaving) return
    setIsaving(true)
    try {
      // come per gli import: blob mode in produzione, disco in dev
      const modeRes = await fetchAuth('/api/upload')
      const mode = ((await modeRes.json().catch(() => ({}))) as { mode?: string }).mode
      let url = ''
      if (mode === 'blob') {
        const blob = await upload(iresult.file.name, iresult.file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
        })
        url = blob.url
      } else {
        const fd = new FormData()
        fd.append('file', iresult.file)
        const res = await fetchAuth('/api/upload', { method: 'POST', body: fd })
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
        if (!res.ok || !data.url) throw new Error(data.error ?? 'Upload fallito')
        url = data.url
      }
      const reg = await fetchAuth('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: iresult.name, url, size: iresult.file.size }),
      })
      if (!reg.ok) {
        const d = (await reg.json().catch(() => ({}))) as { error?: string }
        throw new Error(d.error ?? 'Registrazione non riuscita')
      }
      toast.success('Salvato in «Progetti importati»! Lo trovi anche nella barra oggetti 📦')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito')
    } finally {
      setIsaving(false)
    }
  }, [iresult, isaving])

  // libera l'object URL allo smontaggio
  useEffect(() => () => {
    if (iobjUrlRef.current) URL.revokeObjectURL(iobjUrlRef.current)
  }, [])

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
        `Immagine letta: ambiente ${a.label} 🪄`
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
      useWorld.getState().setWorldStyle('realistico')
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
      {/* ============ MOTORE INTERNO DARPX (🧬 senza chiavi) ============ */}
      <div className="rounded-3xl bg-white/85 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Dna className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-lg font-semibold">Darpx.ai · Motore interno</h2>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> 100% nel tuo browser · senza chiavi · senza limiti
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Descrivi cosa vuoi e <b>l'AI di Darpx lo costruisce pezzo per pezzo</b>: creature con
          anatomia, armi, edifici, alberi, oggetti magici… Capisce italiano, colori e materiali
          (oro, legno, ghiaccio, fuoco…). Il modello è un GLB vero da usare subito nei tuoi mondi.
        </p>

        <textarea
          value={iprompt}
          onChange={e => setIPrompt(e.target.value)}
          rows={2}
          maxLength={300}
          placeholder="Es: un drago rosso feroce con le corna…"
          className="mt-4 w-full resize-none rounded-2xl border border-stone-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {PROMPT_SUGGESTIONS.slice(0, 6).map(s => (
            <button
              key={s}
              onClick={() => setIPrompt(s)}
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition hover:brightness-95"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary-strong)' }}
            >
              {s}
            </button>
          ))}
        </div>

        <Button
          className="mt-3 w-full"
          onClick={() => startInternal()}
          disabled={igen || !iprompt.trim()}
        >
          {igen ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {istep || 'Genero…'}
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-4 w-4" /> Genera il modello 3D
            </>
          )}
        </Button>

        {/* ---- v7: DOMANDE SUI DETTAGLI prima di generare ---- */}
        {iqOpen && !igen && (
          <div className="mt-3 rounded-2xl bg-[var(--primary-soft)]/60 p-4 ring-1 ring-[var(--primary)]/25">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-stone-800">
                🧬 Prima di costruire «{iqBase}», dimmi i dettagli
              </p>
              <button
                onClick={() => setIqOpen(false)}
                className="rounded-full p-1 text-stone-400 transition hover:bg-white/60 hover:text-stone-700"
                title="Chiudi (genera dopo)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              Rispondi solo a quello che ti ispira: il resto lo scelgo io con gusto.
            </p>

            {iqMissing.colore && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Colore</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {COLOR_CHOICES.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setQColore(qColore === c.id ? '' : c.id)}
                      className={`h-7 w-7 rounded-full ring-2 transition-transform hover:scale-110 ${
                        qColore === c.id ? 'ring-stone-800 scale-110' : 'ring-white/70'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.id}
                    />
                  ))}
                  <span className="ml-1 self-center text-[11px] text-stone-400">
                    {qColore || 'a sorpresa 🎲'}
                  </span>
                </div>
              </div>
            )}

            {iqMissing.taglia && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Taglia</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SIZE_CHOICES.map(s => (
                    <button
                      key={s}
                      onClick={() => setQTaglia(qTaglia === s ? '' : s)}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        qTaglia === s
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {iqMissing.materiale && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Materiale</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {MATERIAL_CHOICES.map(m => (
                    <button
                      key={m}
                      onClick={() => setQMateriale(qMateriale === m ? '' : m)}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        qMateriale === m
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {iqMissing.dettagli && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  Dettagli (più scelte possibili)
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DETAIL_CHOICES.map(d => (
                    <button
                      key={d.id}
                      onClick={() =>
                        setQDettagli(qs =>
                          qs.includes(d.id) ? qs.filter(x => x !== d.id) : [...qs, d.id]
                        )
                      }
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                        qDettagli.includes(d.id)
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" className="flex-1" onClick={() => applyQuestionsAndRun(false)}>
                <Wand2 className="mr-1.5 h-3.5 w-3.5" /> Genera ora
              </Button>
              <Button size="sm" variant="outline" onClick={() => applyQuestionsAndRun(true)}>
                Salta e genera
              </Button>
            </div>
            <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[11px] text-stone-500">
              <input
                type="checkbox"
                checked={askDetails}
                onChange={e => toggleAskDetails(e.target.checked)}
                className="accent-[var(--primary)]"
              />
              Chiedimi sempre i dettagli prima di generare
            </label>
          </div>
        )}

        {iresult && (
          <div className="mt-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-stone-800">🧬 {iresult.name}</p>
              <span className="text-[11px] text-stone-400">
                {(iresult.file.size / 1024).toFixed(0)} KB · GLB pronto
              </span>
            </div>
            {/* anteprima 3D inline: ruota col mouse / col dito */}
            <div className="mt-3">
              <MiniPreview url={iresult.url} />
              <p className="mt-1 text-center text-[10px] text-stone-400">
                trascina per ruotare · rotella per lo zoom · auto-rotazione attiva
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-stone-500 sm:grid-cols-4">
              <div className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-stone-200">
                <b className="block text-stone-800">{iresult.stats.triangles.toLocaleString('it')}</b> triangoli
              </div>
              <div className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-stone-200">
                <b className="block text-stone-800">{iresult.stats.meshes}</b> mesh
              </div>
              <div className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-stone-200">
                <b className="block text-stone-800">{iresult.stats.materials}</b> materiali
              </div>
              <div className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-stone-200">
                <b className="block text-stone-800">{iresult.stats.parts}</b> pezzi assemblati
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                size="sm"
                onClick={() => {
                  setPreviewUrl(iresult.url)
                  setPreviewName(iresult.name)
                }}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Anteprima 3D
              </Button>
              <Button size="sm" variant="outline" onClick={() => void saveInternal()} disabled={isaving}>
                {isaving ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Salvo…</>
                ) : (
                  <><Save className="mr-1.5 h-3.5 w-3.5" /> Salva nei Progetti importati</>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runInternal(iresult.prompt, true)}
                disabled={igen}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Genera variante
              </Button>
              <a
                href={iresult.url}
                download={`${iresult.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.glb`}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                <Download className="h-3.5 w-3.5" /> Scarica GLB
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ============ LABORATORIO GLB (v7) ============ */}
      <div className="rounded-3xl bg-white/85 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Wrench className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-lg font-semibold">Darpx.ai · Laboratorio GLB</h2>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> migliora i modelli che hai già
          </span>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Riprendi un modello <b>che hai già creato o caricato</b> e fallo rinascere: tinta o
          veri materiali PBR (oro, ferro, legno, pietra…), ali, corna, basamento, aura luminosa
          e ridimensionamento. Tutto nel browser, senza servizi esterni.
        </p>

        {/* scelta del modello di partenza */}
        <input
          ref={labFileRef}
          type="file"
          accept=".glb,.gltf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void pickLabFile(f)
            e.target.value = ''
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {(labModels ?? []).slice(0, 6).map(m => (
            <button
              key={m.id}
              onClick={() => void pickLabModel(m.name, m.url)}
              className={`max-w-full truncate rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                labSrc?.name === m.name
                  ? 'border-[var(--primary)] bg-[var(--primary-soft)] ring-1 ring-[var(--primary)]'
                  : 'border-stone-200 bg-white hover:bg-stone-50'
              }`}
            >
              📦 {m.name}
            </button>
          ))}
          <button
            onClick={() => labFileRef.current?.click()}
            className="rounded-xl border border-dashed border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-500 transition hover:border-[var(--primary)] hover:bg-stone-50"
          >
            + file dal computer
          </button>
        </div>
        {labModels === null && (
          <div className="mt-3 flex items-center gap-2 text-sm text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cerco i tuoi modelli…
          </div>
        )}
        {labModels !== null && labModels.length === 0 && (
          <p className="mt-3 rounded-xl bg-stone-50 p-3 text-xs text-stone-500 ring-1 ring-stone-200">
            Non hai ancora modelli nei Progetti importati: carica un GLB qui sopra (oppure
            generane uno col motore interno!) e poi torna a migliorarlo.
          </p>
        )}

        {labSrc && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs ring-1 ring-stone-200">
              <b className="text-stone-700">In lavorazione:</b>
              <span className="truncate text-stone-600">{labSrc.name}</span>
              <button
                onClick={() => setLabSrc(null)}
                className="ml-auto rounded-full p-1 text-stone-400 transition hover:bg-white hover:text-red-500"
                title="Cambia modello"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* modalità */}
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Restyling</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {([
                  ['originale', 'Originale'],
                  ['tinta', 'Tinta colore'],
                  ['materiale', 'Materiale PBR'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setLabMode(id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      labMode === id
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {labMode !== 'originale' && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  {labMode === 'tinta' ? 'Colore della tinta' : 'Materiale'}
                </p>
                {labMode === 'tinta' ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {['#d9a72e', '#c0392b', '#2563a8', '#3f8f4f', '#7c4fa8', '#e087ab', '#8a8a90', '#eeeeea'].map(c => (
                      <button
                        key={c}
                        onClick={() => setLabColor(c)}
                        className={`h-7 w-7 rounded-full ring-2 transition-transform hover:scale-110 ${
                          labColor === c ? 'ring-stone-800 scale-110' : 'ring-white/70'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {['oro', 'argento', 'ferro', 'acciaio', 'bronzo', 'rame', 'legno', 'quercia', 'pietra', 'granito', 'marmo', 'cristallo'].map(m => (
                      <button
                        key={m}
                        onClick={() => setLabStyle(m)}
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                          labStyle === m
                            ? 'bg-[var(--primary)] text-white'
                            : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* aggiunte */}
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Aggiunte</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {([
                  ['wings', 'Ali 🪽'],
                  ['horns', 'Corna 🐂'],
                  ['base', 'Basamento 🗿'],
                  ['aura', 'Aura ✨'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setLabAdds(a => ({ ...a, [id]: !a[id] }))}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      labAdds[id]
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* altezza */}
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Altezza finale</p>
                <span className="text-[11px] font-medium text-stone-500">
                  {labHeight > 0 ? `${labHeight.toFixed(1)} unità` : 'come originale'}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                step={0.5}
                value={labHeight}
                onChange={e => setLabHeight(Number(e.target.value))}
                className="mt-1.5 w-full accent-[var(--primary)]"
              />
            </div>

            <Button className="mt-4 w-full" onClick={() => void runLab()} disabled={labBusy}>
              {labBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Elaboro il modello…
                </>
              ) : (
                <>
                  <Wrench className="mr-2 h-4 w-4" /> Migliora il modello
                </>
              )}
            </Button>
          </>
        )}

        {labResult && (
          <div className="mt-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-stone-800">🔧 {labResult.name}</p>
              <span className="text-[11px] text-stone-400">
                {(labResult.file.size / 1024).toFixed(0)} KB · GLB pronto
              </span>
            </div>
            <div className="mt-3">
              <MiniPreview url={labResult.url} />
              <p className="mt-1 text-center text-[10px] text-stone-400">
                trascina per ruotare · rotella per lo zoom · auto-rotazione attiva
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-stone-500 sm:grid-cols-4">
              <div className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-stone-200">
                <b className="block text-stone-800">{labResult.stats.triangles.toLocaleString('it')}</b> triangoli
              </div>
              <div className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-stone-200">
                <b className="block text-stone-800">{labResult.stats.meshes}</b> mesh
              </div>
              <div className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-stone-200">
                <b className="block text-stone-800">{labResult.stats.materials}</b> materiali
              </div>
              <div className="rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-stone-200">
                <b className="block text-stone-800">{labResult.stats.parts}</b> pezzi
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button size="sm" onClick={() => { setPreviewUrl(labResult.url); setPreviewName(labResult.name) }}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Anteprima 3D
              </Button>
              <Button size="sm" variant="outline" onClick={() => void saveLab()} disabled={labSaving}>
                {labSaving ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Salvo…</>
                ) : (
                  <><Save className="mr-1.5 h-3.5 w-3.5" /> Salva nei Progetti importati</>
                )}
              </Button>
              <a
                href={labResult.url}
                download={`${labResult.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.glb`}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 sm:col-span-2"
              >
                <Download className="h-3.5 w-3.5" /> Scarica GLB migliorato
              </a>
            </div>
          </div>
        )}
      </div>

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
                    <li>🌿 Resa: <b>realistica</b></li>
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

      {/* ============ MOTORI ESTERNI (opzionali) ============ */}
      <div className="rounded-3xl bg-white/85 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Mountain className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-lg font-semibold">Motori esterni · Testo o Immagine → 3D</h2>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Vuoi il look <b>fotorealistico</b> dei motori cloud? Descrivi il modello e usa
          Tripo, fal.ai (Hunyuan 3D), Stable Fast 3D e Meshy: se uno si blocca, passa al
          successivo da solo. Serve una chiave API gratuita del motore che preferisci
          (l&apos;admin può anche metterne una globale). Il modello arriva nei{' '}
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
