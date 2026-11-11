'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  CloudUpload,
  Download,
  HelpCircle,
  Eraser,
  Hammer,
  Hand,
  Loader2,
  Mountain,
  Play,
  RotateCcw,
  Save,
  Shovel,
  Square,
  Undo2,
  UserRound,
} from 'lucide-react'
import {
  serializeState,
  useWorld,
  PALETTE,
  type SaveSnapshot,
} from '@/lib/world-store'
import { BUILTIN_ASSETS, getAssetDef } from '@/lib/assets'
import { useStructures, libraryAssetId } from '@/lib/structures-store'
import ProfileDialog from '@/components/ProfileDialog'
import { fetchAuth } from '@/lib/http'
import { GLBoundary, NoGLCard, webglSupported } from './GLGuard'
import { upload } from '@vercel/blob/client'
import dynamic from 'next/dynamic'

const EditorScene = dynamic(() => import('./EditorScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sky-100">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
        <p className="text-sm font-medium text-[var(--primary-strong)]">
          Preparo il tuo mondo...
        </p>
      </div>
    </div>
  ),
})

const PlayMode = dynamic(() => import('./PlayMode'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sky-100">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
        <p className="text-sm font-medium text-[var(--primary-strong)]">
          Il mondo prende vita...
        </p>
      </div>
    </div>
  ),
})

// v13: pannello MONDO VASTO (natura infinita procedurale)
const VastPanel = dynamic(() => import('@/components/vastworld/VastPanel'), { ssr: false })

