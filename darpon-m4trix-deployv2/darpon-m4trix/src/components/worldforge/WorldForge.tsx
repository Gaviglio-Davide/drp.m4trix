'use client'

// ============================================================
// REPARTO: WORLD FORGE — "crea il tuo mondo da zero" in stile
// Watabou's Procgen Arcana: genera una mappa casuale poi
// personalizza TUTTO: biomi col pennello, città e villaggi con
// layout edificabile, dungeon, caverne, nomi, fiumi, strade.
// La mappa diventa un livello giocabile nel Game Studio.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  B,
  generateCave,
  generateCity,
  generateDungeon,
  generateWorld,
  makeName,
  rerollSettlement,
  rngFrom,
  type Site,
  type Settlement,
  type World,
  type WorldParams,
} from '@/lib/worldforge/world'
import { paintCity, paintSite, paintWorld } from '@/lib/worldforge/render'
import { worldToGameProject } from '@/lib/worldforge/export'
import { createGame } from '@/lib/game2d/persist'
import { useUI } from '@/lib/ui-store'
import { sectionOf } from '@/lib/ui-store'

type Tool =
  | 'select'
  | 'brush'
  | 'add-city'
  | 'add-village'
  | 'add-dungeon'
  | 'add-cave'
  | 'erase'

const BRUSH_BIOMES: { b: number; label: string }[] = [
  { b: B.WATER, label: '💧 Acqua' },
  { b: B.SAND, label: '🏜 Sabbia' },
  { b: B.GRASS, label: '🌿 Prato' },
  { b: B.FOREST, label: '🌲 Bosco' },
  { b: B.HILL, label: '⛰ Collina' },
  { b: B.MOUNTAIN, label: '🏔 Montagna' },
  { b: B.SNOW, label: '❄ Neve' },
]

const SIZE_PRESETS = [
  { label: 'Barone (63×44)', w: 63, h: 44 },
  { label: 'Re (84×58)', w: 84, h: 58 },
  { label: 'Imperatore (104×72)', w: 104, h: 72 },
]

