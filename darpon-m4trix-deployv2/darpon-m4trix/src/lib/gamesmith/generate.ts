// ============================================================
// GAMESMITH — generazione del gioco giocabile dalla
// sceneggiatura analizzata. Stesso script + seed diverso =
// gioco diverso (variazione garantita, come richiesto).
// ============================================================

import {
  addBorderWalls,
  emptyScene,
  rngFromSeed,
  SCHEMATIC_SIZE,
  type GameEntity,
  type GameProject,
  type GameScene,
} from '@/lib/game2d/types'
import type { ScriptAnalysis } from './analyze'

/** payload del mondo 3D importato, serve a generare il gioco 3D */
export type WorldImport = {
  id: string
  name: string
  /** celle mondo "x,z" occupate da oggetti non calpestabili */
  blocked: string[]
}

const SIZES = {
  piccolo: { w: 30, h: 20 },
  medio: { w: 42, h: 28 },
  grande: { w: 56, h: 38 },
}

const ENEMY_COLORS: Record<string, string> = {
  drone: '#00f0ff',
  soldato: '#ff5a8a',
  zombie: '#7cffb2',
  slime: '#a3ff12',
  guardiano: '#b26bff',
  golem: '#ffb43a',
  ratto: '#cd9663',
  turret: '#ff3355',
  boss: '#ff2bd6',
}

type Rng = () => number
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r() * arr.length)]
/** id entità deterministico dal seed: stesso seed → stessi id */
const sid = (r: Rng, n: number) => 'e' + n.toString(36) + Math.floor(r() * 1e9).toString(36)

