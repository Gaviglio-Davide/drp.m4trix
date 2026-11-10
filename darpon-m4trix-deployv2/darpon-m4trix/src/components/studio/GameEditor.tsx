'use client'

// ============================================================
// GAME EDITOR — il reparto di costruzione giochi:
//  - lista scene (livelli) con aggiunta/rinomina/duplicazione
//  - pittura tilemap (pavimento, muri, acqua, lava, porte...)
//  - piazzamento entità: nemici, boss, NPC con dialoghi,
//    oggetti, casse, porte con destinazione, portale obiettivo
//  - ispettore proprietà dell'entità selezionata
//  - impostazioni globali di gioco (arma, HP, difficoltà...)
//  - autosave sul DB + esporta JSON
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  ACTION_DEFS,
  defaultActionButtons,
  PALETTES,
  eid,
  type ActionButton,
  type EntityKind,
  type EntityType,
  type GameEntity,
  type GameProject,
  type GameScene,
  type PaletteId,
} from '@/lib/game2d/types'
import { TILES, TILE_SWATCH } from '@/lib/game2d/tiles'
import { VAST_BIOMES, VAST_DEFAULT, VAST_TOD_LABEL, type VastConfig, type VastTod } from '@/lib/vastworld'
import { drawKind } from '@/lib/game2d/sprites'
import { exportGameFile, isGameProjectState, saveGame, type GameMeta } from '@/lib/game2d/persist'
import { fetchAuth } from '@/lib/http'
import dynamic from 'next/dynamic'

// v13: HUB STORIA (storia, personaggi, dialoghi, oggetti, abilità, magie...)
const RpgEditors = dynamic(() => import('@/components/studio/RpgEditors'), { ssr: false })
// v15: reparto Animazioni & Interazioni
const AnimEditors = dynamic(() => import('@/components/studio/AnimEditors'), { ssr: false })
// v16: SCENA 3D — editor in 3D vero con le frecce rosse/verdi/blu
const SceneEditor3D = dynamic(() => import('@/components/studio/SceneEditor3D'), { ssr: false })

type Tool = 'tiles' | 'entita' | 'select'
// v16: le sezioni ordinate del Game Editor 3D
type Section3d = 'hub' | 'scena' | 'mappa' | 'regole'

type WorldChoice = { id: string; name: string; updatedAt: string }

const TILE_LIST = [0, 1, 2, 3, 4, 5, 6, 7, 8]

const ENTITY_PALETTE: { type: EntityType; kind?: EntityKind; label: string; color: string }[] = [
  { type: 'player', label: '★ Start Eroe', color: '#00f0ff' },
  { type: 'enemy', kind: 'drone', label: 'Drone', color: '#00f0ff' },
  { type: 'enemy', kind: 'soldato', label: 'Soldato', color: '#ff5a8a' },
  { type: 'enemy', kind: 'zombie', label: 'Zombie', color: '#7cffb2' },
  { type: 'enemy', kind: 'slime', label: 'Slime', color: '#a3ff12' },
  { type: 'enemy', kind: 'guardiano', label: 'Guardiano', color: '#b26bff' },
  { type: 'enemy', kind: 'golem', label: 'Golem', color: '#ffb43a' },
  { type: 'enemy', kind: 'ratto', label: 'Ratto', color: '#cd9663' },
  { type: 'enemy', kind: 'turret', label: 'Torretta', color: '#ff3355' },
  { type: 'enemy', kind: 'boss', label: 'BOSS', color: '#ff2bd6' },
  { type: 'npc', label: 'NPC (dialogo)', color: '#fcee0a' },
  { type: 'item', kind: 'moneta', label: 'Moneta', color: '#fcee0a' },
  { type: 'item', kind: 'pozione', label: 'Pozione', color: '#7cffb2' },
  { type: 'item', kind: 'chiave', label: 'Chiave', color: '#00f0ff' },
  { type: 'item', kind: 'cassa', label: 'Cassa', color: '#e8c35a' },
  { type: 'door', label: 'Porta → scena', color: '#00f0ff' },
  { type: 'goal', label: 'Portale obiettivo', color: '#fcee0a' },
  { type: 'deco', kind: 'albero', label: 'Albero', color: '#1a4028' },
  { type: 'deco', kind: 'barile', label: 'Barile', color: '#35404e' },
  { type: 'deco', kind: 'neon', label: 'Insegna neon', color: '#ff2bd6' },
  { type: 'deco', kind: 'lanterna', label: 'Lanterna', color: '#ffd28a' },
]

type Props = {
  meta: GameMeta
  onBack: () => void
  onPlay: () => void
  onSaved: (m: GameMeta) => void
}

