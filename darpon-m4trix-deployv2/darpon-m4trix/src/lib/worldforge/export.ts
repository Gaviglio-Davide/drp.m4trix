// ============================================================
// WORLD FORGE → GAME STUDIO: converte la mappa del mondo in un
// gioco giocabile: biomi → tile, città/villaggi → NPC, dungeon
// e caverne → livelli secondari raggiungibili tramite porte.
// ============================================================

import {
  addBorderWalls,
  eid,
  emptyScene,
  type GameEntity,
  type GameProject,
  type GameScene,
} from '@/lib/game2d/types'
import { B, type Site, type World } from './world'

function farthestFloor(sc: GameScene, from: { x: number; y: number }) {
  const dist = new Map<number, number>()
  const start = from.y * sc.w + from.x
  if (sc.tiles[start] !== 0) return { x: from.x, y: from.y }
  dist.set(start, 0)
  const q = [start]
  let last = start
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
      if (dist.has(ni) || sc.tiles[ni] !== 0) continue
      dist.set(ni, (dist.get(c) ?? 0) + 1)
      q.push(ni)
    }
  }
  return { x: last % sc.w, y: Math.floor(last / sc.w) }
}

/** costruisce una scena di gioco da un sito (dungeon/caverna) */
function siteToScene(site: Site): GameScene {
  const sc = emptyScene(site.name, site.w, site.h)
  let startCell = { x: 1, y: 1 }
  let found = false
  for (let y = 0; y < site.h; y++)
    for (let x = 0; x < site.w; x++) {
      const v = site.grid[y * site.w + x]
      sc.tiles[y * sc.w + x] = v === 1 ? 1 : v === 3 ? 2 : 0
      if (v === 2 && !found) {
        startCell = { x, y }
        found = true
      }
    }
  addBorderWalls(sc, 1)

  const entities: GameEntity[] = [
    { id: eid(), type: 'player', x: startCell.x, y: startCell.y, props: { name: 'Eroe', color: '#e8c35a' } },
  ]
  const goal = farthestFloor(sc, startCell)
  entities.push({ id: eid(), type: 'goal', x: goal.x, y: goal.y, props: {} })

  // nemici in stile dungeon
  const kinds: ('soldato' | 'guardiano' | 'slime' | 'ratto')[] =
    site.kind === 'dungeon' ? ['soldato', 'guardiano'] : ['slime', 'ratto']
  const floors: { x: number; y: number }[] = []
  for (let y = 1; y < sc.h - 1; y++)
    for (let x = 1; x < sc.w - 1; x++)
      if (sc.tiles[y * sc.w + x] === 0 && Math.hypot(x - startCell.x, y - startCell.y) > 4)
        floors.push({ x, y })
  const n = Math.min(10, Math.floor(floors.length / 8))
  for (let i = 0; i < n; i++) {
    const c = floors[Math.floor((i * floors.length) / Math.max(1, n))]
    if (!c) break
    entities.push({
      id: eid(),
      type: 'enemy',
      x: c.x,
      y: c.y,
      props: { kind: kinds[i % kinds.length], hp: 55, dmg: 12, color: kinds[i % kinds.length] === 'guardiano' ? '#b26bff' : '#ff5a8a' },
    })
  }
  for (let i = 0; i < 6; i++) {
    const c = floors[Math.floor((i * 37) % Math.max(1, floors.length))]
    if (c)
      entities.push({ id: eid(), type: 'item', x: c.x, y: c.y, props: { kind: i % 3 === 0 ? 'pozione' : 'moneta', amount: i % 3 === 0 ? 25 : 2 } })
  }
  const chest = floors[Math.floor(floors.length * 0.7)]
  if (chest)
    entities.push({ id: eid(), type: 'item', x: chest.x, y: chest.y, props: { kind: 'cassa', amount: 8 } })

  sc.entities = entities
  return sc
}