export function generateGame(a: ScriptAnalysis, seed: number): GameProject {
  const r = rngFromSeed(seed)
  const { w, h } = SIZES[a.size]
  // layout scelto dal wizard, altrimenti derivato dall'ambientazione
  const layout: 'stanze' | 'citta' | 'caverne' | 'isola' =
    a.layout && a.layout !== 'auto'
      ? a.layout
      : a.paletteId === 'cyber'
        ? 'citta'
        : a.paletteId === 'spazio'
          ? 'caverne'
          : 'stanze'
  const sc =
    layout === 'citta'
      ? genCity(w, h, r)
      : layout === 'caverne'
        ? genCaves(w, h, r)
        : layout === 'isola'
          ? genIsland(w, h, r)
          : genRooms(w, h, r)

  // ---------- posizioni chiave ----------
  const playerStart = sc._start
  const goalPos = sc._goal
  const openCells = sc._open.filter(
    c => Math.hypot(c.x - playerStart.x, c.y - playerStart.y) > 4
  )
  shuffle(r, openCells)

  // ---------- entità ----------
  const entities: GameEntity[] = []

  // eroe
  entities.push({
    id: sid(r, 1),
    type: 'player',
    x: playerStart.x,
    y: playerStart.y,
    props: { name: a.protagonist, color: '#00f0ff' },
  })

  // portale obiettivo
  entities.push({
    id: sid(r, 2),
    type: 'goal',
    x: goalPos.x,
    y: goalPos.y,
    props: {},
  })

  // nemici: ruota tra i tipi richiesti
  const kinds = a.enemyKinds.length ? a.enemyKinds : ['soldato' as const]
  const nEnemies = Math.min(a.enemyCount, Math.floor(openCells.length * 0.5))
  for (let i = 0; i < nEnemies; i++) {
    const c = openCells[i % openCells.length]
    if (!c) break
    const kind = kinds[i % kinds.length]
    const cell = driftFrom(r, sc, c)
    entities.push({
      id: sid(r, 3),
      type: 'enemy',
      x: cell.x,
      y: cell.y,
      props: {
        kind,
        hp: kind === 'turret' ? 80 : 50 + ri(r, 0, 40),
        dmg: 10 + ri(r, 0, 8),
        color: ENEMY_COLORS[kind] ?? '#ff5a5a',
      },
    })
  }

  // boss vicino al portale (o davanti all'uscita)
  if (a.boss) {
    const cell = driftFrom(r, sc, goalPos, 2, 4)
    entities.push({
      id: sid(r, 4),
      type: 'enemy',
      x: cell.x,
      y: cell.y,
      props: { kind: 'boss', hp: 320, dmg: 26, speed: 1.9, color: '#ff2bd6' },
    })
  }

  // NPC con dialoghi costruiti dallo script
  const npcCell = driftFrom(r, sc, playerStart, 2, 4)
  const pages = buildPages(a)
  entities.push({
    id: sid(r, 5),
    type: 'npc',
    x: npcCell.x,
    y: npcCell.y,
    props: { name: 'ALLEATO', color: '#fcee0a', pages },
  })

  // chiavi se l'obiettivo è collezione
  if (a.objective === 'collezione') {
    const nKeys = 3
    for (let i = 0; i < nKeys; i++) {
      const c = openCells[(nEnemies + i * 3) % Math.max(1, openCells.length)]
      if (!c) break
      entities.push({
        id: sid(r, 6),
        type: 'item',
        x: c.x,
        y: c.y,
        props: { kind: 'chiave' },
      })
    }
  }

  // monete e pozioni sparse
  for (let i = 0; i < Math.floor(nEnemies * 0.9); i++) {
    const c = openCells[ri(r, 0, Math.max(0, openCells.length - 1))]
    if (!c) break
    entities.push({
      id: sid(r, 7),
      type: 'item',
      x: c.x,
      y: c.y,
      props: { kind: r() < 0.72 ? 'moneta' : 'pozione', amount: r() < 0.72 ? ri(r, 1, 3) : 25 },
    })
  }
  // casse nei quadranti lontani
  for (let i = 0; i < Math.max(2, Math.floor(w / 18)); i++) {
    const c = openCells[ri(r, Math.floor(openCells.length * 0.5), Math.max(0, openCells.length - 1))]
    if (!c) break
    entities.push({ id: sid(r, 8), type: 'item', x: c.x, y: c.y, props: { kind: 'cassa', amount: ri(r, 4, 9) } })
  }

  // decorazioni d'ambiente
  const decoKind =
    a.paletteId === 'cyber' ? ['neon', 'barile', 'lanterna'] : a.paletteId === 'horror' ? ['barile', 'lanterna'] : a.paletteId === 'fantasy' ? ['albero', 'barile'] : a.paletteId === 'deserto' ? ['barile'] : ['albero', 'neon']
  for (let i = 0; i < Math.floor(w * h / 90); i++) {
    const c = openCells[ri(r, 0, Math.max(0, openCells.length - 1))]
    if (!c) break
    const k = pick(r, decoKind)
    entities.push({
      id: sid(r, 9),
      type: 'deco',
      x: c.x,
      y: c.y,
      props: { kind: k as 'albero' | 'barile' | 'neon' | 'lanterna', solid: k === 'albero' || k === 'barile' },
    })
  }

  sc.scene.entities = entities
  // id scena deterministico: stesso seed → stesso progetto completo
  sc.scene.id = 'sc' + (seed >>> 0).toString(36)

  const intro = [
    `${a.protagonist}, ${a.settingLabel} ha bisogno di te.`,
    a.objective === 'boss'
      ? 'Trova e elimina il BOSS. Non tornare indietro.'
      : a.objective === 'collezione'
        ? 'Recupera le 3 chiavi sparse nel territorio, poi torna al portale.'
        : 'Raggiungi il portale dorato. Il resto è strada.',
    a.dialogues[0] ?? 'Buona fortuna.',
  ].filter(Boolean)

  return {
    kind: 'game2d',
    title: a.title,
    seed,
    settings: {
      playerHp: a.difficulty === 3 ? 90 : a.difficulty === 1 ? 140 : 110,
      playerDmg: a.difficulty === 3 ? 30 : a.difficulty === 1 ? 48 : 38,
      weapon: a.weapon,
      difficulty: a.difficulty,
      objective: a.objective,
      objectiveCount: a.objective === 'collezione' ? 3 : 1,
      paletteId: a.paletteId,
      intro,
      controlsHint: 'WASD muovi · SPAZIO attacca · E interagisci',
    },
    scenes: [sc.scene],
    startScene: sc.scene.id,
    sourceScript: a.raw,
    createdAt: new Date().toISOString(),
  }
}

// ---------- costruzione dialoghi ----------