export default function GameEditor({ meta, onBack, onPlay, onSaved }: Props) {
  const [project, setProject] = useState<GameProject>(() =>
    JSON.parse(JSON.stringify(meta.game))
  )
  const is3D = project.settings.dimension === '3d'
  const [sceneId, setSceneId] = useState<string>(
    () => meta.game.startScene ?? meta.game.scenes[0].id
  )
  const [tool, setTool] = useState<Tool>(
    () => (meta.game.settings.dimension === '3d' ? 'entita' : 'tiles')
  )
  const [tile, setTile] = useState(1)
  const [entIdx, setEntIdx] = useState(0)
  const [brush, setBrush] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'ok' | 'saving'>('ok')
  const [showRpg, setShowRpg] = useState(false) // v13: hub RPG
  const [showWorld, setShowWorld] = useState(false) // v14: stile mondo vasto del gioco
  const [showAnim, setShowAnim] = useState(false) // v15: animazioni & interazioni
  const [section, setSection] = useState<Section3d>('hub') // v16: sezioni ordinate (3D)
  const [showKeys, setShowKeys] = useState(false) // v16: editor tasti azione
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const painting = useRef(false)
  const viewRef = useRef({ T: 20, ox: 0, oy: 0 })

  const scene = project.scenes.find(s => s.id === sceneId) ?? project.scenes[0]
  const pal = PALETTES[project.settings.paletteId] ?? PALETTES.cyber
  const selected = scene?.entities.find(e => e.id === selectedId) ?? null

  // ---------- mutazioni + autosave ----------
  const mutate = useCallback((fn: (p: GameProject) => void) => {
    setProject(prev => {
      const q: GameProject = JSON.parse(JSON.stringify(prev))
      fn(q)
      return q
    })
    setDirty(true)
  }, [])

  useEffect(() => {
    if (!dirty) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        const m = await saveGame(meta.id, project)
        onSaved(m)
        setDirty(false)
        setSaveState('ok')
      } catch {
        toast.error('Salvataggio fallito: riprovo al prossimo cambiamento')
      }
    }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, dirty])

  // ---------- disegno editor ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    if (canvas.width !== Math.round(cw * dpr)) {
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const T = Math.max(6, Math.floor(Math.min(cw / scene.w, ch / scene.h)))
    const ox = Math.floor((cw - T * scene.w) / 2)
    const oy = Math.floor((ch - T * scene.h) / 2)
    viewRef.current = { T, ox, oy }

    ctx.fillStyle = pal.bg
    ctx.fillRect(0, 0, cw, ch)

    // tile
    for (let y = 0; y < scene.h; y++) {
      for (let x = 0; x < scene.w; x++) {
        const t = scene.tiles[y * scene.w + x]
        const px = ox + x * T
        const py = oy + y * T
        switch (t) {
          case 1:
            ctx.fillStyle = pal.wall
            ctx.fillRect(px, py, T, T)
            ctx.fillStyle = pal.wallTop
            ctx.fillRect(px, py, T, Math.max(2, T * 0.3))
            break
          case 2:
            ctx.fillStyle = pal.water
            ctx.fillRect(px, py, T, T)
            break
          case 3:
            ctx.fillStyle = pal.lava
            ctx.fillRect(px, py, T, T)
            ctx.globalAlpha = 0.5
            ctx.fillStyle = pal.lavaGlow
            ctx.fillRect(px + 1, py + 1, T - 2, T - 2)
            ctx.globalAlpha = 1
            break
          case 4:
            ctx.fillStyle = pal.grass
            ctx.fillRect(px, py, T, T)
            break
          case 5:
            ctx.fillStyle = pal.road
            ctx.fillRect(px, py, T, T)
            break
          case 6:
            ctx.fillStyle = pal.doorLocked
            ctx.fillRect(px + 1, py + 1, T - 2, T - 2)
            break
          case 7:
            ctx.fillStyle = pal.road
            ctx.fillRect(px, py, T, T)
            ctx.strokeStyle = pal.door
            ctx.strokeRect(px + 1.5, py + 1.5, T - 3, T - 3)
            break
          case 8:
            ctx.fillStyle = '#000'
            ctx.fillRect(px, py, T, T)
            break
          default:
            ctx.fillStyle = (x + y) % 2 === 0 ? pal.floor : pal.floorAlt
            ctx.fillRect(px, py, T, T)
        }
      }
    }

    // griglia
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let x = 0; x <= scene.w; x++) {
      ctx.beginPath()
      ctx.moveTo(ox + x * T, oy)
      ctx.lineTo(ox + x * T, oy + scene.h * T)
      ctx.stroke()
    }
    for (let y = 0; y <= scene.h; y++) {
      ctx.beginPath()
      ctx.moveTo(ox, oy + y * T)
      ctx.lineTo(ox + scene.w * T, oy + y * T)
      ctx.stroke()
    }

    // entità
    for (const e of scene.entities) {
      const cx = ox + e.x * T + T / 2
      const cy = oy + e.y * T + T / 2
      const color =
        e.type === 'player'
          ? e.props.color ?? pal.neon
          : e.props.color ??
            ENTITY_PALETTE.find(p => p.type === e.type && p.kind === e.props.kind)?.color ??
            pal.neon
      if (e.type === 'door') {
        ctx.globalAlpha = 0.4
        ctx.fillStyle = e.props.locked ? pal.doorLocked : pal.door
        ctx.beginPath()
        ctx.ellipse(cx, cy, T * 0.4, T * 0.46, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      } else if (e.type === 'goal') {
        ctx.strokeStyle = pal.goal
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, T * 0.3, T * 0.4, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.save()
      ctx.translate(cx, cy)
      const k: EntityKind | undefined =
        e.props.kind ?? (e.type === 'player' ? 'player' : e.type === 'npc' ? 'npc' : undefined)
      drawKind(ctx, k, T * 0.72, color, 1.2)
      ctx.restore()
      if (e.id === selectedId) {
        ctx.strokeStyle = pal.neon
        ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.strokeRect(ox + e.x * T + 1, oy + e.y * T + 1, T - 2, T - 2)
        ctx.setLineDash([])
      }
    }

    // hover
    if (hover) {
      const size = tool === 'tiles' ? brush : 1
      ctx.strokeStyle = pal.neon
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1.5
      ctx.strokeRect(
        ox + (hover.x - Math.floor((size - 1) / 2)) * T,
        oy + (hover.y - Math.floor((size - 1) / 2)) * T,
        T * size,
        T * size
      )
      ctx.globalAlpha = 1
    }
  }, [scene, pal, hover, tool, brush, selectedId])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [draw])

  // ---------- interazione canvas ----------

  const cellFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const { T, ox, oy } = viewRef.current
    const x = Math.floor((e.clientX - rect.left - ox) / T)
    const y = Math.floor((e.clientY - rect.top - oy) / T)
    if (x < 0 || y < 0 || x >= scene.w || y >= scene.h) return null
    return { x, y }
  }

  const paintTile = (x: number, y: number) => {
    const size = brush
    const dx0 = x - Math.floor((size - 1) / 2)
    mutate(p => {
      const sc = p.scenes.find(s => s.id === sceneId)!
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const tx = dx0 + dx
          const ty = y - Math.floor((size - 1) / 2) + dy
          if (tx < 0 || ty < 0 || tx >= sc.w || ty >= sc.h) continue
          sc.tiles[ty * sc.w + tx] = tile
        }
    })
  }

  const placeEntity = (x: number, y: number) => {
    const def = ENTITY_PALETTE[entIdx]
    mutate(p => {
      const sc = p.scenes.find(s => s.id === sceneId)!
      if (def.type === 'player') {
        // un solo punto di partenza: lo sposta
        const old = sc.entities.find(e => e.type === 'player')
        if (old) {
          old.x = x
          old.y = y
        } else {
          sc.entities.push({ id: eid(), type: 'player', x, y, props: { name: 'Eroe', color: pal.neon } })
        }
        return
      }
      sc.entities.push({
        id: eid(),
        type: def.type,
        x,
        y,
        props: defaultProps(def.type, def.kind, pal.id),
      })
    })
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    const c = cellFromEvent(e)
    if (!c) return
    if (e.button === 2) {
      // destro: cancella entità sotto
      const hit = entityAt(c.x, c.y)
      if (hit)
        mutate(p => {
          const sc = p.scenes.find(s => s.id === sceneId)!
          sc.entities = sc.entities.filter(x2 => x2.id !== hit.id)
        })
      return
    }
    if (tool === 'tiles') {
      painting.current = true
      paintTile(c.x, c.y)
    } else if (tool === 'entita') {
      placeEntity(c.x, c.y)
    } else {
      const hit = entityAt(c.x, c.y)
      setSelectedId(hit?.id ?? null)
    }
  }

  const entityAt = (x: number, y: number): GameEntity | null => {
    let best: GameEntity | null = null
    let bd = 0.7
    for (const e of scene.entities) {
      const d = Math.hypot(e.x - x, e.y - y)
      if (d < bd) {
        bd = d
        best = e
      }
    }
    return best
  }

  // tasti rapidi
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedId) {
        mutate(p => {
          const sc = p.scenes.find(s => s.id === sceneId)!
          sc.entities = sc.entities.filter(x2 => x2.id !== selectedId)
        })
        setSelectedId(null)
      }
      if (e.code === 'Digit1' && !is3D) setTool('tiles')
      if (e.code === 'Digit2') setTool('entita')
      if (e.code === 'Digit3') setTool('select')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, sceneId, is3D])

  // lista mondi 3D per cambiare il mondo dei giochi 3D
  const [worlds, setWorlds] = useState<WorldChoice[] | null>(null)
  useEffect(() => {
    if (!is3D || worlds) return
    ;(async () => {
      try {
        const res = await fetchAuth('/api/projects')
        const data = await res.json().catch(() => ({}))
        const list: WorldChoice[] = (data.projects ?? [])
          .filter((p: { state?: string }) => !isGameProjectState(p.state))
          .map((p: { id: string; name: string; updatedAt: string }) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
        list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        setWorlds(list)
      } catch {
        setWorlds([])
      }
    })()
  }, [is3D, worlds])

  // elenco Progetti importati (per scegliere il personaggio principale)
  const [models, setModels] = useState<{ id: string; name: string; url: string }[]>([])
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetchAuth('/api/models')
        const data = await res.json().catch(() => ({}))
        setModels(data.models ?? [])
      } catch {
        setModels([])
      }
    })()
  }, [])

  // ---------- scene ----------
  const addScene = () => {
    mutate(p => {
      const n = p.scenes.length + 1
      const w = scene.w
      const h = scene.h
      const tiles = new Array(w * h).fill(0)
      for (let x = 0; x < w; x++) {
        tiles[x] = 1
        tiles[(h - 1) * w + x] = 1
      }
      for (let y = 0; y < h; y++) {
        tiles[y * w] = 1
        tiles[y * w + w - 1] = 1
      }
      p.scenes.push({ id: eid(), name: `Livello ${n}`, w, h, tiles, entities: [] })
    })
  }
  const duplicateScene = () => {
    mutate(p => {
      const src = p.scenes.find(s => s.id === sceneId)!
      const copy: GameScene = JSON.parse(JSON.stringify(src))
      copy.id = eid()
      copy.name = `${src.name} copia`
      copy.entities = copy.entities.map(e => ({ ...e, id: eid() }))
      p.scenes.push(copy)
    })
  }
  const deleteScene = (id: string) => {
    if (project.scenes.length <= 1) {
      toast.error('Il gioco deve avere almeno una scena')
      return
    }
    mutate(p => {
      p.scenes = p.scenes.filter(s => s.id !== id)
      if (p.startScene === id) p.startScene = p.scenes[0].id
    })
    if (sceneId === id) setSceneId(project.scenes.find(s => s.id !== id)!.id)
  }
  const setStartScene = (id: string) => mutate(p => { p.startScene = id })

  // ---------- rendering ----------

  // ---- blocco REGOLE GLOBALI (impostazioni del gioco) ----
  const settingsPanel = (
    <div className="mt-2 border-t border-[var(--line)] pt-3">
      <span className="neon-text font-[family-name:var(--font-display)] text-[11px] font-bold tracking-[0.18em] uppercase">
        Impostazioni gioco
      </span>
      <div className="mt-2 flex flex-col gap-2 text-xs">
        <Field label="Personaggio principale">
          <select
            className="h-7 w-full bg-[var(--panel-soft)] px-1 ring-1 ring-[var(--line)]"
            value={project.settings.playerModelUrl ?? ''}
            onChange={e => {
              const m = models.find(x => x.url === e.target.value)
              mutate(p => {
                p.settings.playerModelUrl = m?.url ?? null
                p.settings.playerModelName = m?.name ?? null
              })
            }}
          >
            <option value="">Eroe classico (quadratino neon)</option>
            {models.map(m => (
              <option key={m.id} value={m.url}>
                🧊 {m.name}
              </option>
            ))}
          </select>
        </Field>
        {models.length === 0 && (
          <p className="text-[10px] leading-relaxed text-[var(--tx-faint)]">
            Carica un modello nella sezione «Progetti importati» (o
            prendilo dal Catalogo 3D) e lo scegli qui come eroe.
          </p>
        )}
        <p className="text-[10px] leading-relaxed text-[var(--tx-faint)]">
          Nei giochi <b>3D</b> il modello GLB scelto diventa davvero il
          tuo personaggio in campo; nei giochi <b>2D</b> vedi il suo nome
          sopra l&apos;eroe. Nella <b>Scena 3D</b> scegli anche le sue animazioni.
        </p>
        <Field label={`HP eroe: ${project.settings.playerHp}`}>
          <input
            type="range" min={30} max={300} step={10}
            value={project.settings.playerHp}
            onChange={e => mutate(p => { p.settings.playerHp = Number(e.target.value) })}
            className="w-full accent-[var(--neon)]"
          />
        </Field>
        <Field label={`Danno eroe: ${project.settings.playerDmg}`}>
          <input
            type="range" min={5} max={120} step={5}
            value={project.settings.playerDmg}
            onChange={e => mutate(p => { p.settings.playerDmg = Number(e.target.value) })}
            className="w-full accent-[var(--neon)]"
          />
        </Field>
        {project.settings.objective === 'collezione' && (
          <Field label={`Chiavi richieste: ${project.settings.objectiveCount}`}>
            <input
              type="range" min={1} max={6}
              value={project.settings.objectiveCount}
              onChange={e => mutate(p => { p.settings.objectiveCount = Number(e.target.value) })}
              className="w-full accent-[var(--neon)]"
            />
          </Field>
        )}
        <Field label="Intro (una frase per riga, mostrata all'avvio)">
          <textarea
            className="min-h-16 w-full bg-[var(--panel-soft)] p-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
            value={(project.settings.intro ?? []).join('\n')}
            onChange={e => mutate(p => { p.settings.intro = e.target.value.split('\n').filter(Boolean) })}
          />
        </Field>
        <label className="flex items-center gap-2 text-[var(--tx-dim)]">
          <input
            type="checkbox"
            checked={project.settings.weapon === 'blaster'}
            onChange={e => mutate(p => { p.settings.weapon = e.target.checked ? 'blaster' : 'spada' })}
            className="accent-[var(--neon)]"
          />
          Arma da fuoco (blaster)
        </label>
        <Field label={`Velocità eroe: ${(project.settings.playerSpeed ?? 1).toFixed(1)}×`}>
          <input
            type="range" min={0.5} max={2} step={0.1}
            value={project.settings.playerSpeed ?? 1}
            onChange={e => mutate(p => { p.settings.playerSpeed = Number(e.target.value) })}
            className="w-full accent-[var(--neon)]"
          />
        </Field>
        <Field label={`Velocità nemici: ${(project.settings.enemySpeed ?? 1).toFixed(1)}×`}>
          <input
            type="range" min={0.5} max={2} step={0.1}
            value={project.settings.enemySpeed ?? 1}
            onChange={e => mutate(p => { p.settings.enemySpeed = Number(e.target.value) })}
            className="w-full accent-[var(--neon)]"
          />
        </Field>
        <label className="flex items-center gap-2 text-[var(--tx-dim)]">
          <input
            type="checkbox"
            checked={!!project.settings.minimapOn}
            onChange={e => mutate(p => { p.settings.minimapOn = e.target.checked })}
            className="accent-[var(--neon)]"
          />
          Minimappa durante il gioco 🗺
        </label>
        <label className="flex items-center gap-2 text-[var(--tx-dim)]">
          <input
            type="checkbox"
            checked={project.settings.fogOn !== false}
            onChange={e => mutate(p => { p.settings.fogOn = e.target.checked })}
            className="accent-[var(--neon)]"
          />
          Nebbia atmosfera ai bordi
        </label>
        <label className="flex items-center gap-2 text-[var(--tx-dim)]">
          <input
            type="checkbox"
            checked={project.settings.showEnemyHp !== false}
            onChange={e => mutate(p => { p.settings.showEnemyHp = e.target.checked })}
            className="accent-[var(--neon)]"
          />
          Barre HP sopra i nemici
        </label>
      </div>
    </div>
  )

  // ---- blocco MAPPA (lista scene + canvas + ispettore) ----
  const mapEditor = (
    <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-[210px_1fr_260px]">
      {/* ------ colonna scene ------ */}
      <div className="cp-panel flex flex-col p-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="neon-text font-[family-name:var(--font-display)] text-[11px] font-bold tracking-[0.18em] uppercase">
            Scene
          </span>
          <button onClick={addScene} className="cp-chip hover:text-[var(--neon)]">+ nuova</button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {project.scenes.map(s => (
            <div
              key={s.id}
              className={`group flex cursor-pointer items-center gap-1 px-2 py-1.5 text-xs ring-1 ${
                s.id === sceneId
                  ? 'bg-[var(--primary-soft)] text-[var(--tx)] ring-[var(--neon)]'
                  : 'text-[var(--tx-dim)] ring-transparent hover:ring-[var(--line)]'
              }`}
              onClick={() => setSceneId(s.id)}
            >
              {project.startScene === s.id ? (
                <span className="text-[var(--neon)]" title="Scena iniziale">★</span>
              ) : (
                <button
                  className="text-[var(--tx-faint)] hover:text-[var(--neon)]"
                  title="Imposta come scena iniziale"
                  onClick={ev => { ev.stopPropagation(); setStartScene(s.id) }}
                >
                  ☆
                </button>
              )}
              <input
                value={s.name}
                onChange={ev => mutate(p2 => {
                  const sc = p2.scenes.find(x => x.id === s.id)!
                  sc.name = ev.target.value
                })}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              <button
                className="hidden text-[var(--tx-faint)] hover:text-[var(--neon)] group-hover:block"
                title="Duplica"
                onClick={ev => { ev.stopPropagation(); setSceneId(s.id); duplicateScene() }}
              >
                ⧉
              </button>
              <button
                className="hidden text-[var(--tx-faint)] hover:text-red-400 group-hover:block"
                title="Elimina"
                onClick={ev => { ev.stopPropagation(); deleteScene(s.id) }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-[var(--line)] pt-2 text-[10px] leading-relaxed text-[var(--tx-faint)]">
          <p><b className="text-[var(--neon)]">1/2/3</b> cambia strumento</p>
          <p><b className="text-[var(--neon)]">clic dx</b> cancella entità</p>
          <p><b className="text-[var(--neon)]">CANC</b> elimina selezionata</p>
          {is3D ? (
            <p className="mt-1">Mappa di missione: {scene.w}×{scene.h} → mondo 3D</p>
          ) : (
            <p className="mt-1">Scena: {scene.w}×{scene.h} tile</p>
          )}
        </div>
      </div>

      {/* ------ canvas centrale ------ */}
      <div className="flex min-w-0 flex-col gap-2">
        {/* strumenti */}
        <div className="cp-panel flex flex-wrap items-center gap-1.5 p-2">
          {!is3D && (
            <button
              onClick={() => setTool('tiles')}
              className={`cp-chip ${tool === 'tiles' ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
            >
              ▦ Tile
            </button>
          )}
          <button
            onClick={() => setTool('entita')}
            className={`cp-chip ${tool === 'entita' ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
          >
            ◈ Entità
          </button>
          <button
            onClick={() => setTool('select')}
            className={`cp-chip ${tool === 'select' ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
          >
            ⌖ Seleziona
          </button>
          {tool === 'tiles' && !is3D && (
            <>
              <span className="mx-1 h-5 w-px bg-[var(--line)]" />
              {[1, 2, 3].map(b => (
                <button
                  key={b}
                  onClick={() => setBrush(b)}
                  className={`cp-chip ${brush === b ? 'cp-chip-active' : ''}`}
                  title={`Pennello ${b}×${b}`}
                >
                  {b}×{b}
                </button>
              ))}
            </>
          )}
          <span className="ml-auto text-[10px] text-[var(--tx-faint)]">
            {is3D
              ? 'Piazza nemici e oggetti: compariranno nel mondo 3D'
              : tool === 'tiles'
                ? 'Dipingi il terreno'
                : tool === 'entita'
                  ? 'Clicca per piazzare'
                  : "Clicca un'entità per modificarla"}
          </span>
        </div>

        {/* palette tile o entità */}
        <div className="cp-panel flex items-center gap-1.5 overflow-x-auto p-2">
          {tool === 'tiles' && !is3D ? (
            TILE_LIST.map(t => (
              <button
                key={t}
                onClick={() => setTile(t)}
                title={TILES[t].name}
                className={`h-8 w-8 shrink-0 ring-2 ${tile === t ? 'ring-[var(--neon)]' : 'ring-[var(--line)]'}`}
                style={{ background: TILE_SWATCH[t] }}
              />
            ))
          ) : tool === 'entita' ? (
            ENTITY_PALETTE.map((d, i) => (
              <button
                key={`${d.type}-${d.kind ?? ''}`}
                onClick={() => setEntIdx(i)}
                className={`flex shrink-0 items-center gap-1 px-2 py-1 text-[11px] ring-1 ${
                  entIdx === i
                    ? 'bg-[var(--primary-soft)] text-[var(--tx)] ring-[var(--neon)]'
                    : 'text-[var(--tx-dim)] ring-[var(--line)]'
                }`}
              >
                <span className="inline-block h-2.5 w-2.5" style={{ background: d.color }} />
                {d.label}
              </button>
            ))
          ) : (
            <span className="px-2 text-[11px] text-[var(--tx-faint)]">
              Clicca un&apos;entità nella mappa per aprirla nell&apos;ispettore →
            </span>
          )}
        </div>

        {/* mappa */}
        <div className="cp-panel relative min-h-[320px] flex-1 overflow-hidden">
          {is3D && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2">
              <span className="cp-chip bg-[var(--panel)]">
                🌍 {project.settings.worldProjectName ?? 'nessun mondo'} · la mappa decide DOVE compaiono nemici e oggetti nel mondo 3D
              </span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={e => {
              const c = cellFromEvent(e)
              setHover(c)
              if (painting.current && c && tool === 'tiles') paintTile(c.x, c.y)
            }}
            onPointerUp={() => { painting.current = false }}
            onPointerLeave={() => { painting.current = false; setHover(null) }}
            onContextMenu={e => e.preventDefault()}
          />
        </div>
      </div>

      {/* ------ ispettore ------ */}
      <div className="cp-panel flex flex-col gap-3 overflow-y-auto p-2.5">
        <span className="neon-text font-[family-name:var(--font-display)] text-[11px] font-bold tracking-[0.18em] uppercase">
          Ispettore
        </span>

        {selected ? (
          <div className="flex flex-col gap-2 text-xs">
            <div className="cp-chip cp-chip-active w-fit">
              {selected.type === 'enemy' && selected.props.kind === 'boss' ? 'BOSS' : selected.type.toUpperCase()}
            </div>
            {/* campi comuni */}
            <Field label="Nome">
              <Input
                className="h-7 bg-[var(--panel-soft)] text-xs"
                value={selected.props.name ?? ''}
                onChange={e => updateSel(prop => { prop.name = e.target.value })}
              />
            </Field>
            {(selected.type === 'enemy' || selected.type === 'player') && (
              <>
                {selected.type === 'enemy' && (
                  <Field label="Tipo nemico">
                    <select
                      className="h-7 w-full bg-[var(--panel-soft)] px-1 ring-1 ring-[var(--line)]"
                      value={selected.props.kind ?? 'soldato'}
                      onChange={e => updateSel(prop => { prop.kind = e.target.value as EntityKind })}
                    >
                      {['drone', 'soldato', 'zombie', 'slime', 'guardiano', 'golem', 'ratto', 'turret', 'boss'].map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label={`HP: ${selected.props.hp ?? 'auto'}`}>
                  <input
                    type="range" min={10} max={500} step={10}
                    value={selected.props.hp ?? (selected.props.kind === 'boss' ? 300 : 60)}
                    onChange={e => updateSel(prop => { prop.hp = Number(e.target.value) })}
                    className="w-full accent-[var(--neon)]"
                  />
                </Field>
                <Field label={`Danno: ${selected.props.dmg ?? 'auto'}`}>
                  <input
                    type="range" min={2} max={60} step={2}
                    value={selected.props.dmg ?? (selected.props.kind === 'boss' ? 26 : 12)}
                    onChange={e => updateSel(prop => { prop.dmg = Number(e.target.value) })}
                    className="w-full accent-[var(--neon)]"
                  />
                </Field>
                {selected.type === 'enemy' && (
                  <Field label={`Velocità: ${(selected.props.speed ?? 2.2).toFixed(1)}`}>
                    <input
                      type="range" min={0.5} max={5} step={0.1}
                      value={selected.props.speed ?? 2.2}
                      onChange={e => updateSel(prop => { prop.speed = Number(e.target.value) })}
                      className="w-full accent-[var(--neon)]"
                    />
                  </Field>
                )}
              </>
            )}
            {selected.type === 'npc' && (
              <Field label="Dialoghi (una frase per riga)">
                <textarea
                  className="min-h-24 w-full bg-[var(--panel-soft)] p-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
                  value={(selected.props.pages ?? []).join('\n')}
                  onChange={e => updateSel(prop => { prop.pages = e.target.value.split('\n').filter(Boolean) })}
                />
              </Field>
            )}
            {selected.type === 'item' && (
              <>
                <Field label="Oggetto">
                  <select
                    className="h-7 w-full bg-[var(--panel-soft)] px-1 ring-1 ring-[var(--line)]"
                    value={selected.props.kind ?? 'moneta'}
                    onChange={e => updateSel(prop => { prop.kind = e.target.value as EntityKind })}
                  >
                    {['moneta', 'pozione', 'chiave', 'cassa'].map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <Field label={`Quantità: ${selected.props.amount ?? (selected.props.kind === 'cassa' ? 5 : 1)}`}>
                  <input
                    type="range" min={1} max={20}
                    value={selected.props.amount ?? (selected.props.kind === 'cassa' ? 5 : 1)}
                    onChange={e => updateSel(prop => { prop.amount = Number(e.target.value) })}
                    className="w-full accent-[var(--neon)]"
                  />
                </Field>
              </>
            )}
            {selected.type === 'door' && (
              <>
                <Field label="Porta verso la scena">
                  <select
                    className="h-7 w-full bg-[var(--panel-soft)] px-1 ring-1 ring-[var(--line)]"
                    value={selected.props.targetScene ?? ''}
                    onChange={e => updateSel(prop => { prop.targetScene = e.target.value })}
                  >
                    <option value="">— nessuna —</option>
                    {project.scenes.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-1">
                  <Field label="Arrivo X">
                    <Input type="number" className="h-7 bg-[var(--panel-soft)] text-xs"
                      value={selected.props.tx ?? 1}
                      onChange={e => updateSel(prop => { prop.tx = Number(e.target.value) })} />
                  </Field>
                  <Field label="Arrivo Y">
                    <Input type="number" className="h-7 bg-[var(--panel-soft)] text-xs"
                      value={selected.props.ty ?? 1}
                      onChange={e => updateSel(prop => { prop.ty = Number(e.target.value) })} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-[var(--tx-dim)]">
                  <input
                    type="checkbox"
                    checked={!!selected.props.locked}
                    onChange={e => updateSel(prop => { prop.locked = e.target.checked })}
                    className="accent-[var(--neon)]"
                  />
                  Chiusa a chiave 🔒
                </label>
              </>
            )}
            {selected.type === 'deco' && (
              <>
                <Field label="Decorazione">
                  <select
                    className="h-7 w-full bg-[var(--panel-soft)] px-1 ring-1 ring-[var(--line)]"
                    value={selected.props.kind ?? 'albero'}
                    onChange={e => updateSel(prop => { prop.kind = e.target.value as EntityKind })}
                  >
                    {['albero', 'barile', 'neon', 'lanterna'].map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-[var(--tx-dim)]">
                  <input
                    type="checkbox"
                    checked={!!selected.props.solid}
                    onChange={e => updateSel(prop => { prop.solid = e.target.checked })}
                    className="accent-[var(--neon)]"
                  />
                  Blocca il passaggio
                </label>
              </>
            )}
            {(selected.type === 'enemy' || selected.type === 'npc' || selected.type === 'player') && (
              <Field label="Colore">
                <input
                  type="color"
                  value={selected.props.color ?? pal.neon}
                  onChange={e => updateSel(prop => { prop.color = e.target.value })}
                  className="h-8 w-full bg-transparent"
                />
              </Field>
            )}
            <Button
              size="sm"
              variant="outline"
              className="cp-btn mt-1 text-red-400"
              onClick={() => {
                mutate(p => {
                  const sc = p.scenes.find(s => s.id === sceneId)!
                  sc.entities = sc.entities.filter(x2 => x2.id !== selected.id)
                })
                setSelectedId(null)
              }}
            >
              🗑 Elimina entità
            </Button>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-[var(--tx-faint)]">
            Nessuna entità selezionata.
            <br />
            Usa <b className="text-[var(--neon)]">⌖ Seleziona</b> e clicca
            un&apos;entità sulla mappa per modificarne HP, danno, dialoghi,
            destinazione porte e altro.
          </p>
        )}

        {/* impostazioni globali */}
        {settingsPanel}
      </div>
    </div>
  )

  // ---- blocco REGOLE (impostazioni del gioco, a tutta larghezza) ----
  const rulesSection = (
    <div className="cp-panel mx-auto w-full max-w-2xl p-4">
      {settingsPanel}
    </div>
  )

  // ---- HUB: le sezioni del gioco, ordinate e ben visibili ----
  const hubSection = (
    <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(
        [
          { key: 'scena', icon: '🛠️', title: 'Scena 3D', desc: 'Il banco di lavoro vero: sposti tutto con le frecce rosse, verdi e blu, ruoti, allarghi e importi strutture, personaggi e oggetti.', btn: 'Apri la Scena 3D', go: () => setSection('scena'), hot: true },
          { key: 'mappa', icon: '🗺️', title: 'Mappa missione', desc: 'La pianta del livello: scene, muri, acqua, dove nascono nemici e oggetti. Quello che piazzi qui compare nel mondo 3D.', btn: 'Apri la mappa', go: () => setSection('mappa'), hot: false },
          { key: 'storia', icon: '📖', title: 'Storia & PNG', desc: 'Personaggi, dialoghi ad albero, missione, oggetti RPG, abilità e magie, percorsi dei PNG e case entrabili.', btn: 'Apri la Storia', go: () => setShowRpg(true), hot: false },
          { key: 'azioni', icon: '🎮', title: 'Tasti & Animazioni', desc: 'I tasti del gioco (parla, attacca, magia… quante ne vuoi) e i movimenti di nemici, bottini e PNG.', btn: 'Apri i Tasti', go: () => setShowKeys(true), hot: false },
          { key: 'mondo', icon: '🌍', title: 'Mondo', desc: 'Stile del paesaggio, montagne, foreste, acqua e ora del giorno del Mondo Vasto del gioco.', btn: 'Scegli il mondo', go: () => setShowWorld(true), hot: false },
          { key: 'regole', icon: '⚙️', title: 'Regole del gioco', desc: 'HP, danno, arma, obiettivo, difficoltà, velocità, nebbia e minimappa.', btn: 'Apri le Regole', go: () => setSection('regole'), hot: false },
        ] as const
      ).map(c => (
        <motion.button
          key={c.key}
          type="button"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4 }}
          onClick={c.go}
          className={`cp-panel flex flex-col items-start gap-2 p-4 text-left transition-colors ${
            c.hot ? 'cp-panel-neon' : 'hover:border-[var(--neon)]'
          }`}
        >
          <span className="text-3xl">{c.icon}</span>
          <span className="font-[family-name:var(--font-display)] text-base font-black tracking-wide text-[var(--tx)]">
            {c.title}
          </span>
          <span className="text-xs leading-relaxed text-[var(--tx-dim)]">{c.desc}</span>
          <span className="mt-auto cp-chip cp-chip-active">{c.btn} →</span>
        </motion.button>
      ))}
    </div>
  )

  // ================= GIOCO 3D: shell a SEZIONI =================
  if (is3D) {
    return (
      <div className="flex min-h-[calc(100vh-140px)] flex-col gap-3">
        {/* barra superiore */}
        <div className="cp-panel flex flex-wrap items-center gap-2 p-2.5">
          <Button size="sm" variant="outline" className="cp-btn" onClick={onBack}>
            ← Giochi
          </Button>
          <Input
            value={project.title}
            onChange={e => mutate(p => { p.title = e.target.value })}
            className="h-8 w-48 border-[var(--line)] bg-[var(--panel-soft)] font-semibold"
          />
          <span className="cp-chip">{saveState === 'ok' ? '● salvato' : '◌ salvo...'}</span>
          <select
            value={project.settings.worldProjectId ?? ''}
            onChange={e => {
              const w = (worlds ?? []).find(x => x.id === e.target.value)
              if (w) mutate(p => { p.settings.worldProjectId = w.id; p.settings.worldProjectName = w.name })
            }}
            className="h-8 max-w-44 bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
            title="Mondo 3D usato dal gioco"
          >
            {!project.settings.worldProjectId && <option value="">— nessun mondo —</option>}
            {worlds === null && project.settings.worldProjectId && (
              <option value={project.settings.worldProjectId}>{project.settings.worldProjectName ?? 'mondo'}</option>
            )}
            {(worlds ?? []).map(w => (
              <option key={w.id} value={w.id}>🌍 {w.name}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="cp-btn" onClick={() => exportGameFile(project)}>
              ⇩ JSON
            </Button>
            <Button size="sm" className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={onPlay}>
              ▶ GIOCA
            </Button>
          </div>
        </div>

        {/* barre delle sezioni: ben separate e ordinate */}
        <div className="cp-panel flex flex-wrap items-center gap-1.5 p-2">
          {(
            [
              { k: 'hub' as Section3d, l: '🎛 HUB' },
              { k: 'scena' as Section3d, l: '🛠 Scena 3D' },
              { k: 'mappa' as Section3d, l: '🗺 Mappa missione' },
              { k: 'regole' as Section3d, l: '⚙ Regole' },
            ]
          ).map(x => (
            <button
              key={x.k}
              onClick={() => setSection(x.k)}
              className={`cp-chip ${section === x.k ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
            >
              {x.l}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-[var(--line)]" />
          <button onClick={() => setShowRpg(true)} className={`cp-chip ${project.settings.rpg ? 'border-[var(--neon)] text-[var(--neon)]' : 'hover:text-[var(--neon)]'}`}>
            📖 Storia & PNG
          </button>
          <button onClick={() => setShowKeys(true)} className={`cp-chip hover:text-[var(--neon)]`}>
            🎮 Tasti & Animazioni
          </button>
          <button onClick={() => setShowWorld(true)} className={`cp-chip ${project.settings.vast ? 'border-[var(--neon)] text-[var(--neon)]' : 'hover:text-[var(--neon)]'}`}>
            🌍 Mondo
          </button>
          <button onClick={() => setShowAnim(true)} className={`cp-chip hover:text-[var(--neon)]`}>
            🎬 Effetti
          </button>
        </div>

        {/* contenuto della sezione */}
        {section === 'hub' && hubSection}
        {section === 'mappa' && mapEditor}
        {section === 'regole' && rulesSection}

        {/* sezione SCENA 3D: a schermo intero */}
        {section === 'scena' && (
          <SceneEditor3D
            project={project}
            mutate={mutate}
            onClose={() => setSection('hub')}
          />
        )}

        {/* HUB STORIA a schermo intero */}
        {showRpg && (
          <RpgEditors
            project={project}
            mutate={mutate}
            onClose={() => setShowRpg(false)}
          />
        )}

        {/* editor TASTI AZIONE */}
        {showKeys && (
          <ActionKeysEditor
            project={project}
            mutate={mutate}
            onClose={() => setShowKeys(false)}
          />
        )}

        {/* MONDO VASTO del gioco */}
        {showWorld && (
          <WorldVastDialog
            project={project}
            mutate={mutate}
            onClose={() => setShowWorld(false)}
          />
        )}

        {/* EFFETTI & ANIMAZIONI */}
        {showAnim && (
          <AnimEditors
            project={project}
            mutate={mutate}
            onClose={() => setShowAnim(false)}
          />
        )}
      </div>
    )
  }

  // ================= GIOCO 2D: layout classico =================
  return (
    <div className="flex min-h-[calc(100vh-140px)] flex-col gap-3">
      {/* barra superiore */}
      <div className="cp-panel flex flex-wrap items-center gap-2 p-2.5">
        <Button size="sm" variant="outline" className="cp-btn" onClick={onBack}>
          ← Giochi
        </Button>
        <Input
          value={project.title}
          onChange={e => mutate(p => { p.title = e.target.value })}
          className="h-8 w-48 border-[var(--line)] bg-[var(--panel-soft)] font-semibold"
        />
        <span className="cp-chip">{saveState === 'ok' ? '● salvato' : '◌ salvo...'}</span>

        <select
          value={project.settings.paletteId}
          onChange={e => mutate(p => { p.settings.paletteId = e.target.value as PaletteId })}
          className="h-8 bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
        >
          {Object.values(PALETTES).map(p2 => (
            <option key={p2.id} value={p2.id}>{p2.name}</option>
          ))}
        </select>
        <select
          value={project.settings.weapon}
          onChange={e => mutate(p => { p.settings.weapon = e.target.value as 'spada' | 'blaster' })}
          className="h-8 bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
        >
          <option value="spada">⚔ Spada</option>
          <option value="blaster">🔫 Blaster</option>
        </select>
        <select
          value={project.settings.objective}
          onChange={e => mutate(p => { p.settings.objective = e.target.value as 'goal' | 'boss' | 'collezione' })}
          className="h-8 bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
        >
          <option value="goal">Obiettivo: portale</option>
          <option value="boss">Obiettivo: elimina boss</option>
          <option value="collezione">Obiettivo: colleziona chiavi</option>
        </select>
        <select
          value={project.settings.difficulty}
          onChange={e => mutate(p => { p.settings.difficulty = Number(e.target.value) as 1 | 2 | 3 })}
          className="h-8 bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
        >
          <option value={1}>Facile</option>
          <option value={2}>Normale</option>
          <option value={3}>Difficile</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={showRpg ? 'default' : 'outline'}
            className={`cp-btn ${project.settings.rpg ? 'border-[var(--neon)] text-[var(--neon)]' : ''}`}
            title="Apri l'hub della storia: personaggi, dialoghi, percorsi PNG, oggetti, abilità, magie, case entrabili"
            onClick={() => setShowRpg(true)}
          >
            📖 RPG {project.settings.rpg ? '●' : ''}
          </Button>
          <Button
            size="sm"
            variant={showAnim ? 'default' : 'outline'}
            className={`cp-btn ${
              project.settings.animSpin === false ||
              project.settings.animBob ||
              project.settings.animSpeed ||
              project.settings.enemyMode ||
              project.settings.npcWalk === false
                ? 'border-[var(--neon)] text-[var(--neon)]'
                : ''
            }`}
            title="Apri il reparto Animazioni & Interazioni: rotazioni, fluttuazioni, IA dei nemici, PNG che camminano"
            onClick={() => setShowAnim(true)}
          >
            🎬 Animazioni
          </Button>
          <Button size="sm" variant="outline" className="cp-btn" onClick={() => exportGameFile(project)}>
            ⇩ JSON
          </Button>
          <Button size="sm" className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={onPlay}>
            ▶ GIOCA
          </Button>
        </div>
      </div>

      {mapEditor}

      {/* HUB STORIA a schermo intero */}
      {showRpg && (
        <RpgEditors
          project={project}
          mutate={mutate}
          onClose={() => setShowRpg(false)}
        />
      )}

      {/* EFFETTI & ANIMAZIONI */}
      {showAnim && (
        <AnimEditors
          project={project}
          mutate={mutate}
          onClose={() => setShowAnim(false)}
        />
      )}
    </div>
  )

  // ---------- helper ----------
  function updateSel(fn: (props: GameEntity['props']) => void) {
    mutate(p => {
      const sc = p.scenes.find(s => s.id === sceneId)
      const ent = sc?.entities.find(e => e.id === selectedId)
      if (ent) fn(ent.props)
    })
  }
}

// ============================================================
// v16: EDITOR TASTI AZIONE — aggiungi quanti tasti vuoi,
// ognuno con la sua azione (parla con i PNG, attacca, magia…)
// ============================================================
function ActionKeysEditor({
  project,
  mutate,
  onClose,
}: {
  project: GameProject
  mutate: (fn: (p: GameProject) => void) => void
  onClose: () => void
}) {
  const buttons = project.settings.actionButtons ?? defaultActionButtons()
  const [label, setLabel] = useState('')
  const [action, setAction] = useState<ActionButton['action']>('parla')
  const [key, setKey] = useState('T')

  const add = () => {
    const def = ACTION_DEFS.find(a => a.action === action)!
    const b: ActionButton = {
      id: `a_${Date.now().toString(36)}`,
      label: label.trim() || def.label,
      icon: def.icon,
      key: (key.trim() || 'T').slice(0, 6),
      action,
    }
    mutate(p => { p.settings.actionButtons = [...(p.settings.actionButtons ?? defaultActionButtons()), b] })
    setLabel('')
    toast.success(`Tasto "${b.label}" aggiunto! 🎮`)
  }

  const remove = (id: string) => {
    mutate(p => {
      const list = p.settings.actionButtons ?? defaultActionButtons()
      p.settings.actionButtons = list.filter(b => b.id !== id)
    })
  }

  const setB = (id: string, patch: Partial<ActionButton>) => {
    mutate(p => {
      const list = p.settings.actionButtons ?? defaultActionButtons()
      p.settings.actionButtons = list.map(b => (b.id === id ? { ...b, ...patch } : b))
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[var(--tx)]">🎮 Tasti & azioni del gioco</h2>
        <p className="mt-1 text-xs text-[var(--tx-dim)]">
          Ogni tasto fa un&apos;azione in ▶ GIOCA: parlare con i PNG, attaccare, schivare,
          lanciare magie… Aggiungine quanti vuoi, con l&apos;etichetta che preferisci.
        </p>

        {/* lista tasti attuali */}
        <div className="mt-4 flex flex-col gap-2">
          {buttons.map(b => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5 text-xs">
              <span className="text-lg">{b.icon}</span>
              <input
                value={b.label}
                onChange={e => setB(b.id, { label: e.target.value })}
                className="h-7 w-28 rounded-md bg-[var(--panel)] px-2 font-semibold text-[var(--tx)] ring-1 ring-[var(--line)]"
              />
              <select
                value={b.action}
                onChange={e => setB(b.id, { action: e.target.value as ActionButton['action'] })}
                className="h-7 bg-[var(--panel)] px-1 text-[var(--tx)] ring-1 ring-[var(--line)]"
              >
                {ACTION_DEFS.map(a => (
                  <option key={a.action} value={a.action}>{a.icon} {a.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[var(--tx-dim)]">
                tasto
                <input
                  value={b.key}
                  onChange={e => setB(b.id, { key: e.target.value })}
                  className="h-7 w-14 rounded-md bg-[var(--panel)] px-2 text-center font-mono font-bold text-[var(--neon)] ring-1 ring-[var(--line)]"
                  maxLength={6}
                />
              </label>
              <button
                className="ml-auto cp-chip text-red-400 hover:text-red-300"
                onClick={() => remove(b.id)}
                title="Rimuovi tasto"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* aggiungi nuovo tasto */}
        <div className="mt-4 rounded-xl border border-dashed border-[var(--line-strong)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--tx-faint)]">Aggiungi un tasto</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={`Etichetta (es. "Parla col fabbro")`}
              className="h-8 w-44 rounded-md bg-[var(--panel-soft)] px-2 text-[var(--tx)] ring-1 ring-[var(--line)]"
            />
            <select
              value={action}
              onChange={e => setAction(e.target.value as ActionButton['action'])}
              className="h-8 bg-[var(--panel-soft)] px-1 text-[var(--tx)] ring-1 ring-[var(--line)]"
            >
              {ACTION_DEFS.map(a => (
                <option key={a.action} value={a.action}>{a.icon} {a.label} — {a.desc}</option>
              ))}
            </select>
            <input
              value={key}
              onChange={e => setKey(e.target.value)}
              className="h-8 w-14 rounded-md bg-[var(--panel-soft)] px-2 text-center font-mono font-bold text-[var(--neon)] ring-1 ring-[var(--line)]"
              maxLength={6}
              title="Tasto della tastiera"
            />
            <Button size="sm" className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={add}>
              + Aggiungi
            </Button>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button className="cp-btn" onClick={onClose}>Fatto ✓</Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">{label}</span>
      {children}
    </label>
  )
}

function defaultProps(
  type: EntityType,
  kind: EntityKind | undefined,
  palId: PaletteId
): GameEntity['props'] {
  const neon = PALETTES[palId].neon
  switch (type) {
    case 'enemy':
      if (kind === 'boss')
        return { kind, hp: 300, dmg: 26, speed: 1.8, color: '#ff2bd6' }
      if (kind === 'turret') return { kind, hp: 80, dmg: 14, color: '#ff3355' }
      return { kind, hp: 60, dmg: 12, color: '#ff5a5a' }
    case 'npc':
      return { name: 'Voce del gioco', color: '#fcee0a', pages: ['Ciao, viandante...'] }
    case 'item':
      return { kind: kind ?? 'moneta', amount: kind === 'cassa' ? 5 : 1 }
    case 'door':
      return { locked: false }
    case 'deco':
      return { kind: kind ?? 'albero', solid: kind === 'albero' || kind === 'barile' }
    default:
      return { color: neon }
  }
}


// ============================================================
// v14: DIALOG MONDO VASTO del gioco 3D — lo stile del mondo si
// sceglie QUI, dentro il Game Studio: stile del paesaggio, seed,
// montagne, colline, foreste, acqua, ora del giorno.
// ============================================================
function WorldVastDialog({
  project,
  mutate,
  onClose,
}: {
  project: GameProject
  mutate: (fn: (p: GameProject) => void) => void
  onClose: () => void
}) {
  const [cfg, setCfg] = useState<VastConfig>(
    project.settings.vast ?? { ...VAST_DEFAULT, seed: Math.floor(Math.random() * 1e9) }
  )
  const apply = () => {
    mutate(p => {
      p.settings.vast = cfg
      p.settings.dimension = '3d'
      if (p.settings.camera !== 'prima') p.settings.camera = 'terza'
    })
    onClose()
    toast.success('🌍 Mondo Vasto del gioco aggiornato: premi ▶ GIOCA per esplorarlo!')
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[var(--tx)]">🌍 Mondo Vasto del gioco</h2>
        <p className="mt-1 text-xs text-[var(--tx-dim)]">
          Il tuo gioco 3D nasce in un mondo <b>infinito di sola natura</b>: montagne, colline,
          foreste, laghi. Scegli lo stile del paesaggio e regola le opzioni. Se hai collegato un
          mondo dal menu in alto, quello ha la priorità.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">
              Stile del paesaggio
            </span>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {VAST_BIOMES.map(b => (
                <button
                  key={b.id}
                  className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                    (cfg.biome ?? 'alpino') === b.id
                      ? 'border-[var(--neon)] bg-[var(--primary-soft)] text-[var(--tx)]'
                      : 'border-[var(--line)] text-[var(--tx-dim)] hover:bg-[var(--panel-hover)]'
                  }`}
                  onClick={() => setCfg({ ...cfg, biome: b.id })}
                >
                  <span className="block font-bold">{b.label}</span>
                  <span className="block text-[9px] leading-tight opacity-80">{b.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">
                Seed del mondo
              </span>
              <input
                type="number"
                value={cfg.seed}
                onChange={e =>
                  setCfg({ ...cfg, seed: Math.abs(Math.floor(Number(e.target.value) || 0)) })
                }
                className="h-8 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm text-[var(--tx)]"
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              className="cp-btn h-8"
              onClick={() => setCfg({ ...cfg, seed: Math.floor(Math.random() * 1e9) })}
            >
              🎲 Casuale
            </Button>
          </div>

          {([
            { key: 'mountains', label: '🏔 Montagne', min: 'pianure', max: 'Himalaya' },
            { key: 'hills', label: '⛰ Colline', min: 'piatte', max: 'mosse' },
            { key: 'trees', label: '🌲 Foreste', min: 'radure', max: 'giungla' },
            { key: 'water', label: '💧 Acqua', min: 'arida', max: 'arcipelago' },
          ] as const).map(s => (
            <label key={s.key} className="flex flex-col gap-1">
              <span className="flex justify-between text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">
                <span>{s.label}</span>
                <span>{Math.round(cfg[s.key] * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={cfg[s.key]}
                onChange={e => setCfg({ ...cfg, [s.key]: Number(e.target.value) })}
                className="accent-[var(--neon)]"
              />
              <span className="flex justify-between text-[9px] text-[var(--tx-faint)]">
                <span>{s.min}</span>
                <span>{s.max}</span>
              </span>
            </label>
          ))}

          <div>
            <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">
              Ora del giorno
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {(Object.keys(VAST_TOD_LABEL) as VastTod[]).map(t => (
                <button
                  key={t}
                  className={`cp-chip ${cfg.tod === t ? 'cp-chip-active' : ''}`}
                  onClick={() => setCfg({ ...cfg, tod: t })}
                >
                  {VAST_TOD_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {project.settings.vast && (
            <Button
              variant="outline"
              className="cp-btn text-red-400"
              onClick={() => {
                mutate(p => { p.settings.vast = null })
                onClose()
                toast.info('Mondo vasto rimosso: collega un mondo dal menu in alto o riattivalo')
              }}
            >
              ✕ Rimuovi
            </Button>
          )}
          <Button className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={apply}>
            🌍 Usa questo mondo
          </Button>
        </div>
      </div>
    </div>
  )
}
