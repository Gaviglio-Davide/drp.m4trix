// ============================================================
// darpon.m4trix — GAME STUDIO (motore 2D stile Godot/Unity)
// Tipi del progetto di gioco: scene, tile, entità, regole.
// Un GameProject è un JSON salvato nel DB come "progetto"
// con marker kind:'game2d' (nessuna migrazione necessaria).
// ============================================================

import type { RpgConfig } from '@/lib/rpg/types'
import { VAST_DEFAULT, type VastConfig } from '@/lib/vastworld'

export type EntityKind =
  | 'drone' // nemico volante, veloce
  | 'soldato' // nemico con spada
  | 'zombie'
  | 'slime'
  | 'guardiano' // nemico lento e duro
  | 'golem'
  | 'turret' // sparaproiettili fermo
  | 'ratto'
  | 'boss' // miniboss ingrandito
  | 'npc'
  | 'moneta'
  | 'pozione'
  | 'chiave'
  | 'cassa' // forziere: dà monete quando colpito
  | 'goal' // portale di fine livello
  | 'albero'
  | 'barile'
  | 'neon' // insegna decorativa
  | 'lanterna'
  | 'player'

export type EntityType =
  | 'player'
  | 'enemy'
  | 'npc'
  | 'item'
  | 'door'
  | 'goal'
  | 'deco'

export type EntityProps = {
  kind?: EntityKind
  name?: string
  color?: string
  hp?: number
  dmg?: number
  speed?: number
  aggro?: number // raggio di inseguimento in tile
  pages?: string[] // dialoghi NPC
  targetScene?: string // porta → id scena
  tx?: number // porta → arrivo x
  ty?: number // porta → arrivo y
  locked?: boolean // porta chiusa a chiave
  amount?: number // monete / cura
  solid?: boolean // decorazione solida (albero, barile)
}

export type GameEntity = {
  id: string
  type: EntityType
  x: number // tile
  y: number // tile
  props: EntityProps
}

/** Registro tile — vedi tiles.ts */
export type GameScene = {
  id: string
  name: string
  w: number
  h: number
  tiles: number[] // flat w*h
  entities: GameEntity[]
}

export type Objective = 'goal' | 'boss' | 'collezione'

export type GameSettings = {
  playerHp: number
  playerDmg: number
  weapon: 'spada' | 'blaster'
  difficulty: 1 | 2 | 3
  objective: Objective
  objectiveCount: number // chiavi/oggetti richiesti
  paletteId: PaletteId
  intro?: string[] // pagine mostrate all'avvio
  controlsHint?: string
  // ---- v9: dimensione del gioco ----
  dimension?: '2d' | '3d' // default '2d' (retrocompatibile)
  camera?: 'terza' | 'prima' // visuale dei giochi 3D
  worldProjectId?: string | null // mondo 3D importato dal reparto Mondi 3D
  worldProjectName?: string | null
  // ---- v12: personaggio principale + opzioni extra ----
  playerModelUrl?: string | null // GLB scelto tra i Progetti importati
  playerModelName?: string | null
  playerSpeed?: number // moltiplicatore velocità eroe (default 1)
  enemySpeed?: number // moltiplicatore velocità nemici (default 1)
  minimapOn?: boolean // minimappa durante il gioco (default: off)
  fogOn?: boolean // vignetta atmosfera (default: on)
  showEnemyHp?: boolean // barre HP sopra i nemici (default: on)
  // ---- v13: HUB RPG (storia, personaggi, dialoghi, oggetti,
  //      albero abilità, magie, percorsi PNG, case) ----
  rpg?: RpgConfig
  // ---- v14: MONDO VASTO del gioco (stile terzapersona) ----
  // Se presente, il gioco 3D genera il suo mondo vasto di natura
  // senza bisogno di importare un mondo dal reparto Mondi 3D.
  vast?: VastConfig | null
}