function buildPages(a: ScriptAnalysis): string[] {
  const pages: string[] = []
  if (a.dialogues.length) pages.push(...a.dialogues)
  else {
    pages.push(
      `Ascolta, ${a.protagonist}: ${a.settingLabel} è caduta in mano ai nemici.`
    )
  }
  pages.push(
    a.objective === 'boss'
      ? 'Il BOSS si nasconde vicino al portale. Colpiscilo e non fermarti.'
      : a.objective === 'collezione'
        ? 'Servono 3 chiavi. Cerca nei punti più lontani, poi torna al portale.'
        : 'Il portale dorato è la via d\'uscita. Corri lì.'
  )
  pages.push(
    a.weapon === 'blaster'
      ? 'Hai il blaster: SPAZIO per sparare. Le pozioni curano, le casse contengono monete.'
      : 'Hai la spada: SPAZIO per colpire. Le pozioni curano, le casse contengono monete.'
  )
  return pages.slice(0, 4)
}

// ---------- layout: stanze stile dungeon (BSP) ----------

type Cell = { x: number; y: number }
type GenResult = {
  scene: GameScene
  _start: Cell
  _goal: Cell
  _open: Cell[]
}

function genRooms(w: number, h: number, r: Rng): GenResult {
  const sc = emptyScene('Livello 1', w, h)
  sc.tiles.fill(1) // tutto roccia, poi si scava
  const rooms: { x: number; y: number; w: number; h: number }[] = []
  const target = Math.max(4, Math.floor((w * h) / 140))

  const split = (x: number, y: number, rw: number, rh: number, depth: number) => {
    if (depth <= 0 || (rw < 14 && rh < 12) || rooms.length >= target) {
      if (rw >= 5 && rh >= 4) rooms.push({ x, y, w: rw, h: rh })
      return
    }
    const horiz = rw < rh ? false : rw > rh ? true : r() < 0.5
    if (horiz && rw >= 12) {
      const cut = 5 + Math.floor(r() * (rw - 10))
      split(x, y, cut, rh, depth - 1)
      split(x + cut, y, rw - cut, rh, depth - 1)
    } else if (!horiz && rh >= 10) {
      const cut = 4 + Math.floor(r() * (rh - 8))
      split(x, y, rw, cut, depth - 1)
      split(x, y + cut, rw, rh - cut, depth - 1)
    } else {
      if (rw >= 5 && rh >= 4) rooms.push({ x, y, w: rw, h: rh })
    }
  }
  split(1, 1, w - 2, h - 2, 4)

  const centers: Cell[] = []
  for (const room of rooms) {
    const rw = Math.max(3, room.w - 2 - ri(r, 0, 2))
    const rh = Math.max(3, room.h - 2 - ri(r, 0, 2))
    const rx = room.x + 1 + ri(r, 0, Math.max(0, room.w - rw - 1))
    const ry = room.y + 1 + ri(r, 0, Math.max(0, room.h - rh - 1))
    for (let yy = ry; yy < Math.min(ry + rh, h - 1); yy++)
      for (let xx = rx; xx < Math.min(rx + rw, w - 1); xx++)
        sc.tiles[yy * w + xx] = 0
    centers.push({ x: rx + Math.floor(rw / 2), y: ry + Math.floor(rh / 2) })
  }

  // corridoi L tra stanze consecutive
  for (let i = 1; i < centers.length; i++) {
    const a0 = centers[i - 1]
    const b0 = centers[i]
    if (r() < 0.5) {
      hcorr(sc, a0.x, b0.x, a0.y)
      vcorr(sc, a0.y, b0.y, b0.x)
    } else {
      vcorr(sc, a0.y, b0.y, a0.x)
      hcorr(sc, a0.x, b0.x, b0.y)
    }
  }

  addBorderWalls(sc, 1)
  keepLargestRegion(sc)
  const open = openList(sc)
  const start = centers[0]
  const goal = farthest(sc, start)
  return { scene: sc, _start: start, _goal: goal, _open: open }
}

// ---------- layout: città con strade e isolati ----------

