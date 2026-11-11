'use client'

// ============================================================
// REPARTO: GAME STUDIO — "costruisci videogiochi veri"
// Lista dei giochi dell'utente + accesso a editor e player.
// I giochi sono progetti nel DB (marker kind:'game2d').
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
  listGames,
  type GameMeta,
} from '@/lib/game2d/persist'
import { newGameProject, gameDimension } from '@/lib/game2d/types'
import { fetchAuth } from '@/lib/http'
import GameEditor from '@/components/studio/GameEditor'
import GamePlayer from '@/components/studio/GamePlayer'
import GamePlayer3D from '@/components/studio/GamePlayer3D'
import { useUI } from '@/lib/ui-store'
import { sectionOf } from '@/lib/ui-store'

type Mode = { kind: 'list' } | { kind: 'edit'; meta: GameMeta } | { kind: 'play'; meta: GameMeta }

export default function GameStudio() {
  const site = useUI(s => s.site)
  const sec = sectionOf(site.sections, 'gamestudio')
  const [metas, setMetas] = useState<GameMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStyle, setNewStyle] = useState<'2d' | '3d'>('3d') // v14: stile del gioco
  const [busy, setBusy] = useState(false)

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
      const game = newGameProject(name, { dimension: newStyle })
      const m = await createGame(name, game)
      setCreateOpen(false)
      setNewName('')
      setMode({ kind: 'edit', meta: m })
      toast.success(
        newStyle === '3d'
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

  // v17: importa un MONDO (file .mondo.json esportato dal reparto Mondi 3D):
  // lo crea come progetto e lo trovi in Mondi 3D e nel selettore Mondo dell'editor
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
      toast.success(`🌍 Mondo "${name}" importato! Lo trovi in Mondi 3D e nel selettore Mondo dell'editor.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import mondo fallito')
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
            🌍 Importa mondo
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
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]">
                <Plus className="mr-1 h-4 w-4" /> Nuovo gioco
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-[var(--tx)]">Nuovo videogioco</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                {/* v14: scelta dello STILE del gioco */}
                <div>
                  <Label className="text-[var(--tx-dim)]">Stile del gioco</Label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
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
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="game-name" className="text-[var(--tx-dim)]">
                    Titolo del gioco
                  </Label>
                  <Input
                    id="game-name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder={newStyle === '3d' ? 'Es. Le Torri di Neve' : 'Es. Neon Drift: Settore 7'}
                    onKeyDown={e => e.key === 'Enter' && !busy && void createNew()}
                    autoFocus
                  />
                  {newStyle === '3d' && (
                    <p className="text-[11px] text-[var(--tx-dim)]">
                      🌍 Il gioco nasce con un <b>Mondo Vasto</b> di sola natura già pronto
                      (montagne, colline, foreste). Dall'editor cambi stile del paesaggio
                      e tutte le opzioni con il bottone 🌍 Mondo.
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createNew} disabled={busy} className="cp-btn">
                  {busy ? 'Creo...' : newStyle === '3d' ? '🌍 Crea gioco 3D' : 'Crea e apri editor'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
              🕹️
            </motion.span>
            <p className="text-lg font-semibold text-[var(--tx)]">
              Nessun gioco in produzione
            </p>
            <p className="max-w-md text-sm text-[var(--tx-dim)]">
              Crea il tuo primo gioco da <b className="text-[var(--neon)]">Nuovo gioco</b>,{' '}
              oppure genera un gioco completo da uno script con il reparto{' '}
              <b className="text-[var(--neon)]">Crea da Script</b> e poi perfezionalo qui.
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
                    {gameDimension(m.game) === '3d' && (
                      <span className="cp-chip shrink-0 text-[10px]">🌍 3D</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--tx-faint)]">
                    {gameDimension(m.game) === '3d'
                      ? `mondo: ${m.game.settings.worldProjectName ?? '—'} · ${m.game.settings.camera === 'prima' ? 'prima persona' : 'terza persona'} · `
                      : ''}
                    {m.game.scenes.reduce((n, s) => n + s.entities.filter(e => e.type === 'enemy').length, 0)} nemici ·{' '}
                    {m.game.settings.weapon === 'blaster' ? 'blaster' : 'spada'} ·{' '}
                    {PALETTE_NAME(m.game.settings.paletteId)}
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
              Costruisci il mondo, piazza nemici e boss, scegli il personaggio
              tra i tuoi modelli GLB e trasforma tutto in un videogioco giocabile.
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