export function worldToGameProject(world: World): GameProject {
  const step = Math.max(1, Math.ceil(world.params.w / 64))
  const gw = Math.ceil(world.params.w / step)
  const gh = Math.ceil(world.params.h / step)
  const sc = emptyScene('Mondo', gw, gh)
  const trees: GameEntity[] = []

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      // campiona il bioma (media della zona)
      let counts = new Array(9).fill(0)
      for (let dy = 0; dy < step; dy++)
        for (let dx = 0; dx < step; dx++) {
          const sx = x * step + dx
          const sy = y * step + dy
          if (sx >= world.params.w || sy >= world.params.h) continue
          counts[world.biome[sy * world.params.w + sx]]++
        }
      const b = counts.indexOf(Math.max(...counts))
      let t = 4 // erba
      if (b === B.DEEP || b === B.WATER) t = 2
      else if (b === B.SAND) t = 0
      else if (b === B.GRASS) t = 4
      else if (b === B.FOREST) t = 0
      else if (b === B.HILL) t = 5
      else if (b === B.MOUNTAIN || b === B.SNOW) t = 1
      else if (b === B.ROAD) t = 5
      sc.tiles[y * sc.w + x] = t
      if (b === B.FOREST && (x * 7 + y * 13) % 3 === 0) {
        trees.push({ id: eid(), type: 'deco', x, y, props: { kind: 'albero', solid: true } })
      }
    }
  }
  addBorderWalls(sc, 1)

  const entities: GameEntity[] = []
  // start: prima città o centro
  const firstCity = world.settlements[0]
  const start = firstCity
    ? { x: Math.min(gw - 2, Math.floor(firstCity.x / step)), y: Math.min(gh - 2, Math.floor(firstCity.y / step)) }
    : { x: Math.floor(gw / 2), y: Math.floor(gh / 2) }
  entities.push({ id: eid(), type: 'player', x: start.x, y: start.y, props: { name: 'Esploratore', color: '#e8c35a' } })

  // NPC per ogni insediamento
  for (const s of world.settlements) {
    const px = Math.min(gw - 2, Math.floor(s.x / step))
    const py = Math.min(gh - 2, Math.floor(s.y / step))
    entities.push({
      id: eid(),
      type: 'npc',
      x: px,
      y: py,
      props: {
        name: s.name,
        color: '#fcee0a',
        pages: [
          `Benvenuto a ${s.name}, viandante!`,
          s.kind === 'city'
            ? 'Questa città è una delle più fiorenti del reame. Riposati e riparti!'
            : 'Un piccolo villaggio, ma la gente è buona. Cerca i dungeon oltre le colline.',
        ],
      },
    })
  }

  // porte verso dungeon e caverne
  const extraScenes: GameScene[] = []
  for (const site of world.sites) {
    const px = Math.min(gw - 2, Math.floor(site.x / step))
    const py = Math.min(gh - 2, Math.floor(site.y / step))
    const inner = siteToScene(site)
    extraScenes.push(inner)
    entities.push({
      id: eid(),
      type: 'door',
      x: px,
      y: py,
      props: { targetScene: inner.id, tx: inner.entities[0].x, ty: inner.entities[0].y },
    })
  }

  // portale obiettivo: il sito più lontano dallo start, o l'angolo opposto
  const goal =
    world.sites.length && world.sites[0]
      ? {
          x: Math.min(gw - 2, Math.floor(world.sites[0].x / step)),
          y: Math.min(gh - 2, Math.floor(world.sites[0].y / step)),
        }
      : { x: gw - 3, y: gh - 3 }
  entities.push({ id: eid(), type: 'goal', x: goal.x, y: goal.y, props: {} })

  sc.entities = [...entities, ...trees]

  const title = firstCity ? `Mondo di ${firstCity.name}` : 'Mondo Esplorato'
  return {
    kind: 'game2d',
    title,
    seed: world.params.seed,
    settings: {
      playerHp: 110,
      playerDmg: 38,
      weapon: 'spada',
      difficulty: 2,
      objective: 'goal',
      objectiveCount: 1,
      paletteId: 'fantasy',
      intro: [
        `Hai davanti ${gw}×${gh} leghe di terre inesplorate.`,
        'Parla con i villici, trova le porte dei dungeon e raggiungi il portale.',
      ],
    },
    scenes: [sc, ...extraScenes],
    startScene: sc.id,
    createdAt: new Date().toISOString(),
  }
}