function genCity(w: number, h: number, r: Rng): GenResult {
  const sc = emptyScene('Settore 1', w, h)
  sc.tiles.fill(0)

  // strade ogni 6-9 tile
  const xs: number[] = [0]
  let x = ri(r, 5, 8)
  while (x < w - 3) {
    xs.push(x)
    x += ri(r, 5, 9)
  }
  const ys: number[] = [0]
  let y = ri(r, 5, 8)
  while (y < h - 3) {
    ys.push(y)
    y += ri(r, 5, 9)
  }
  for (const gx of xs) for (let yy = 0; yy < h; yy++) sc.tiles[yy * w + gx] = 5
  for (const gy of ys) for (let xx = 0; xx < w; xx++) sc.tiles[gy * w + xx] = 5

  // isolati: edifici = blocchi di muro con buchi (cortili)
  for (let by = 0; by < ys.length - (ys[0] === 0 ? 1 : 0); by++) {
    for (let bx = 0; bx < xs.length - (xs[0] === 0 ? 1 : 0); bx++) {
      const x0 = xs[bx] + 1
      const y0 = ys[by] + 1
      const x1 = (xs[bx + 1] ?? w) - 1
      const y1 = (ys[by + 1] ?? h) - 1
      if (x1 - x0 < 2 || y1 - y0 < 2) continue
      if (r() < 0.14) continue // piazza aperta
      for (let yy = y0; yy <= Math.min(y1, h - 1); yy++)
        for (let xx = x0; xx <= Math.min(x1, w - 1); xx++) sc.tiles[yy * w + xx] = 1
      // cortile interno
      if (x1 - x0 >= 4 && y1 - y0 >= 4 && r() < 0.6) {
        const cx0 = x0 + 1 + ri(r, 0, x1 - x0 - 3)
        const cy0 = y0 + 1 + ri(r, 0, y1 - y0 - 3)
        const cw = ri(r, 1, 2)
        const chh = ri(r, 1, 2)
        for (let yy = cy0; yy < cy0 + chh; yy++)
          for (let xx = cx0; xx < cx0 + cw; xx++)
            if (xx < w - 1 && yy < h - 1) sc.tiles[yy * w + xx] = 0
      }
    }
  }

  // piazze aperte casuali
  for (let i = 0; i < Math.max(2, Math.floor(w / 22)); i++) {
    const px = ri(r, 2, w - 8)
    const py = ri(r, 2, h - 6)
    for (let yy = py; yy < py + 3; yy++)
      for (let xx = px; xx < px + 5; xx++)
        if (xx > 0 && yy > 0 && xx < w - 1 && yy < h - 1) sc.tiles[yy * w + xx] = 0
  }

  addBorderWalls(sc, 1)
  keepLargestRegion(sc)
  const open = openList(sc)
  const start = nearestWalkable(sc, { x: Math.floor(w / 2), y: Math.floor(h / 2) })
  const goal = farthest(sc, start)
  return { scene: sc, _start: start, _goal: goal, _open: open }
}

// ---------- layout: isola (erba, mare attorno, stagni e sentieri) ----------

function genIsland(w: number, h: number, r: Rng): GenResult {
  const sc = emptyScene('Isola', w, h)
  sc.tiles.fill(4) // erba ovunque

  // mare attorno (1-2 tile di profondità)
  const depth = w > 36 ? 2 : 1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y)
      if (d < depth) sc.tiles[y * w + x] = 2
    }

  // stagni interni
  for (let i = 0; i < Math.max(2, Math.floor((w * h) / 500)); i++) {
    const px = ri(r, 4, w - 5)
    const py = ri(r, 4, h - 5)
    const rad = ri(r, 2, 3)
    for (let yy = py - rad; yy <= py + rad; yy++)
      for (let xx = px - rad; xx <= px + rad; xx++) {
        if (yy <= 0 || xx <= 0 || yy >= h - 1 || xx >= w - 1) continue
        if (Math.hypot(xx - px, yy - py) <= rad + r() * 0.6)
          sc.tiles[yy * w + xx] = 2
      }
  }

  // sentieri in terra (road) tra punti casuali
  for (let i = 0; i < 3; i++) {
    let x = ri(r, 3, w - 4)
    let y = ri(r, 3, h - 4)
    const steps = ri(r, 20, 40)
    for (let s = 0; s < steps; s++) {
      if (sc.tiles[y * w + x] === 4) sc.tiles[y * w + x] = 5
      if (r() < 0.5) x += r() < 0.5 ? 1 : -1
      else y += r() < 0.5 ? 1 : -1
      x = Math.max(2, Math.min(w - 3, x))
      y = Math.max(2, Math.min(h - 3, y))
    }
  }

  keepLargestRegion(sc)
  const open = openList(sc)
  const start = nearestWalkable(sc, { x: Math.floor(w / 2), y: Math.floor(h / 2) })
  const goal = farthest(sc, start)
  return { scene: sc, _start: start, _goal: goal, _open: open }
}

