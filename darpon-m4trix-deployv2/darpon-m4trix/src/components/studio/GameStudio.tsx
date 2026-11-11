'use client'

// ============================================================
// REPARTO: GAME STUDIO — "costruisci videogiochi veri"
// Lista dei giochi dell'utente + accesso a editor e player.
// I giochi sono progetti nel DB (marker kind:'game2d').
// v17: terzo stile "3D REALISTICO" (Darpx Engine) + import
// mondi dall'hub corretto (il gioco appare SUBITO in lista).
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Gamepad2,
  Pencil,
  Play,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react'
import {
  createGame,
  deleteGame,
  importGameFile,
  isGameProjectState,
  listGames,
  type GameMeta,
} from '@/lib/game2d/persist'
import { newGameProject, gameDimension } from '@/lib/game2d/types'
import { REAL_TEMPLATES } from '@/lib/engine3d/types'
import { fetchAuth } from '@/lib/http'
import GameEditor from '@/components/studio/GameEditor'
import GamePlayer from '@/components/studio/GamePlayer'
import GamePlayer3D from '@/components/studio/GamePlayer3D'
import dynamic from 'next/dynamic'
import { useUI } from '@/lib/ui-store'
import { sectionOf } from '@/lib/ui-store'

// v17: studio REALISTICO (Darpx Engine) — solo client, niente SSR
const RealisticStudio = dynamic(
  () => import('@/components/studio/RealisticStudio'),
  { ssr: false }
)

type Mode = { kind: 'list' } | { kind: 'edit'; meta: GameMeta } | { kind: 'play'; meta: GameMeta }

type HubWorld = {
  id: string
  name: string
  updatedAt: string
  hasVast: boolean
  nObjects: number
}