export default function Editor() {
  const project = useWorld(s => s.currentProject)
  const objects = useWorld(s => s.objects)
  const customAssets = useWorld(s => s.customAssets)
  const selectedAsset = useWorld(s => s.selectedAsset)
  const ghostRot = useWorld(s => s.ghostRot)
  const ghostColor = useWorld(s => s.ghostColor)
  const playMode = useWorld(s => s.playMode)
  const cameraMode = useWorld(s => s.cameraMode)
  const saveStatus = useWorld(s => s.saveStatus)
  const history = useWorld(s => s.history)
  const closeProject = useWorld(s => s.closeProject)
  const selectAsset = useWorld(s => s.selectAsset)
  const setGhostRot = useWorld(s => s.setGhostRot)
  const setGhostColor = useWorld(s => s.setGhostColor)
  const setPlayMode = useWorld(s => s.setPlayMode)
  const toggleCameraMode = useWorld(s => s.toggleCameraMode)
  const undo = useWorld(s => s.undo)
  const addCustomAsset = useWorld(s => s.addCustomAsset)
  const loadState = useWorld(s => s.loadState)
  const setSaveStatus = useWorld(s => s.setSaveStatus)
  const worldStyle = useWorld(s => s.worldStyle)
  const playerAsset = useWorld(s => s.playerAsset)
  const setPlayerAsset = useWorld(s => s.setPlayerAsset)
  const ghostScale = useWorld(s => s.ghostScale)
  const brush = useWorld(s => s.brush)
  const brushSize = useWorld(s => s.brushSize)
  const brushFlow = useWorld(s => s.brushFlow)
  const setBrush = useWorld(s => s.setBrush)
  const setBrushSize = useWorld(s => s.setBrushSize)
  const setBrushFlow = useWorld(s => s.setBrushFlow)
  const clearTerrain = useWorld(s => s.clearTerrain)
  const skyboxUrl = useWorld(s => s.skyboxUrl)
  const setSkybox = useWorld(s => s.setSkybox)
  const setGhostScale = useWorld(s => s.setGhostScale)

  const [name, setName] = useState('')
  const [savesOpen, setSavesOpen] = useState(false)
  const [saves, setSaves] = useState<SaveSnapshot[]>([])
  const [legendOpen, setLegendOpen] = useState(false)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<string | null>(
    null
  )
  const [paletteOpen, setPaletteOpen] = useState(false) // v16: dock compatto
  const fileRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)
  const glOK = useRef<boolean | null>(null)
  if (glOK.current === null) glOK.current = webglSupported()

  // sync local name
  useEffect(() => {
    if (project) setName(project.name)
  }, [project?.id])

  // ---------- modelli importati dalla home (Reparto Progetti importati) ----------
  // rende disponibili nell'editor TUTTI i modelli caricati dall'utente,
  // senza doverli ricaricare progetto per progetto. Porta anche la
  // dimensione predefinita scelta nella home.
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetchAuth('/api/models')
        if (!res.ok) return
        const data = (await res.json()) as {
          models?: { id: string; name: string; url: string; scale?: number | null }[]
        }
        const existing = new Set(
          useWorld.getState().customAssets.map(a => a.url)
        )
        for (const m of data.models ?? []) {
          if (!m.url || existing.has(m.url)) continue
          useWorld.getState().addCustomAsset({
            id: `m_${m.id}`,
            name: m.name,
            url: m.url,
            kind: 'glb',
            scale: m.scale ?? 1,
          })
        }
      } catch {
        // silenzioso: l'editor funziona anche senza modelli importati
      }
    })()
  }, [])

  // ---------- strutture dal Reparto Strutture della home ----------
  // la libreria globale viene importata automaticamente in ogni mondo
  useEffect(() => {
    useStructures.getState().load()
    const existingIds = new Set(
      useWorld.getState().customAssets.map(a => a.id)
    )
    for (const s of useStructures.getState().structures) {
      const id = libraryAssetId(s.id)
      if (existingIds.has(id)) continue
      useWorld.getState().addCustomAsset({
        id,
        name: s.name,
        kind: 'structure',
        pieces: s.pieces.map(p => ({ ...p })),
      })
    }
  }, [])

  // ---------- autosave ----------
  const patchState = useCallback(
    async (state: string) => {
      if (!project) return
      setSaveStatus('saving')
      try {
        const res = await fetchAuth(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state }),
        })
        if (!res.ok) throw new Error()
        setSaveStatus('saved')
      } catch {
        setSaveStatus('idle')
        toast.error('Salvataggio non riuscito, riprovo tra poco')
      }
    },
    [project, setSaveStatus]
  )

  useEffect(() => {
    if (!project || playMode) return
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const state = serializeState()
    const t = setTimeout(() => patchState(state), 1200)
    return () => clearTimeout(t)
  }, [objects, customAssets, playerAsset, worldStyle, project, playMode, patchState])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (playMode) {
        if (e.code === 'Escape') setPlayMode(false)
        return
      }
      if (legendOpen || playerOpen) return
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault()
        undo()
        return
      }
      if (e.code === 'KeyR') setGhostRot(useWorld.getState().ghostRot + 1)
      if (e.code === 'KeyC')
        setGhostColor(useWorld.getState().ghostColor + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playMode, legendOpen, playerOpen, undo, setGhostRot, setGhostColor, setPlayMode])

  if (!project) return null

  if (!glOK.current) {
    return (
      <div className="h-screen w-full">
        <NoGLCard />
      </div>
    )
  }

  // ---------- saves ----------
  const loadSaves = async () => {
    try {
      const res = await fetchAuth(`/api/projects/${project.id}/saves`)
      const data = await res.json()
      setSaves(data.saves ?? [])
    } catch {
      toast.error('Impossibile caricare i salvataggi')
    }
  }

  const createSave = async () => {
    try {
      const res = await fetchAuth(`/api/projects/${project.id}/saves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: serializeState() }),
      })
      if (!res.ok) throw new Error()
      toast.success('Salvataggio creato!')
      await loadSaves()
    } catch {
      toast.error('Impossibile salvare')
    }
  }

  const restoreSave = async (s: SaveSnapshot) => {
    try {
      const parsed = JSON.parse(s.state)
      loadState(parsed)
      await patchState(s.state)
      setSavesOpen(false)
      toast.success('Mondo ripristinato!')
    } catch {
      toast.error('Ripristino non riuscito')
    }
  }

  const deleteSave = async (id: string) => {
    // no dedicated DELETE endpoint: overwrite approach not needed for MVP.
    toast.info('Cancellazione snapshot non disponibile in questa versione')
  }

  // ---------- upload ----------
  const onUpload = async (file: File) => {
    try {
      setSavesOpen(false)
      let name = file.name
      let url = ''

      // blob mode = produzione (Vercel): upload diretto browser → Blob,
      // necessario per i file grandi (limite ~4.5MB sulle serverless)
      const modeRes = await fetchAuth('/api/upload')
      const mode = (
        (await modeRes.json().catch(() => ({}))) as { mode?: string }
      ).mode

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
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Upload fallito')
        name = data.name ?? name
        url = data.url
      }

      addCustomAsset({ id: `c_${Date.now()}`, name, url })
      toast.success(`"${name}" aggiunto alla libreria!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload fallito')
    }
  }

  // ---------- v17: esporta il mondo come file .mondo.json ----------
  // il file si può ri-importare nel Game Studio (bottone «🌍 Importa mondo»)
  // o nell'account di un amico: perfetto per condividere i propri mondi
  const exportWorld = () => {
    try {
      const blob = new Blob([serializeState()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(project?.name || 'mondo').replace(/[^\w-]+/g, '_')}.mondo.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('🌍 Mondo esportato! Importalo nel Game Studio con «🌍 Importa mondo».')
    } catch {
      toast.error('Esportazione non riuscita')
    }
  }

  const renameProject = async (newName: string) => {
    if (!newName.trim()) return
    await fetchAuth(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
  }

  const saveChip = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--panel)] px-2.5 py-1 text-xs font-medium text-[var(--tx-dim)] ring-1 ring-[var(--line)]">
      {saveStatus === 'saving' && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio...
        </>
      )}
      {saveStatus === 'saved' && (
        <>
          <Check className="h-3 w-3 text-[var(--primary)]" /> Salvato
        </>
      )}
      {saveStatus === 'idle' && <>Modifiche non salvate</>}
    </span>
  )

  const selectedDef = selectedAsset
    ? getAssetDef(selectedAsset, customAssets)
    : null

  // selezione asset: per i modelli GLB importati applica subito la
  // dimensione predefinita scelta nella home (reparto Progetti importati)
  const pickAsset = (id: string) => {
    selectAsset(id)
    const a = customAssets.find(x => x.id === id)
    if (a?.url && a.scale && Number.isFinite(a.scale)) {
      setGhostScale(a.scale)
    }
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-sky-100">
      {/* 3D canvas */}
      <div className="absolute inset-0">
        <GLBoundary>
          {playMode ? <PlayMode /> : <EditorScene />}
        </GLBoundary>
      </div>

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-[var(--panel)] p-2 shadow-lg ring-1 ring-[var(--line)] backdrop-blur">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              patchState(serializeState())
              closeProject()
            }}
          >
            <ArrowLeft className="h-4 w-4" /> Progetti
          </Button>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => renameProject(name)}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="h-8 w-44 border-none bg-transparent font-semibold shadow-none focus-visible:ring-1"
          />
        </div>

        <div className="pointer-events-auto">{saveChip}</div>

        <div className="pointer-events-auto ml-auto flex items-center gap-1 rounded-2xl bg-[var(--panel)] p-1.5 shadow-lg ring-1 ring-[var(--line)] backdrop-blur">
          <Button
            variant={cameraMode ? 'default' : 'ghost'}
            size="sm"
            title="Modalità camera (oppure trascina col tasto DESTRO per ruotare)"
            onClick={toggleCameraMode}
          >
            <Camera className="h-4 w-4" />
          </Button>
          {!playMode && (
            <>
              <div className="mx-0.5 h-6 w-px bg-black/10" />
              <Button
                variant={brush === 'raise' ? 'default' : 'ghost'}
                size="sm"
                title="Terreno: alza (trascina per creare colline e montagne)"
                onClick={() => setBrush(brush === 'raise' ? 'none' : 'raise')}
              >
                <Mountain className="h-4 w-4" />
                <span className="hidden lg:inline">Alza</span>
              </Button>
              <Button
                variant={brush === 'lower' ? 'default' : 'ghost'}
                size="sm"
                title="Terreno: scava (laghi, fiumi, valli: sotto -0.3 appare l'acqua!)"
                onClick={() => setBrush(brush === 'lower' ? 'none' : 'lower')}
              >
                <Shovel className="h-4 w-4" />
                <span className="hidden lg:inline">Scava</span>
              </Button>
              <Button
                variant={brush === 'flatten' ? 'default' : 'ghost'}
                size="sm"
                title="Terreno: spiana verso il livello zero"
                onClick={() => setBrush(brush === 'flatten' ? 'none' : 'flatten')}
              >
                <Eraser className="h-4 w-4" />
                <span className="hidden lg:inline">Spiana</span>
              </Button>
              <Button
                variant={brush !== 'none' ? 'default' : 'ghost'}
                size="sm"
                title="Pennello spento: piazza e modifica gli oggetti"
                onClick={() => setBrush('none')}
              >
                <Hand className="h-4 w-4" />
                <span className="hidden lg:inline">Oggetti</span>
              </Button>
              {brush !== 'none' && (
                <div className="ml-1 flex items-center gap-2 rounded-xl bg-[var(--panel-soft)] px-2 py-1">
                  <label className="flex items-center gap-1 text-[11px] font-medium text-[var(--tx-dim)]">
                    Ø
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={0.5}
                      value={brushSize}
                      onChange={e => setBrushSize(Number(e.target.value))}
                      className="w-16 accent-stone-700"
                    />
                    <span className="w-6 tabular-nums">{brushSize.toFixed(1)}</span>
                  </label>
                  <label className="flex items-center gap-1 text-[11px] font-medium text-[var(--tx-dim)]">
                    ○
                    <input
                      type="range"
                      min={0.04}
                      max={0.6}
                      step={0.02}
                      value={brushFlow}
                      onChange={e => setBrushFlow(Number(e.target.value))}
                      className="w-14 accent-stone-700"
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    title="Riporta tutto il terreno a livello zero"
                    onClick={() => {
                      clearTerrain()
                      toast.success('Terreno azzerato')
                    }}
                  >
                    <RotateCcw className="h-3 w-3" /> Azzera
                  </Button>
                </div>
              )}
              <div className="mx-0.5 h-6 w-px bg-black/10" />
              {/* v13: generatore MONDO VASTO — natura infinita */}
              <VastPanel />
              <div className="mx-0.5 h-6 w-px bg-black/10" />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            title="Annulla (Ctrl+Z)"
            disabled={!history.length}
            onClick={undo}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Scarica il mondo come file (.mondo.json): si importa nel Game Studio con «🌍 Importa mondo» o nell'account di un amico"
            onClick={exportWorld}
          >
            <Download className="h-4 w-4" />
            <span className="hidden lg:inline">Esporta</span>
          </Button>
          <Dialog
            open={savesOpen}
            onOpenChange={o => {
              setSavesOpen(o)
              if (o) loadSaves()
            }}
          >
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Salvataggi">
                <Save className="h-4 w-4" /> Salvataggi
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Salvataggi del mondo</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <Button onClick={createSave} className="w-full">
                  <Save className="mr-2 h-4 w-4" /> Salva ora uno snapshot
                </Button>
                <ScrollArea className="max-h-72">
                  <div className="flex flex-col gap-2 pr-3">
                    {saves.length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Nessuno snapshot: il mondo viene comunque salvato
                        automaticamente.
                      </p>
                    )}
                    {saves.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-xl border p-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {s.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(s.createdAt).toLocaleString('it-IT')}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreSave(s)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Ripristina
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
          {playMode ? (
            <Button size="sm" variant="destructive" onClick={() => setPlayMode(false)}>
              <Square className="mr-1 h-4 w-4" /> Esci dal gioco
            </Button>
          ) : (
            <Button size="sm" onClick={() => setPlayMode(true)}>
              <Play className="mr-1 h-4 w-4" /> Gioca
            </Button>
          )}
          <ProfileDialog iconOnly />
          {skyboxUrl && (
            <Button
              variant="ghost"
              size="sm"
              title="Il cielo è un'immagine Darpx.ai: torna al cielo normale"
              onClick={() => {
                setSkybox(null)
                toast.success('Cielo normale ripristinato')
              }}
            >
              🖼️✕
              <span className="hidden lg:inline">Cielo</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            title="Progetta le strutture nella home, reparto Strutture"
            onClick={() => {
              toast.info('Le strutture si progettano nella home → reparto Strutture. Qui le trovi già nella barra oggetti!')
            }}
          >
            <Hammer className="h-4 w-4" />
            <span className="hidden sm:inline">Strutture</span>
          </Button>
          <Dialog
            open={playerOpen}
            onOpenChange={o => setPlayerOpen(o)}
          >
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Personaggio di gioco">
                <UserRound className="h-4 w-4" />
                <span className="hidden sm:inline">Personaggio</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Personaggio di gioco</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-[var(--tx-dim)]">
                Chi interpreti in modalità Gioca. I tuoi modelli restano
                visibili solo a te.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setPlayerAsset(null)
                    setPlayerOpen(false)
                    toast.success('Personaggio: Eroe! 🧍')
                  }}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                    playerAsset === null
                      ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                      : 'hover:bg-[var(--panel-hover)]'
                  }`}
                >
                  <span className="text-2xl">🧍</span>
                  <div>
                    <p className="text-sm font-semibold">Eroe (di serie)</p>
                    <p className="text-xs text-[var(--tx-dim)]">
                      Avventuriero realistico di serie, sempre disponibile.
                    </p>
                  </div>
                </button>
                {customAssets
                  .filter(a => a.url)
                  .map(a => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setPlayerAsset(a.id)
                        setPlayerOpen(false)
                        toast.success(`Personaggio: ${a.name}`)
                      }}
                      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                        playerAsset === a.id
                          ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                          : 'hover:bg-[var(--panel-hover)]'
                      }`}
                    >
                      <span className="text-2xl">📦</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{a.name}</p>
                        <p className="text-xs text-[var(--tx-dim)]">
                          Il tuo modello 3D (se ha un&apos;animazione, cammina!)
                        </p>
                      </div>
                    </button>
                  ))}
                {customAssets.filter(a => a.url).length === 0 && (
                  <p className="text-xs text-[var(--tx-faint)]">
                    Suggerimento: carica un modello GLB dalla barra in basso per
                    giocarci dentro.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={legendOpen} onOpenChange={o => setLegendOpen(o)}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Legenda degli oggetti">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Legenda</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>📖 Legenda degli oggetti</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[55vh]">
                <div className="flex flex-col gap-2 pr-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tx-faint)]">
                    Oggetti del gioco
                  </p>
                  {BUILTIN_ASSETS.map(a => (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5"
                    >
                      <span className="text-xl">{a.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--tx)]">
                          {a.label}
                          {a.walkable && (
                            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                              ci si cammina
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--tx-dim)]">{a.desc}</p>
                      </div>
                    </div>
                  ))}
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--tx-faint)]">
                    Le tue creazioni (solo tue)
                  </p>
                  {customAssets.length === 0 && (
                    <p className="text-xs text-[var(--tx-faint)]">
                      Ancora nulla: carica un GLB dalla barra in basso oppure
                      premi 🔨 Progetta per costruire una struttura da zero.
                    </p>
                  )}
                  {customAssets.map(a => (
                    <div
                      key={a.id}
                      className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5"
                    >
                      <span className="text-xl">
                        {a.kind === 'structure' ? '🏗️' : '📦'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--tx)]">
                          {a.name}
                        </p>
                        <p className="text-xs text-[var(--tx-dim)]">
                          {a.kind === 'structure'
                            ? `Struttura con ${a.pieces?.length ?? 0} pezzi, costruita da te.`
                            : 'Modello 3D caricato da te: visibile solo nel tuo account.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Comandi">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Come si costruisce</DialogTitle>
              </DialogHeader>
              <ul className="flex flex-col gap-2 text-sm">
                <li>
                  <b>Clic sinistro</b> su una cella libera → piazza l&apos;oggetto
                  selezionato (tieni premuto e trascina per costruire in serie!)
                </li>
                <li>
                  <b>Clic sinistro</b> su un oggetto → cambia il suo colore al
                  volo; sui modelli 3D importati cambia la{' '}
                  <b>dimensione</b> (0.5x – 3x)
                </li>
                <li>
                  <b>Clic destro</b> su un oggetto → lo rimuove
                </li>
                <li>
                  <b>Tasto R</b> → ruota l&apos;anteprima · <b>C</b> → cambia
                  colore · <b>Ctrl+Z</b> → annulla
                </li>
                <li>
                  <b>Rotella centrale / trascina</b> → ruota la camera ·{' '}
                  <b>Rotella</b> → zoom · pulsante 📷 per ruotare col mouse
                </li>
                <li>
                  <b>Modalità Gioca</b>: <b>WASD</b> per camminare, <b>Shift</b>{' '}
                  corri, trascina il mouse per guardarti attorno. Salci su
                  colline e strade rialzate: il mondo ha i dislivelli!
                </li>
                <li>
                  <b>🔨 Strutture</b> → le strutture si progettano nella home,
                  nel reparto «Strutture»: qui le ritrovi già nella barra
                  oggetti, pronte da piazzare
                </li>
                <li>
                  <b>📖 Legenda</b> → tutti gli oggetti spiegati ·{' '}
                  <b>🧍 Personaggio</b> → scegli chi interpreti
                </li>
              </ul>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* v16: DOCK OGGETTI compatto e richiudibile (non occupa più metà schermo) */}
      {!playMode && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
          <div className="pointer-events-none mb-1 hidden rounded-full bg-black/55 px-4 py-1.5 text-[11px] font-medium text-white/90 shadow-lg backdrop-blur md:block">
            {brush !== 'none'
              ? 'Pennello terreno attivo: trascina col sinistro per scolpire'
              : '🖱️ Tasto destro = ruota la visuale · click destro su un oggetto = elimina · rotella = zoom'}
          </div>
          <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
            <div className="flex max-w-full flex-col gap-2 rounded-3xl bg-[var(--panel)] p-2.5 shadow-2xl ring-1 ring-[var(--line)] backdrop-blur">
              {paletteOpen && (
                <div className="flex max-h-[36vh] w-[min(92vw,760px)] flex-col gap-2 overflow-y-auto">
                  {/* colori + rotazione + dimensione */}
                  <div className="flex flex-wrap items-center gap-1.5 px-0.5">
                    <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-wide text-[var(--tx-faint)]">
                      Colori
                    </span>
                    {PALETTE.map((c, i) => (
                      <button
                        key={c}
                        onClick={() => setGhostColor(i)}
                        className={`h-5 w-5 shrink-0 rounded-full ring-2 transition-transform hover:scale-110 ${
                          ghostColor % PALETTE.length === i
                            ? 'ring-[var(--neon)]'
                            : 'ring-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Colore ${i + 1}`}
                      />
                    ))}
                    <span className="mx-1.5 h-4 w-px shrink-0 bg-[var(--line-strong)]" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 shrink-0 rounded-full px-2 text-[10px]"
                      onClick={() => setGhostRot(ghostRot + 1)}
                    >
                      <RotateCcw className="h-3 w-3" /> Ruota (R)
                    </Button>
                    {selectedDef?.isGlb && (
                      <>
                        <span className="mx-1.5 h-4 w-px shrink-0 bg-[var(--line-strong)]" />
                        <label className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--tx-faint)]">
                          Dimensione
                          <input
                            type="range"
                            min={0.2}
                            max={3}
                            step={0.1}
                            value={ghostScale}
                            onChange={e => setGhostScale(Number(e.target.value))}
                            className="h-1.5 w-24 cursor-pointer accent-[var(--primary)]"
                            aria-label="Dimensione del modello"
                          />
                          <span className="w-8 text-[11px] font-bold text-[var(--tx-dim)]">
                            {ghostScale.toFixed(1)}x
                          </span>
                        </label>
                      </>
                    )}
                  </div>
                  {/* oggetti base */}
                  <div className="flex flex-wrap items-center gap-1 px-0.5">
                    <span className="w-full text-[10px] font-bold uppercase tracking-wide text-[var(--tx-faint)]">
                      Oggetti
                    </span>
                    {BUILTIN_ASSETS.map(a => (
                      <button
                        key={a.id}
                        onClick={() => selectAsset(a.id)}
                        className={`flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-medium transition-all ${
                          selectedAsset === a.id
                            ? 'bg-[var(--primary-soft)] text-[var(--tx)] ring-1 ring-[var(--primary)]'
                            : 'bg-[var(--panel-soft)] text-[var(--tx-dim)] ring-1 ring-[var(--line)] hover:bg-[var(--panel-hover)]'
                        }`}
                      >
                        <span className="text-sm leading-none">{a.icon}</span>
                        <span className="whitespace-nowrap">{a.label}</span>
                      </button>
                    ))}
                  </div>
                  {/* modelli importati e strutture */}
                  {customAssets.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 px-0.5">
                      <span className="w-full text-[10px] font-bold uppercase tracking-wide text-[var(--tx-faint)]">
                        I tuoi modelli & strutture
                      </span>
                      {customAssets.map(a => (
                        <button
                          key={a.id}
                          onClick={() => pickAsset(a.id)}
                          className={`flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-medium transition-all ${
                            selectedAsset === a.id
                              ? 'bg-[var(--primary-soft)] text-[var(--tx)] ring-1 ring-[var(--primary)]'
                              : 'bg-[var(--panel-soft)] text-[var(--tx-dim)] ring-1 ring-[var(--line)] hover:bg-[var(--panel-hover)]'
                          }`}
                        >
                          <span className="text-sm leading-none">
                            {a.kind === 'structure' ? '🏗️' : '📦'}
                          </span>
                          <span className="max-w-28 truncate">{a.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* barra compatta sempre visibile */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".glb,.gltf"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) onUpload(f)
                    e.target.value = ''
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-[var(--line-strong)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--tx-dim)] transition-colors hover:bg-[var(--primary-soft)]"
                >
                  <CloudUpload className="h-4 w-4" /> Carica GLB
                </button>
                <button
                  onClick={() => setPaletteOpen(o => !o)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold shadow-sm transition-all ${
                    paletteOpen
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--primary-soft)] text-[var(--primary-strong)] ring-1 ring-[var(--primary)]'
                  }`}
                >
                  🎒 Oggetti {paletteOpen ? '▼' : '▲'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* play mode hint */}
      {playMode && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <div className="rounded-full bg-[var(--panel)] px-4 py-2 text-sm font-medium text-[var(--tx)] shadow-lg ring-1 ring-[var(--line)] backdrop-blur">
            WASD per camminare · Shift per correre · trascina il mouse per
            guardarti attorno · ESC per uscire
          </div>
        </div>
      )}

      <AlertDialog
        open={!!confirmDeleteAsset}
        onOpenChange={o => !o && setConfirmDeleteAsset(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere questo asset?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;oggetto sparirà dalla libreria di questo progetto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDeleteAsset(null)
                void deleteSave(confirmDeleteAsset ?? '')
              }}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