// ---------- layout: caverne (automi cellulari) ----------

function genCaves(w: number, h: number, r: Rng): GenResult {
  const sc = emptyScene('Caverna 1', w, h)
  let grid = new Array(w * h)
    .fill(0)
    .map(() => (r() < 0.44 ? 1 : 0))
  for (let it = 0; it < 5; it++) {
    const next = [...grid]
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (!(dx === 0 && dy === 0)) n += grid[(y + dy) * w + (x + dx)]
        next[y * w + x] = n >= 5 ? 1 : 0
      }
    grid = next
  }
  sc.tiles = grid
  addBorderWalls(sc, 1)

  // laghi di acqua
  for (let i = 0; i < 3; i++) {
    const px = ri(r, 2, w - 4)
    const py = ri(r, 2, h - 4)
    const rad = ri(r, 1, 2)
    for (let yy = py - rad; yy <= py + rad; yy++)
      for (let xx = px - rad; xx <= px + rad; xx++) {
        if (xx <= 0 || yy <= 0 || xx >= w - 1 || yy >= h - 1) continue
        if (Math.hypot(xx - px, yy - py) <= rad && sc.tiles[yy * w + xx] === 0)
          sc.tiles[yy * w + xx] = 2
      }
  }

  keepLargestRegion(sc)
  const open = openList(sc)
  const start = nearestWalkable(sc, { x: Math.floor(w / 2), y: Math.floor(h / 2) })
  const goal = farthest(sc, start)
  return { scene: sc, _start: start, _goal: goal, _open: open }
}

// ---------- helper ----------

function hcorr(sc: GameScene, x0: number, x1: number, y: number) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    if (x <= 0 || x >= sc.w - 1) continue
    sc.tiles[y * sc.w + x] = 0
  }
}
function vcorr(sc: GameScene, y0: number, y1: number, x: number) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    if (y <= 0 || y >= sc.h - 1) continue
    sc.tiles[y * sc.w + x] = 0
  }
}

/** tile su cui si può camminare (per BFS di connessione) */
const WALK = [0, 3, 4, 5, 7]
const isWalk = (t: number) => WALK.includes(t)
/** tile "sicuri" per piazzare entità (no lava, no porte) */
const SAFE = [0, 4, 5]
const isSafe = (t: number) => SAFE.includes(t)

/** tiene SOLO la regione percorribile più grande: tutto il resto diventa
 *  muro. Garantisce che dallo start si raggiunga ogni cella utile. */
function keepLargestRegion(sc: GameScene) {
  const seen = new Array(sc.w * sc.h).fill(false)
  let best: number[] = []
  for (let i = 0; i < sc.w * sc.h; i++) {
    if (seen[i] || !isWalk(sc.tiles[i])) continue
    const q = [i]
    const comp: number[] = []
    seen[i] = true
    while (q.length) {
      const c = q.shift()!
      comp.push(c)
      const cx = c % sc.w
      const cy = Math.floor(c / sc.w)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= sc.w || ny >= sc.h) continue
        const ni = ny * sc.w + nx
        if (!seen[ni] && isWalk(sc.tiles[ni])) {
          seen[ni] = true
          q.push(ni)
        }
      }
    }
    if (comp.length > best.length) best = comp
  }
  const inBest = new Set(best)
  for (let i = 0; i < sc.w * sc.h; i++)
    if (isWalk(sc.tiles[i]) && !inBest.has(i)) sc.tiles[i] = 1
}

function openList(sc: GameScene): Cell[] {
  const out: Cell[] = []
  for (let y = 1; y < sc.h - 1; y++)
    for (let x = 1; x < sc.w - 1; x++)
      if (isSafe(sc.tiles[y * sc.w + x])) out.push({ x, y })
  return out
}