export default function WorldForge() {
  const site0 = useUI(s => s.site)
  const sec = sectionOf(site0.sections, 'worldforge')
  const [params, setParams] = useState<WorldParams>({
    seed: Math.floor(Math.random() * 1e9),
    w: 84,
    h: 58,
    sea: 0.4,
    forest: 0.5,
    cities: 3,
    villages: 5,
    dungeons: 3,
    caves: 3,
  })
  const [world, setWorld] = useState<World | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [brush, setBrush] = useState(2)
  const [brushBiome, setBrushBiome] = useState<number>(B.WATER)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [painting, setPainting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cityCanvasRef = useRef<HTMLCanvasElement>(null)
  const siteCanvasRef = useRef<HTMLCanvasElement>(null)

  const selectedSettlement = world?.settlements.find(s => s.id === selectedId) ?? null
  const selectedSite = world?.sites.find(s => s.id === selectedId) ?? null

  // ---------- generazione ----------
  const regenerate = useCallback((p: WorldParams) => {
    const w0 = generateWorld(p)
    setWorld(w0)
    setSelectedId(null)
    setTick(t => t + 1)
  }, [])

  useEffect(() => {
    regenerate(params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- pittura mappa ----------
  const cell = params.w > 95 ? 7 : params.w > 70 ? 9 : 11

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !world) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (canvas.width !== world.params.w * cell) {
      canvas.width = world.params.w * cell
      canvas.height = world.params.h * cell
    }
    paintWorld(ctx, world, cell, { selectedId, hover, brush })
  }, [world, cell, selectedId, hover, brush, tick])

  // preview città / sito
  useEffect(() => {
    if (selectedSettlement && cityCanvasRef.current) {
      const c = cityCanvasRef.current
      const scale = 4.5
      const half = selectedSettlement.map.extent + 6
      c.width = Math.ceil(half * 2 * scale)
      c.height = Math.ceil(half * 2 * scale)
      const ctx = c.getContext('2d')!
      paintCity(ctx, selectedSettlement, scale)
    }
  }, [selectedSettlement])

  useEffect(() => {
    if (selectedSite && siteCanvasRef.current) {
      const c = siteCanvasRef.current
      c.width = selectedSite.w * 7
      c.height = selectedSite.h * 7
      const ctx = c.getContext('2d')!
      paintSite(ctx, selectedSite, 7)
    }
  }, [selectedSite])

  // ---------- interazione ----------
  const cellFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas || !world) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * world.params.w)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * world.params.h)
    if (x < 0 || y < 0 || x >= world.params.w || y >= world.params.h) return null
    return { x, y }
  }

  const paintAt = (x: number, y: number) => {
    if (!world) return
    const r = brush - 1
    for (let dy = -Math.floor(r / 2); dy <= Math.floor(r / 2) + ((r % 2 === 0) ? 1 : 0); dy++)
      for (let dx = -Math.floor(r / 2); dx <= Math.floor(r / 2) + ((r % 2 === 0) ? 1 : 0); dx++) {
        const tx = x + dx
        const ty = y + dy
        if (tx < 1 || ty < 1 || tx >= world.params.w - 1 || ty >= world.params.h - 1) continue
        world.biome[ty * world.params.w + tx] = brushBiome
      }
    setTick(t => t + 1)
  }

  const addSettlement = (x: number, y: number, kind: 'city' | 'village') => {
    if (!world) return
    const r = rngFrom(Date.now() >>> 0)
    const seed = Math.floor(r() * 1e9)
    const size: 1 | 2 | 3 = kind === 'city' ? ((r() < 0.35 ? 2 : 1) as 1 | 2 | 3) : 1
    const made: Settlement = {
      id: Math.random().toString(36).slice(2, 9),
      kind,
      x,
      y,
      name: makeName(r),
      seed,
      size,
      map: generateCity(seed, size, kind === 'village'),
    }
    setWorld({ ...world, settlements: [...world.settlements, made] })
    setSelectedId(made.id)
    setTick(t => t + 1)
  }

  const addSite = (x: number, y: number, kind: 'dungeon' | 'cave') => {
    if (!world) return
    const r = rngFrom(Date.now() >>> 0)
    const w0 = kind === 'dungeon' ? 34 : 30
    const h0 = kind === 'dungeon' ? 24 : 22
    const site: Site = {
      id: Math.random().toString(36).slice(2, 9),
      kind,
      x,
      y,
      name: (kind === 'dungeon' ? 'Cripta di ' : 'Caverne di ') + makeName(r),
      seed: Math.floor(r() * 1e9),
      w: w0,
      h: h0,
      grid: kind === 'dungeon' ? generateDungeon(Math.floor(r() * 1e9), w0, h0) : generateCave(Math.floor(r() * 1e9), w0, h0),
    }
    setWorld({ ...world, sites: [...world.sites, site] })
    setSelectedId(site.id)
    setTick(t => t + 1)
  }

  const eraseAt = (x: number, y: number) => {
    if (!world) return
    const near = world.settlements.find(s => Math.hypot(s.x - x, s.y - y) < 3)
    if (near) {
      setWorld({ ...world, settlements: world.settlements.filter(s => s.id !== near.id) })
      if (selectedId === near.id) setSelectedId(null)
      toast.info(`${near.name} rimossa`)
      return
    }
    const nearSite = world.sites.find(s => Math.hypot(s.x - x, s.y - y) < 3)
    if (nearSite) {
      setWorld({ ...world, sites: world.sites.filter(s => s.id !== nearSite.id) })
      if (selectedId === nearSite.id) setSelectedId(null)
      toast.info(`${nearSite.name} rimossa`)
      return
    }
    toast.info('Niente da rimuovere qui')
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const c = cellFromEvent(e)
    if (!c) return
    if (tool === 'select') {
      const hitS = world?.settlements.find(s => Math.hypot(s.x - c.x, s.y - c.y) < 4)
      const hitT = world?.sites.find(s => Math.hypot(s.x - c.x, s.y - c.y) < 4)
      setSelectedId(hitS?.id ?? hitT?.id ?? null)
    } else if (tool === 'brush') {
      setPainting(true)
      paintAt(c.x, c.y)
    } else if (tool === 'add-city') addSettlement(c.x, c.y, 'city')
    else if (tool === 'add-village') addSettlement(c.x, c.y, 'village')
    else if (tool === 'add-dungeon') addSite(c.x, c.y, 'dungeon')
    else if (tool === 'add-cave') addSite(c.x, c.y, 'cave')
    else if (tool === 'erase') eraseAt(c.x, c.y)
  }

  // ---------- azioni pannello ----------
  const updateSelected = (fn: (w: World) => void) => {
    if (!world) return
    const copy: World = { ...world, settlements: [...world.settlements], sites: [...world.sites] }
    fn(copy)
    setWorld(copy)
    setTick(t => t + 1)
  }

  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `mondo-${world?.params.seed ?? 0}.png`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('Mappa esportata in PNG!')
    })
  }

  const sendToStudio = async () => {
    if (!world || busy) return
    setBusy(true)
    try {
      const game = worldToGameProject(world)
      const m = await createGame(game.title, game)
      useUI.getState().setStudioOpenId(m.id)
      useUI.getState().setTab('gamestudio')
      toast.success('Mondo inviato al Game Studio! 🎮')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invio fallito')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="neon-title text-2xl font-black tracking-wide">
          {sec.title || 'WORLD FORGE'}
        </h1>
        <p className="max-w-2xl text-sm text-[var(--tx-dim)]">
          {sec.subtitle ||
            'Genera una mappa del mondo casuale e poi personalizza tutto: biomi col pennello, città con edifici e mura, villaggi, dungeon, caverne, fiumi e strade. Poi manda tutto nel Game Studio come livello giocabile.'}
        </p>
      </motion.div>

      {/* ---- pannello parametri ---- */}
      <div className="cp-panel flex flex-wrap items-end gap-3 p-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Seed</span>
          <div className="flex gap-1">
            <Input
              className="h-8 w-28 bg-[var(--panel-soft)]"
              value={params.seed}
              onChange={e => setParams({ ...params, seed: Number(e.target.value) || 0 })}
            />
            <button
              className="cp-chip h-8 leading-8 hover:text-[var(--neon)]"
              title="Seed casuale"
              onClick={() => setParams({ ...params, seed: Math.floor(Math.random() * 1e9) })}
            >
              🎲
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Dimensione</span>
          <select
            className="h-8 bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
            value={`${params.w}x${params.h}`}
            onChange={e => {
              const [w0, h0] = e.target.value.split('x').map(Number)
              setParams({ ...params, w: w0, h: h0 })
            }}
          >
            {SIZE_PRESETS.map(s2 => (
              <option key={s2.label} value={`${s2.w}x${s2.h}`}>{s2.label}</option>
            ))}
          </select>
        </label>
        {([
          ['sea', 'Mare', 0, 1],
          ['forest', 'Boschi', 0, 1],
          ['cities', 'Città', 0, 6],
          ['villages', 'Villaggi', 0, 10],
          ['dungeons', 'Dungeon', 0, 5],
          ['caves', 'Caverne', 0, 6],
        ] as [keyof WorldParams, string, number, number][]).map(([k, label, min, max]) => (
          <label key={String(k)} className="flex w-24 flex-col gap-1">
            <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">
              {label}: {params[k] as number}
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={k === 'sea' || k === 'forest' ? 0.05 : 1}
              value={params[k] as number}
              onChange={e => setParams({ ...params, [k]: Number(e.target.value) })}
              className="accent-[var(--neon)]"
            />
          </label>
        ))}
        <Button
          className="cp-btn ml-auto bg-[var(--neon)] font-bold text-[#04060d]"
          onClick={() => regenerate(params)}
        >
          ⚒ Genera mondo
        </Button>
      </div>

      {/* ---- strumenti ---- */}
      <div className="cp-panel flex flex-wrap items-center gap-1.5 p-2">
        <button className={`cp-chip ${tool === 'select' ? 'cp-chip-active' : ''}`} onClick={() => setTool('select')}>
          ⌖ Seleziona
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--line)]" />
        {BRUSH_BIOMES.map(b0 => (
          <button
            key={b0.b}
            className={`cp-chip ${tool === 'brush' && brushBiome === b0.b ? 'cp-chip-active' : ''}`}
            onClick={() => { setTool('brush'); setBrushBiome(b0.b) }}
          >
            {b0.label}
          </button>
        ))}
        {tool === 'brush' && (
          <>
            <span className="mx-1 h-5 w-px bg-[var(--line)]" />
            {[1, 2, 3, 4].map(b2 => (
              <button key={b2} className={`cp-chip ${brush === b2 ? 'cp-chip-active' : ''}`} onClick={() => setBrush(b2)}>
                {b2}×{b2}
              </button>
            ))}
          </>
        )}
        <span className="mx-1 h-5 w-px bg-[var(--line)]" />
        <button className={`cp-chip ${tool === 'add-city' ? 'cp-chip-active' : ''}`} onClick={() => setTool('add-city')}>🏙 + Città</button>
        <button className={`cp-chip ${tool === 'add-village' ? 'cp-chip-active' : ''}`} onClick={() => setTool('add-village')}>🏘 + Villaggio</button>
        <button className={`cp-chip ${tool === 'add-dungeon' ? 'cp-chip-active' : ''}`} onClick={() => setTool('add-dungeon')}>🚪 + Dungeon</button>
        <button className={`cp-chip ${tool === 'add-cave' ? 'cp-chip-active' : ''}`} onClick={() => setTool('add-cave')}>🕳 + Caverna</button>
        <button className={`cp-chip ${tool === 'erase' ? 'cp-chip-active' : ''}`} onClick={() => setTool('erase')}>✕ Rimuovi</button>
        <span className="ml-auto flex gap-2">
          <button className="cp-chip hover:text-[var(--neon)]" onClick={exportPng}>⇩ PNG</button>
          <button
            className="cp-chip cp-chip-active"
            onClick={() => void sendToStudio()}
            disabled={busy}
          >
            🎮 Manda al Game Studio
          </button>
        </span>
      </div>

      {/* ---- mappa + pannello ---- */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <div className="cp-panel overflow-auto p-2">
          {world ? (
            <canvas
              ref={canvasRef}
              className="mx-auto block max-w-full cursor-crosshair"
              style={{ imageRendering: 'pixelated' }}
              onPointerDown={onPointerDown}
              onPointerMove={e => {
                const c = cellFromEvent(e)
                setHover(c)
                if (painting && c && tool === 'brush') paintAt(c.x, c.y)
              }}
              onPointerUp={() => setPainting(false)}
              onPointerLeave={() => { setPainting(false); setHover(null) }}
              onContextMenu={e => e.preventDefault()}
            />
          ) : (
            <p className="p-10 text-center text-sm text-[var(--tx-dim)]">
              Genero il mondo...
            </p>
          )}
        </div>

        {/* pannello dettaglio */}
        <div className="cp-panel flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-3">
          <span className="neon-text font-[family-name:var(--font-display)] text-[11px] font-bold tracking-[0.18em] uppercase">
            Dettaglio
          </span>

          {selectedSettlement ? (
            <div className="flex flex-col gap-2 text-xs">
              <div className="cp-chip cp-chip-active w-fit">
                {selectedSettlement.kind === 'city' ? '🏙 CITTÀ' : '🏘 VILLAGGIO'}
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Nome</span>
                <div className="flex gap-1">
                  <Input
                    className="h-7 bg-[var(--panel-soft)] text-xs"
                    value={selectedSettlement.name}
                    onChange={e =>
                      updateSelected(w0 => {
                        const s = w0.settlements.find(x => x.id === selectedSettlement.id)!
                        s.name = e.target.value
                      })
                    }
                  />
                  <button
                    className="cp-chip hover:text-[var(--neon)]"
                    onClick={() =>
                      updateSelected(w0 => {
                        const s = w0.settlements.find(x => x.id === selectedSettlement.id)!
                        s.name = makeName(rngFrom(Date.now() >>> 0))
                      })
                    }
                  >
                    🎲
                  </button>
                </div>
              </label>
              {selectedSettlement.kind === 'city' && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">
                    Grandezza: {['borgo', 'città', 'metropoli'][selectedSettlement.size - 1]}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    value={selectedSettlement.size}
                    onChange={e =>
                      updateSelected(w0 => {
                        const i = w0.settlements.findIndex(x => x.id === selectedSettlement.id)
                        w0.settlements[i] = rerollSettlement(w0.settlements[i], Number(e.target.value) as 1 | 2 | 3)
                      })
                    }
                    className="accent-[var(--neon)]"
                  />
                </label>
              )}
              <button
                className="cp-chip w-fit hover:text-[var(--neon)]"
                onClick={() =>
                  updateSelected(w0 => {
                    const i = w0.settlements.findIndex(x => x.id === selectedSettlement.id)
                    w0.settlements[i] = rerollSettlement(w0.settlements[i], w0.settlements[i].size)
                  })
                }
              >
                ↻ Ricostruisce il layout
              </button>
              {selectedSettlement.kind === 'city' ? (
                <canvas ref={cityCanvasRef} className="w-full ring-1 ring-[var(--line)]" />
              ) : (
                <p className="text-[11px] text-[var(--tx-faint)]">
                  I villaggi sono case sparse attorno alla piazza: perfetti per
                  NPC e rifugi nel gioco.
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="cp-btn text-red-400"
                onClick={() => {
                  updateSelected(w0 => {
                    w0.settlements = w0.settlements.filter(x => x.id !== selectedSettlement.id)
                  })
                  setSelectedId(null)
                }}
              >
                🗑 Rimuovi {selectedSettlement.name}
              </Button>
            </div>
          ) : selectedSite ? (
            <div className="flex flex-col gap-2 text-xs">
              <div className="cp-chip cp-chip-active w-fit">
                {selectedSite.kind === 'dungeon' ? '🚪 DUNGEON' : '🕳 CAVERNA'}
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Nome</span>
                <div className="flex gap-1">
                  <Input
                    className="h-7 bg-[var(--panel-soft)] text-xs"
                    value={selectedSite.name}
                    onChange={e =>
                      updateSelected(w0 => {
                        const s = w0.sites.find(x => x.id === selectedSite.id)!
                        s.name = e.target.value
                      })
                    }
                  />
                  <button
                    className="cp-chip hover:text-[var(--neon)]"
                    onClick={() =>
                      updateSelected(w0 => {
                        const s = w0.sites.find(x => x.id === selectedSite.id)!
                        s.name = (s.kind === 'dungeon' ? 'Cripta di ' : 'Caverne di ') + makeName(rngFrom(Date.now() >>> 0))
                      })
                    }
                  >
                    🎲
                  </button>
                </div>
              </label>
              <canvas ref={siteCanvasRef} className="w-full ring-1 ring-[var(--line)]" />
              <button
                className="cp-chip w-fit hover:text-[var(--neon)]"
                onClick={() => {
                  updateSelected(w0 => {
                    const s = w0.sites.find(x => x.id === selectedSite.id)!
                    const seed = Math.floor(Math.random() * 1e9)
                    s.grid = s.kind === 'dungeon' ? generateDungeon(seed, s.w, s.h) : generateCave(seed, s.w, s.h)
                  })
                  setTick(t => t + 1)
                }}
              >
                ↻ Rigenera i corridoi
              </button>
              <p className="text-[11px] text-[var(--tx-faint)]">
                Nel gioco diventa un livello secondario raggiungibile dalla
                porta sulla mappa: nemici, tesori e portale finale inclusi.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="cp-btn text-red-400"
                onClick={() => {
                  updateSelected(w0 => {
                    w0.sites = w0.sites.filter(x => x.id !== selectedSite.id)
                  })
                  setSelectedId(null)
                }}
              >
                🗑 Rimuovi
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-[var(--tx-faint)]">
              <p>
                <b className="text-[var(--neon)]">{world?.settlements.length ?? 0}</b> insediamenti ·{' '}
                <b className="text-[var(--neon)]">{world?.sites.length ?? 0}</b> sotterranei ·{' '}
                <b className="text-[var(--neon)]">{world?.roads.length ?? 0}</b> tile di strade
              </p>
              <p>
                Clicca una <b>città</b> o un <b>dungeon</b> sulla mappa per
                aprirne il dettaglio: nomi, dimensioni e layout si ricostruiscono
                come vuoi tu.
              </p>
              <p>
                Con <b>💧🌲🏔</b> dipingi i biomi, con <b>🏙 🚪</b> aggiungi
                città e sotterranei dove vuoi.
              </p>
              <p>
                Quando il mondo ti piace: <b className="text-[var(--neon)]">🎮 Manda al Game Studio</b>{' '}
                e diventa un gioco esplorabile.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