export type GameProject = {
  kind: 'game2d'
  title: string
  seed: number
  settings: GameSettings
  scenes: GameScene[]
  startScene: string
  sourceScript?: string // la sceneggiatura originale (se generato da script)
  createdAt?: string
  updatedAt?: string
}

// ---------- palette di ambientazione ----------

export type PaletteId = 'cyber' | 'fantasy' | 'horror' | 'spazio' | 'deserto'

export type Palette = {
  id: PaletteId
  name: string
  bg: string // fuori mappa
  floor: string
  floorAlt: string
  wall: string
  wallTop: string
  water: string
  waterGlow: string
  lava: string
  lavaGlow: string
  grass: string
  road: string
  door: string
  doorLocked: string
  goal: string
  fog: string // vignetta atmosfera
  neon: string
}

export const PALETTES: Record<PaletteId, Palette> = {
  cyber: {
    id: 'cyber',
    name: 'Città Neon',
    bg: '#04060c',
    floor: '#101624',
    floorAlt: '#0d1220',
    wall: '#1b2440',
    wallTop: '#2b3a66',
    water: '#062a4a',
    waterGlow: '#00f0ff',
    lava: '#3a0a2a',
    lavaGlow: '#ff2bd6',
    grass: '#0e2030',
    road: '#1a2233',
    door: '#00f0ff',
    doorLocked: '#ff2bd6',
    goal: '#fcee0a',
    fog: 'rgba(0,10,30,0.55)',
    neon: '#00f0ff',
  },
  fantasy: {
    id: 'fantasy',
    name: 'Regno di Pietra',
    bg: '#07090c',
    floor: '#20283a',
    floorAlt: '#1b2233',
    wall: '#3a4258',
    wallTop: '#55617e',
    water: '#123a5e',
    waterGlow: '#4da6ff',
    lava: '#5e1a08',
    lavaGlow: '#ff7a1a',
    grass: '#1c3320',
    road: '#3a3222',
    door: '#e8c35a',
    doorLocked: '#c23a3a',
    goal: '#fcee0a',
    fog: 'rgba(4,8,14,0.45)',
    neon: '#e8c35a',
  },
  horror: {
    id: 'horror',
    name: 'Zona Morta',
    bg: '#050507',
    floor: '#14151a',
    floorAlt: '#101116',
    wall: '#26262e',
    wallTop: '#3a3a46',
    water: '#0a1a1c',
    waterGlow: '#2a7a6a',
    lava: '#4a1010',
    lavaGlow: '#ff3b3b',
    grass: '#16201a',
    road: '#1c1c22',
    door: '#8fd0a0',
    doorLocked: '#c22a2a',
    goal: '#9cff9c',
    fog: 'rgba(2,3,6,0.72)',
    neon: '#7cffb2',
  },
  spazio: {
    id: 'spazio',
    name: 'Pianeta Alieno',
    bg: '#05040e',
    floor: '#181430',
    floorAlt: '#141028',
    wall: '#2c2252',
    wallTop: '#443580',
    water: '#0c2a4e',
    waterGlow: '#4de0ff',
    lava: '#4e1030',
    lavaGlow: '#ff4dd2',
    grass: '#173322',
    road: '#241c40',
    door: '#4de0ff',
    doorLocked: '#ff4dd2',
    goal: '#fcee0a',
    fog: 'rgba(10,4,30,0.55)',
    neon: '#b26bff',
  },
  deserto: {
    id: 'deserto',
    name: 'Rovine nel Deserto',
    bg: '#0a0805',
    floor: '#2e2618',
    floorAlt: '#282014',
    wall: '#4e4028',
    wallTop: '#6e5a3a',
    water: '#0e3a4a',
    waterGlow: '#3ac8d0',
    lava: '#5e2a08',
    lavaGlow: '#ff9a2a',
    grass: '#2a3320',
    road: '#4a3c26',
    door: '#e8c35a',
    doorLocked: '#c23a3a',
    goal: '#fcee0a',
    fog: 'rgba(20,12,4,0.5)',
    neon: '#ffb43a',
  },
}