function nearestWalkable(sc: GameScene, c: Cell): Cell {
  let best = c
  let bd = Infinity
  for (let y = 1; y < sc.h - 1; y++)
    for (let x = 1; x < sc.w - 1; x++) {
      if (!isSafe(sc.tiles[y * sc.w + x])) continue
      const d = Math.hypot(x - c.x, y - c.y)
      if (d < bd) {
        bd = d
        best = { x, y }
      }
    }
  return best
}

function farthest(sc: GameScene, from: Cell): Cell {
  // BFS dal punto di partenza su tutti i tile percorribili
  const dist = new Map<number, number>()
  const q: number[] = [from.y * sc.w + from.x]
  dist.set(q[0], 0)
  let last = q[0]
  while (q.length) {
    const c = q.shift()!
    last = c
    const cx = c % sc.w
    const cy = Math.floor(c / sc.w)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= sc.w || ny >= sc.h) continue
      const ni = ny * sc.w + nx
      if (dist.has(ni) || !isWalk(sc.tiles[ni])) continue
      dist.set(ni, (dist.get(c) ?? 0) + 1)
      q.push(ni)
    }
  }
  return { x: last % sc.w, y: Math.floor(last / sc.w) }
}

function driftFrom(r: Rng, g: GenResult, c: Cell, min = 0, max = 2): Cell {
  // selezione DETERMINISTICA tra le celle della corona [min,max]:
  // 12 tentativi casuali su mappe grandi quasi sempre mancavano
  const ring = g._open.filter(x => {
    const d = Math.hypot(x.x - c.x, x.y - c.y)
    return d >= min && d <= max
  })
  if (ring.length) return ring[Math.floor(r() * ring.length)]
  return c
}

