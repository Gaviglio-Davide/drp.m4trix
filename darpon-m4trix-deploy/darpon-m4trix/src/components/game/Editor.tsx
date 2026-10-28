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
  Camera,
  Check,
  CloudUpload,
  HelpCircle,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Square,
  Undo2,
} from 'lucide-react'
import {
  serializeState,
  useWorld,
  PALETTE,
  type SaveSnapshot,
} from '@/lib/world-store'
import { BUILTIN_ASSETS } from '@/lib/assets'
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

  const [name, setName] = useState('')
  const [savesOpen, setSavesOpen] = useState(false)
  const [saves, setSaves] = useState<SaveSnapshot[]>([])
  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<string | null>(
    null
  )
  const fileRef = useRef<HTMLInputElement>(null)
  const firstRender = useRef(true)
  const glOK = useRef<boolean | null>(null)
  if (glOK.current === null) glOK.current = webglSupported()

  // sync local name
  useEffect(() => {
    if (project) setName(project.name)
  }, [project?.id])

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
  }, [objects, customAssets, project, playMode, patchState])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (playMode) {
        if (e.code === 'Escape') setPlayMode(false)
        return
      }
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
  }, [playMode, undo, setGhostRot, setGhostColor, setPlayMode])

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

  const renameProject = async (newName: string) => {
    if (!newName.trim()) return
    await fetchAuth(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
  }

  const saveChip = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-stone-600 ring-1 ring-black/5">
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
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-white/80 p-2 shadow-lg ring-1 ring-black/5 backdrop-blur">
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

        <div className="pointer-events-auto ml-auto flex items-center gap-1 rounded-2xl bg-white/80 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur">
          <Button
            variant={cameraMode ? 'default' : 'ghost'}
            size="sm"
            title="Modalità camera (trascina per ruotare)"
            onClick={toggleCameraMode}
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Annulla (Ctrl+Z)"
            disabled={!history.length}
            onClick={undo}
          >
            <Undo2 className="h-4 w-4" />
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
                  volo
                </li>
                <li>
                  <b>Clic destro</b> (anche trascinando) → rimuove gli oggetti
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
                  corri, trascina il mouse per guardarti attorno
                </li>
              </ul>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* bottom palette */}
      {!playMode && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
          <div className="flex max-w-full flex-col gap-2 rounded-3xl bg-white/85 p-3 shadow-2xl ring-1 ring-black/5 backdrop-blur">
            {/* color chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
              <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Colori
              </span>
              {PALETTE.map((c, i) => (
                <button
                  key={c}
                  onClick={() => setGhostColor(i)}
                  className={`h-6 w-6 shrink-0 rounded-full ring-2 transition-transform hover:scale-110 ${
                    ghostColor % PALETTE.length === i
                      ? 'ring-stone-700'
                      : 'ring-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Colore ${i + 1}`}
                />
              ))}
              <span className="mx-2 h-5 w-px shrink-0 bg-stone-200" />
              <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Ruota: R
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 shrink-0 rounded-full px-2"
                onClick={() => setGhostRot(ghostRot + 1)}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
            {/* assets */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-1 pt-0.5">
              {BUILTIN_ASSETS.map(a => (
                <button
                  key={a.id}
                  onClick={() => selectAsset(a.id)}
                  className={`flex min-w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl px-2.5 py-2 transition-all ${
                    selectedAsset === a.id
                      ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                      : 'bg-stone-50 ring-1 ring-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <span className="text-xl leading-none">{a.icon}</span>
                  <span className="whitespace-nowrap text-[10px] font-medium text-stone-600">
                    {a.label}
                  </span>
                </button>
              ))}
              {customAssets.map(a => (
                <button
                  key={a.id}
                  onClick={() => selectAsset(a.id)}
                  className={`flex min-w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl px-2.5 py-2 transition-all ${
                    selectedAsset === a.id
                      ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                      : 'bg-stone-50 ring-1 ring-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <span className="text-xl leading-none">📦</span>
                  <span className="max-w-20 truncate text-[10px] font-medium text-stone-600">
                    {a.name}
                  </span>
                </button>
              ))}
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
                className="flex min-w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-dashed border-stone-300 px-2.5 py-2 transition-colors hover:bg-[var(--primary-soft)]"
              >
                <CloudUpload className="h-5 w-5 text-stone-500" />
                <span className="whitespace-nowrap text-[10px] font-medium text-stone-500">
                  Carica GLB
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* play mode hint */}
      {playMode && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <div className="rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-stone-700 shadow-lg ring-1 ring-black/5 backdrop-blur">
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