// ---------- costanti di gioco ----------

export const PLAYER_BASE = {
  speed: 4.4, // tile/secondo
  radius: 0.32,
}

export const DIFFICULTY_MULT: Record<
  number,
  { enemyHp: number; enemyDmg: number; aggro: number }
> = {
  1: { enemyHp: 0.75, enemyDmg: 0.6, aggro: 4.5 },
  2: { enemyHp: 1, enemyDmg: 1, aggro: 5.5 },
  3: { enemyHp: 1.35, enemyDmg: 1.5, aggro: 7 },
}

/** id corto unico per entità */
export function eid(): string {
  return Math.random().toString(36).slice(2, 9)
}

/** RNG deterministico (mulberry32) — stesso seed → stesso gioco */
export function rngFromSeed(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** crea una scena vuota con pavimento */
export function emptyScene(
  name: string,
  w: number,
  h: number,
  id?: string
): GameScene {
  return {
    id: id ?? eid(),
    name,
    w,
    h,
    tiles: new Array(w * h).fill(0),
    entities: [],
  }
}

/** bordo di muri attorno alla scena */
export function addBorderWalls(sc: GameScene, tile = 1) {
  for (let x = 0; x < sc.w; x++) {
    sc.tiles[x] = tile
    sc.tiles[(sc.h - 1) * sc.w + x] = tile
  }
  for (let y = 0; y < sc.h; y++) {
    sc.tiles[y * sc.w] = tile
    sc.tiles[y * sc.w + sc.w - 1] = tile
  }
}

/** progetto di gioco vuoto, pronto per l'editor.
 *  v14: opts.dimension = '2d' (classico) oppure '3d' (Mondo Vasto terzapersona) */
export function newGameProject(
  title: string,
  opts?: { dimension?: '2d' | '3d' }
): GameProject {
  const dimension = opts?.dimension === '3d' ? '3d' : '2d'
  const sc = emptyScene('Livello 1', 36, 26)
  addBorderWalls(sc)
  sc.entities.push({
    id: eid(),
    type: 'player',
    x: Math.floor(sc.w / 2),
    y: Math.floor(sc.h / 2),
    props: { name: 'Eroe', color: '#00f0ff' },
  })
  return {
    kind: 'game2d',
    title,
    seed: Math.floor(Math.random() * 1e9),
    settings: {
      playerHp: 100,
      playerDmg: 34,
      weapon: 'spada',
      difficulty: 2,
      objective: 'goal',
      objectiveCount: 1,
      paletteId: 'cyber',
      intro: [],
      dimension,
      ...(dimension === '3d'
        ? {
            camera: 'terza' as const,
            // v14: il gioco 3D porta con sé un MONDO VASTO di sola natura
            vast: { ...VAST_DEFAULT, seed: Math.floor(Math.random() * 1e9) },
          }
        : {}),
    },
    scenes: [sc],
    startScene: sc.id,
    createdAt: new Date().toISOString(),
  }
}

/** dimensione effettiva del gioco ('2d' per i vecchi progetti) */
export function gameDimension(g: GameProject): '2d' | '3d' {
  return g.settings.dimension ?? '2d'
}

/** mappa schematica di missione per i giochi 3D:
 *  le coordinate tile (x,y) si mappano in linea retta sulle
 *  coordinate del mondo 3D [-GRID_HALF..GRID_HALF] */
export const SCHEMATIC_SIZE = 32

/** cella schematica → coordinate mondo (metri) */
export function schematicToWorld(
  x: number,
  y: number,
  w = SCHEMATIC_SIZE,
  h = SCHEMATIC_SIZE
): [number, number] {
  return [(x + 0.5) * (60 / w) - 30, (y + 0.5) * (60 / h) - 30]
}