export default function GameStudio() {
  const site = useUI(s => s.site)
  const sec = sectionOf(site.sections, 'gamestudio')
  const [metas, setMetas] = useState<GameMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStyle, setNewStyle] = useState<'2d' | '3d' | 'real3d'>('real3d') // v17: realistico in evidenza
  const [newTemplate, setNewTemplate] = useState('corridoio-spaziale') // template Darpx Engine
  const [busy, setBusy] = useState(false)
  const [hubOpen, setHubOpen] = useState(false) // v17: import da hub
  const [hubWorlds, setHubWorlds] = useState<HubWorld[] | null>(null)
  const [hubLoading, setHubLoading] = useState(false)
  const [hubBusy, setHubBusy] = useState<string | null>(null)

  // un altro reparto (Crea da Script / World Forge) ha creato un
  // gioco: apriamo subito il suo editor qui dentro
  const studioOpenId = useUI(s => s.studioOpenId)
  useEffect(() => {
    if (!studioOpenId || loading) return
    const m = metas.find(x => x.id === studioOpenId)
    if (m) {
      setMode({ kind: 'edit', meta: m })
      useUI.getState().setStudioOpenId(null)
    }
  }, [studioOpenId, metas, loading])

  const refresh = useCallback(async () => {
    try {
      const list = await listGames()
      setMetas(list)
    } catch {
      toast.error('Impossibile caricare i giochi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createNew = async () => {
    if (busy) return
    const name = newName.trim() || 'Il mio gioco'
    setBusy(true)
    try {
      const game = newGameProject(name, {
        dimension: newStyle,
        ...(newStyle === 'real3d' ? { template: newTemplate } : {}),
      })
      const m = await createGame(name, game)
      setCreateOpen(false)
      setNewName('')
      setMode({ kind: 'edit', meta: m })
      toast.success(
        newStyle === 'real3d'
          ? `"${name}" creato col Darpx Engine: ambiente realistico PBR pronto! 🎬`
          : newStyle === '3d'
            ? `"${name}" creato in 3D: il tuo MONDO VASTO ti aspetta! 🌍`
            : `"${name}" creato: Benvenuto nel Game Studio! 🎮`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (f: File) => {
    try {
      const game = await importGameFile(f)
      const m = await createGame(game.title || 'Gioco importato', game)
      setMode({ kind: 'edit', meta: m })
      toast.success('Gioco importato!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import fallito')
    }
  }

  // v17: importa un MONDO (file .mondo.json): ora crea un GIOCO vero
  // collegato a quel mondo → appare subito in questa lista ed è giocabile
  const importWorldFile = async (f: File) => {
    try {
      const w = JSON.parse(await f.text()) as {
        objects?: unknown[]
        terrain?: unknown
        vast?: unknown
        customAssets?: unknown[]
      }
      if (!w || (!Array.isArray(w.objects) && !w.terrain && !w.vast)) {
        throw new Error('File non valido: serve un file .mondo.json (esportalo dal reparto Mondi 3D con il bottone ⇩ Esporta)')
      }
      const name = (f.name.replace(/\.mondo\.json$/i, '').replace(/\.json$/i, '') || 'Mondo importato').slice(0, 60)
      // 1) crea il progetto-mondo nel DB
      const res = await fetchAuth('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la creazione')
      const save = await fetchAuth(`/api/projects/${data.project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: JSON.stringify(w) }),
      })
      if (!save.ok) throw new Error('Salvataggio del mondo non riuscito')
      // 2) crea il GIOCO collegato a quel mondo
      const game = newGameProject(name, { dimension: '3d' })
      delete (game.settings as { vast?: unknown }).vast // usa il mondo importato, non il mondo vasto
      game.settings.worldProjectId = data.project.id
      game.settings.worldProjectName = name
      const m = await createGame(name, game)
      await refresh()
      setMode({ kind: 'edit', meta: m })
      toast.success(`🌍 Mondo "${name}" importato: il gioco è in lista e pronto!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import mondo fallito')
    }
  }

  // ---------- v17: IMPORTA DA HUB ----------
  // ogni mondo creato in QUALUNQUE reparto (Mondi 3D, World Forge,
  // Crea da Script…) è un progetto: qui lo trasformi in gioco.
  const openHub = async () => {
    setHubOpen(true)
    if (hubWorlds !== null) return
    setHubLoading(true)
    try {
      const res = await fetchAuth('/api/projects')
      const data = await res.json().catch(() => ({}))
      const list: HubWorld[] = []
      for (const p of data.projects ?? []) {
        if (isGameProjectState(p.state)) continue // i giochi no, sono già qui
        let st: Record<string, unknown> | null = null
        try {
          st = typeof p.state === 'string' ? JSON.parse(p.state) : p.state
        } catch {
          continue
        }
        if (!st) continue
        const nObjects = Array.isArray(st.objects) ? st.objects.length : 0
        if (nObjects === 0 && !st.terrain && !st.vast) continue // non è un mondo
        list.push({
          id: p.id,
          name: p.name,
          updatedAt: p.updatedAt,
          hasVast: !!st.vast,
          nObjects,
        })
      }
      list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      setHubWorlds(list)
    } catch {
      setHubWorlds([])
      toast.error('Impossibile leggere i progetti dell\'hub')
    } finally {
      setHubLoading(false)
    }
  }

  const importFromHub = async (w: HubWorld) => {
    if (hubBusy) return
    setHubBusy(w.id)
    try {
      const game = newGameProject(w.name, { dimension: '3d' })
      delete (game.settings as { vast?: unknown }).vast
      game.settings.worldProjectId = w.id
      game.settings.worldProjectName = w.name
      const m = await createGame(`${w.name} (gioco)`, game)
      setHubOpen(false)
      await refresh()
      setMode({ kind: 'edit', meta: m })
      toast.success(`🌍 Il mondo "${w.name}" è ora un gioco! Modificalo e giocaci subito.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import fallito')
    } finally {
      setHubBusy(null)
    }
  }

  const remove = async (m: GameMeta) => {
    try {
      await deleteGame(m.id)
      toast.success(`"${m.name}" eliminato`)
      void refresh()
    } catch {
      toast.error('Eliminazione non riuscita')
    }
  }

  // ---------- editor / player ----------
  // v17: i giochi REALISTICI aprono il Darpx Engine Studio
  if (mode.kind === 'edit' && gameDimension(mode.meta.game) === 'real3d') {
    return (
      <RealisticStudio
        key={mode.meta.id}
        meta={mode.meta}
        onBack={() => { setMode({ kind: 'list' }); void refresh() }}
        onSaved={m => setMode({ kind: 'edit', meta: { ...m } })}
      />
    )
  }
  if (mode.kind === 'play' && gameDimension(mode.meta.game) === 'real3d') {
    return (
      <RealisticStudio
        key={'realplay' + mode.meta.id + mode.meta.game.updatedAt}
        meta={mode.meta}
        initialMode="play"
        onBack={() => { setMode({ kind: 'list' }); void refresh() }}
        onSaved={m => setMode({ kind: 'play', meta: { ...m } })}
      />
    )
  }

  if (mode.kind === 'edit') {
    return (
      <GameEditor
        key={mode.meta.id}
        meta={mode.meta}
        onBack={() => { setMode({ kind: 'list' }); void refresh() }}
        onPlay={() => setMode({ kind: 'play', meta: mode.meta })}
        onSaved={m => {
          setMode({ kind: 'edit', meta: { ...m } })
        }}
      />
    )
  }
  if (mode.kind === 'play') {
    return gameDimension(mode.meta.game) === '3d' ? (
      <GamePlayer3D
        key={'play3d' + mode.meta.id + mode.meta.game.updatedAt}
        project={mode.meta.game}
        onEdit={() => setMode({ kind: 'edit', meta: mode.meta })}
        onExit={() => { setMode({ kind: 'list' }); void refresh() }}
      />
    ) : (
      <GamePlayer
        key={'play' + mode.meta.id + mode.meta.game.updatedAt}
        project={mode.meta.game}
        onEdit={() => setMode({ kind: 'edit', meta: mode.meta })}
        onExit={() => { setMode({ kind: 'list' }); void refresh() }}
      />
    )
  }

  // ---------- lista ----------
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="neon-title text-2xl font-black tracking-wide">
            {sec.title || 'GAME STUDIO'}
          </h1>
          <p className="max-w-xl text-sm text-[var(--tx-dim)]">
            {sec.subtitle ||
              'Costruisci il tuo gioco: scena 3D con le frecce, personaggi animati, nemici, dialoghi e porte tra livelli. Provalo al volo.'}
          </p>
        </motion.div>
        <div className="flex items-center gap-2">
          <label className="cp-chip cursor-pointer hover:text-[var(--neon)]" title="Carica un gioco salvato come file .game.json">
            📂 Importa gioco
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void importFile(f)
                e.currentTarget.value = ''
              }}
            />
          </label>
          <label className="cp-chip cursor-pointer hover:text-[var(--neon)]" title="Carica un mondo da file .mondo.json (esportato dal reparto Mondi 3D)">
            🌍 Importa da file
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void importWorldFile(f)
                e.currentTarget.value = ''
              }}
            />
          </label>
          <button
            className="cp-chip cursor-pointer hover:text-[var(--neon)]"
            title="Scegli un mondo creato in qualsiasi reparto dell'hub e trasformalo in gioco"
            onClick={() => void openHub()}
          >
            🌐 Importa da Hub
          </button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]">
                <Plus className="mr-1 h-4 w-4" /> Nuovo gioco
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-[var(--tx)]">Nuovo videogioco</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {/* v17: scelta dello STILE del gioco — ora in 3 versioni */}
                <div>
                  <Label className="text-[var(--tx-dim)]">Stile del gioco</Label>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        newStyle === 'real3d'
                          ? 'border-[var(--neon)] bg-[var(--primary-soft)]'
                          : 'border-[var(--line)] hover:bg-[var(--panel-hover)]'
                      }`}
                      onClick={() => setNewStyle('real3d')}
                    >
                      <span className="block text-lg">🎬</span>
                      <span className="block text-sm font-bold text-[var(--tx)]">3D Realistico</span>
                      <span className="block text-[11px] leading-tight text-[var(--tx-dim)]">
                        Darpx Engine: PBR, luci vere, bloom. Per giochi seri, niente pixel
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        newStyle === '3d'
                          ? 'border-[var(--neon)] bg-[var(--primary-soft)]'
                          : 'border-[var(--line)] hover:bg-[var(--panel-hover)]'
                      }`}
                      onClick={() => setNewStyle('3d')}
                    >
                      <span className="block text-lg">🌍</span>
                      <span className="block text-sm font-bold text-[var(--tx)]">3D Mondo Vasto</span>
                      <span className="block text-[11px] leading-tight text-[var(--tx-dim)]">
                        Terza persona in un mondo infinito di montagne e foreste
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        newStyle === '2d'
                          ? 'border-[var(--neon)] bg-[var(--primary-soft)]'
                          : 'border-[var(--line)] hover:bg-[var(--panel-hover)]'
                      }`}
                      onClick={() => setNewStyle('2d')}
                    >
                      <span className="block text-lg">🕹️</span>
                      <span className="block text-sm font-bold text-[var(--tx)]">2D Classico</span>
                      <span className="block text-[11px] leading-tight text-[var(--tx-dim)]">
                        Il gioco a scene come sempre: tile, nemici, porte, portali
                      </span>
                    </button>
                  </div>
                </div>

                {/* v17: scelta del TEMPLATE per il realistico */}
                {newStyle === 'real3d' && (
                  <div>
                    <Label className="text-[var(--tx-dim)]">Ambiente di partenza</Label>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {REAL_TEMPLATES.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setNewTemplate(t.id)}
                          className={`rounded-lg border p-2.5 text-left transition-colors ${
                            newTemplate === t.id
                              ? 'border-[var(--neon)] bg-[var(--primary-soft)]'
                              : 'border-[var(--line)] hover:bg-[var(--panel-hover)]'
                          }`}
                          title={t.desc}
                        >
                          <span className="text-xl">{t.icon}</span>
                          <span className="mt-0.5 block text-xs font-bold text-[var(--tx)]">{t.name}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--tx-dim)]">
                      {REAL_TEMPLATES.find(t => t.id === newTemplate)?.desc} Potrai cambiarlo
                      in qualsiasi momento dal bottone <b>🏗 Template</b> dell&apos;editor.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="game-name" className="text-[var(--tx-dim)]">
                    Titolo del gioco
                  </Label>
                  <Input
                    id="game-name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder={
                      newStyle === 'real3d'
                        ? 'Es. Stazione Kepler'
                        : newStyle === '3d'
                          ? 'Es. Le Torri di Neve'
                          : 'Es. Neon Drift: Settore 7'
                    }
                    onKeyDown={e => e.key === 'Enter' && !busy && void createNew()}
                    autoFocus
                  />
                  {newStyle === '3d' && (
                    <p className="text-[11px] text-[var(--tx-dim)]">
                      🌍 Il gioco nasce con un <b>Mondo Vasto</b> di sola natura già pronto
                      (montagne, colline, foreste). Dall&apos;editor cambi stile del paesaggio
                      e tutte le opzioni con il bottone 🌍 Mondo.
                    </p>
                  )}
                  {newStyle === 'real3d' && (
                    <p className="text-[11px] text-[var(--tx-dim)]">
                      🎬 Il gioco nasce con l&apos;ambiente scelto: materiali PBR, luci vere,
                      nebbia e post-processing. Dall&apos;editor sistemi tutto (bloom, esposizione,
                      spawn) e provi il mondo in prima persona col mouse catturato.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createNew} disabled={busy} className="cp-btn">
                  {busy ? 'Creo...' : newStyle === 'real3d' ? '🎬 Crea gioco realistico' : newStyle === '3d' ? '🌍 Crea gioco 3D' : 'Crea e apri editor'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ---------- dialog IMPORTA DA HUB ---------- */}
      <Dialog open={hubOpen} onOpenChange={setHubOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[var(--tx)]">🌐 Importa un mondo dall&apos;hub</DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-[var(--tx-dim)]">
            Qui trovi <b>tutti i mondi che hai creato ovunque nell&apos;hub</b> (reparto Mondi 3D,
            World Forge, Crea da Script…). Scegline uno e diventa un gioco del Game Studio:
            potrai editarci nemici, PNG e regole, e giocarci subito.
          </p>
          {hubLoading || hubWorlds === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--tx-dim)]">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--neon)]" />
              Cerco i tuoi mondi…
            </div>
          ) : hubWorlds.length === 0 ? (
            <div className="py-6 text-center text-sm text-[var(--tx-dim)]">
              Nessun mondo trovato. Creane uno nel reparto <b className="text-[var(--neon)]">Mondi 3D</b>{' '}
              (o in World Forge) e torna qui.
            </div>
          ) : (
            <div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto pr-1">
              {hubWorlds.map(w => {
                const alreadyLinked = metas.some(m => m.game.settings.worldProjectId === w.id)
                return (
                  <div
                    key={w.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                  >
                    <span className="text-xl">🌍</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--tx)]">{w.name}</p>
                      <p className="text-[11px] text-[var(--tx-faint)]">
                        {w.nObjects} oggetti{w.hasVast ? ' · mondo vasto infinito' : ''} · modificato{' '}
                        {new Date(w.updatedAt).toLocaleString('it-IT', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                        {alreadyLinked && ' · già usato da un tuo gioco'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="cp-btn shrink-0"
                      disabled={hubBusy !== null}
                      onClick={() => void importFromHub(w)}
                    >
                      {hubBusy === w.id ? 'Importo…' : '➜ Crea gioco'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="cp-panel p-10 text-center text-sm text-[var(--tx-dim)]">
          Carico la sala macchine...
        </div>
      ) : metas.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="cp-panel cp-panel-neon flex flex-col items-center gap-3 py-14 text-center">
            <motion.span
              className="text-6xl"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              🎬
            </motion.span>
            <p className="text-lg font-semibold text-[var(--tx)]">
              Nessun gioco in produzione
            </p>
            <p className="max-w-md text-sm text-[var(--tx-dim)]">
              Crea il tuo primo gioco col <b className="text-[var(--neon)]">Darpx Engine realistico</b>{' '}
              (o 3D/2D classico) da <b className="text-[var(--neon)]">Nuovo gioco</b>,{' '}
              importa un mondo con <b className="text-[var(--neon)]">🌐 Importa da Hub</b>,{' '}
              oppure genera tutto da uno script col reparto{' '}
              <b className="text-[var(--neon)]">Crea da Script</b>.
            </p>
            <Button
              className="cp-btn mt-1 bg-[var(--neon)] font-bold text-[#04060d]"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1 h-4 w-4" /> Crea il primo gioco
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metas.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -4 }}
            >
              <div className="cp-panel flex h-full flex-col justify-between p-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <Gamepad2 className="h-4 w-4 text-[var(--neon)]" />
                    <span className="truncate font-semibold text-[var(--tx)]">{m.name}</span>
                    {gameDimension(m.game) === 'real3d' && (
                      <span className="cp-chip shrink-0 text-[10px]">🎬 REALISTICO</span>
                    )}
                    {gameDimension(m.game) === '3d' && (
                      <span className="cp-chip shrink-0 text-[10px]">🌍 3D</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--tx-faint)]">
                    {gameDimension(m.game) === 'real3d'
                      ? `Darpx Engine · ${m.game.settings.realWorld?.objects.length ?? 0} oggetti · spawn pronto`
                      : gameDimension(m.game) === '3d'
                        ? `mondo: ${m.game.settings.worldProjectName ?? '—'} · ${m.game.settings.camera === 'prima' ? 'prima persona' : 'terza persona'} · `
                        : ''}
                    {gameDimension(m.game) !== 'real3d' && (
                      <>
                        {m.game.scenes.reduce((n, s) => n + s.entities.filter(e => e.type === 'enemy').length, 0)} nemici ·{' '}
                        {m.game.settings.weapon === 'blaster' ? 'blaster' : 'spada'} ·{' '}
                        {PALETTE_NAME(m.game.settings.paletteId)}
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--tx-faint)]">
                    Modificato{' '}
                    {new Date(m.updatedAt).toLocaleString('it-IT', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="cp-btn flex-1"
                    onClick={() => setMode({ kind: 'play', meta: m })}
                  >
                    <Play className="mr-1 h-3.5 w-3.5" /> Gioca
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="cp-btn"
                    title="Editor"
                    onClick={() => setMode({ kind: 'edit', meta: m })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="cp-btn text-red-400"
                    title="Elimina"
                    onClick={() => void remove(m)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}

          {/* rettangolo con il + : crea un nuovo gioco (come in Dashboard) */}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: metas.length * 0.05 }}
            whileHover={{ y: -4 }}
            onClick={() => setCreateOpen(true)}
            className="cp-panel flex min-h-[150px] w-full flex-col items-center justify-center gap-2 border border-dashed border-[var(--line-strong)] p-5 text-center transition-colors hover:border-[var(--neon)]"
            title="Crea un nuovo videogioco"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)]">
              <Plus className="h-6 w-6 text-[var(--neon)]" />
            </span>
            <span className="font-bold text-[var(--tx)]">Crea un nuovo gioco</span>
            <span className="max-w-xs text-xs text-[var(--tx-dim)]">
              Parti dal corridoio spaziale o dalla cattedrale sacra col Darpx Engine,
              oppure costruisci mondi vasti e giochi 2D.
            </span>
          </motion.button>
        </div>
      )}

      {metas.length > 0 && (
        <p className="mt-6 flex items-center gap-2 text-xs text-[var(--tx-faint)]">
          <Wand2 className="h-3.5 w-3.5 text-[var(--neon-2)]" />
          Vuoi un gioco pronto in un click? Vai al reparto{' '}
          <button
            className="neon-text underline"
            onClick={() => useUI.getState().setTab('creagame')}
          >
            Crea da Script
          </button>
        </p>
      )}
    </div>
  )
}

function PALETTE_NAME(id: string): string {
  const names: Record<string, string> = {
    cyber: 'Città Neon',
    fantasy: 'Regno di Pietra',
    horror: 'Zona Morta',
    spazio: 'Pianeta Alieno',
    deserto: 'Rovine nel Deserto',
  }
  return names[id] ?? id
}