function shuffle<T,>(r: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ============================================================
// GIOCO 3D — il gioco nasce DENTRO un mondo importato dal
// reparto "Mondi 3D". La scena è una mappa schematica di
// missione: le sue tile (x,y) si mappano sulle coordinate del
// mondo; nemici, oggetti e portale compaiono lì nel 3D.
// ============================================================

export function generateGame3D(
  a: ScriptAnalysis,
  seed: number,
  world: WorldImport
): GameProject {
  const r = rngFromSeed(seed)
  const W = SCHEMATIC_SIZE
  const sc = emptyScene('Missione', W, W) // tutto pavimento: il mondo c'è già

  const blocked = new Set(world.blocked)
  const worldFree = (x: number, y: number) => {
    const [wx, wz] = [Math.round((x + 0.5) * (60 / W) - 30), Math.round((y + 0.5) * (60 / W) - 30)]
    return !blocked.has(`${wx},${wz}`)
  }

  // celle libere ( schematiche + mondo )
  const cells: { x: number; y: number }[] = []
  for (let y = 1; y < W - 1; y++)
    for (let x = 1; x < W - 1; x++) if (worldFree(x, y)) cells.push({ x, y })
  shuffle(r, cells)

  const start = cells.reduce((best, c) => {
    const d = Math.hypot(c.x - W / 2, c.y - W / 2)
    const bd = Math.hypot(best.x - W / 2, best.y - W / 2)
    return d < bd ? c : best
  }, cells[0] ?? { x: W >> 1, y: W >> 1 })

  const far = cells.reduce((best, c) => {
    const d = Math.hypot(c.x - start.x, c.y - start.y)
    const bd = Math.hypot(best.x - start.x, best.y - start.y)
    return d > bd ? c : best
  }, start)

  const open = cells.filter(c => Math.hypot(c.x - start.x, c.y - start.y) > 4)

  const entities: GameEntity[] = []
  entities.push({
    id: sid(r, 1),
    type: 'player',
    x: start.x,
    y: start.y,
    props: { name: a.protagonist, color: '#00f0ff' },
  })

  // portale (obiettivo "portale"/"collezione": si apre dopo le chiavi)
  if (a.objective !== 'boss') {
    entities.push({ id: sid(r, 2), type: 'goal', x: far.x, y: far.y, props: {} })
  }

  // nemici sparsi nel mondo
  const kinds = a.enemyKinds.length ? a.enemyKinds : ['soldato' as const]
  const nEnemies = Math.min(a.enemyCount, Math.floor(open.length * 0.5))
  for (let i = 0; i < nEnemies; i++) {
    const c = open[i % open.length]
    if (!c) break
    const kind = kinds[i % kinds.length]
    entities.push({
      id: sid(r, 3),
      type: 'enemy',
      x: c.x,
      y: c.y,
      props: {
        kind,
        hp: kind === 'turret' ? 80 : 50 + ri(r, 0, 40),
        dmg: 10 + ri(r, 0, 8),
        speed: kind === 'drone' ? 3.4 : kind === 'ratto' ? 3 : 2.2,
        color: ENEMY_COLORS[kind] ?? '#ff5a5a',
      },
    })
  }

  // BOSS lontano dal punto di partenza
  if (a.boss) {
    const c = far
    entities.push({
      id: sid(r, 4),
      type: 'enemy',
      x: Math.max(1, Math.min(W - 2, c.x + ri(r, -2, 2))),
      y: Math.max(1, Math.min(W - 2, c.y + ri(r, -2, 2))),
      props: { kind: 'boss', hp: 320, dmg: 26, speed: 2.6, color: '#ff2bd6' },
    })
  }

  // NPC alleato vicino allo start
  const npcCell = open.find(c => {
    const d = Math.hypot(c.x - start.x, c.y - start.y)
    return d >= 2 && d <= 5
  }) ?? open[0] ?? start
  entities.push({
    id: sid(r, 5),
    type: 'npc',
    x: npcCell.x,
    y: npcCell.y,
    props: { name: 'ALLEATO', color: '#fcee0a', pages: buildPages(a) },
  })

  // chiavi (obiettivo collezione)
  if (a.objective === 'collezione') {
    for (let i = 0; i < 3; i++) {
      const c = open[(nEnemies + i * 3 + 2) % Math.max(1, open.length)]
      if (!c) break
      entities.push({ id: sid(r, 6), type: 'item', x: c.x, y: c.y, props: { kind: 'chiave' } })
    }
  }

  // monete e pozioni sparse
  for (let i = 0; i < Math.floor(nEnemies * 0.9) + 4; i++) {
    const c = open[ri(r, 0, Math.max(0, open.length - 1))]
    if (!c) break
    entities.push({
      id: sid(r, 7),
      type: 'item',
      x: c.x,
      y: c.y,
      props: { kind: r() < 0.72 ? 'moneta' : 'pozione', amount: r() < 0.72 ? ri(r, 1, 3) : 25 },
    })
  }

  // casse in zone lontane
  for (let i = 0; i < 3; i++) {
    const c = open[ri(r, Math.floor(open.length * 0.5), Math.max(0, open.length - 1))]
    if (!c) break
    entities.push({ id: sid(r, 8), type: 'item', x: c.x, y: c.y, props: { kind: 'cassa', amount: ri(r, 4, 9) } })
  }

  sc.entities = entities
  sc.id = 'sc3d' + (seed >>> 0).toString(36)

  const intro = [
    `${a.protagonist}, il mondo «${world.name}» è la tua arena.`,
    a.objective === 'boss'
      ? 'Trova e elimina il BOSS che infesta questo mondo.'
      : a.objective === 'collezione'
        ? `Recupera le 3 chiavi sparse nel mondo, poi raggiungi il portale.`
        : 'Raggiungi il portale dorato in fondo al mondo.',
    a.dialogues[0] ?? 'Muoviti con WASD. Attacca con SPAZIO.',
  ].filter(Boolean)

  return {
    kind: 'game2d',
    title: a.title,
    seed,
    settings: {
      playerHp: a.difficulty === 3 ? 90 : a.difficulty === 1 ? 140 : 110,
      playerDmg: a.difficulty === 3 ? 30 : a.difficulty === 1 ? 48 : 38,
      weapon: a.weapon,
      difficulty: a.difficulty,
      objective: a.objective,
      objectiveCount: a.objective === 'collezione' ? 3 : 1,
      paletteId: a.paletteId,
      intro,
      controlsHint: 'WASD muovi · SPAZIO attacca · E interagisci · trascina il mouse per guardare',
      dimension: '3d',
      camera: a.camera,
      worldProjectId: world.id,
      worldProjectName: world.name,
    },
    scenes: [sc],
    startScene: sc.id,
    sourceScript: a.raw,
    createdAt: new Date().toISOString(),
  }
}
