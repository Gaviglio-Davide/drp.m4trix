'use client'

// ============================================================
// GAME PLAYER 3D — fa girare un gioco 3D del Game Studio.
// Il livello è un MONDO del reparto "Mondi 3D" importato al
// momento del gioco: oggetti, strade, terreno e stile restano
// quelli del mondo; sopra ci mette il combattimento:
// nemici con IA (pattuglia → inseguimento → attacco), torrette
// e droni che sparano, boss, monete/chiavi/pozioni/casse,
// portale obiettivo, HUD neon, dialoghi, prima o terza persona.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Button } from '@/components/ui/button'
import {
  GRID_HALF,
  VAST_HALF,
  parseState,
  terrainHeightAt,
  useWorld,
  type CustomAsset,
  type WorldObject as WO,
} from '@/lib/world-store'
import { decodeTerrain } from '@/lib/terrain'
import { getAssetDef } from '@/lib/assets'
import { getTheme } from '@/lib/scene-theme'
import { pbrMat } from '@/lib/pbr'
import { SkyDome, SculptedTerrain, IslandEnvironment, SunLight } from '../game/EditorScene'
import { useStructures, libraryAssetId } from '@/lib/structures-store'
import { fetchAuth } from '@/lib/http'
import { sfx, unlockAudio } from '@/lib/game2d/sfx'
import {
  gameDimension,
  schematicToWorld,
  type EntityKind,
  type GameProject,
} from '@/lib/game2d/types'
import { NoGLCard, webglSupported } from '../game/GLGuard'
import { vastHeight } from '@/lib/vastworld'
import VastWorld from '@/components/vastworld/VastWorld'
import {
  DEFAULT_COMBAT, defaultSkills, defaultSpells, RARITY_COLOR,
  type CombatOptions, type RpgConfig, type RpgItem, type RpgSpell,
  type SkillNode, type QuestState,
} from '@/lib/rpg/types'

const SPEED = 3.4
const RUN_SPEED = 6.4
const EYE_HEIGHT = 1.55

// v13: costanti del combattimento RPG
const DODGE_TIME = 0.34 // secondi di invulnerabilità
const DODGE_CD = 1.15
const DODGE_COST = 20
const DODGE_SPEED = 10.5
const PARRY_WINDOW = 0.46
const PARRY_CD = 1.5
const COMBO_WINDOW = 1100 // ms tra un colpo e l'altro per tenere la combo
const SPRINT_DRAIN = 12 // stamina/s in corsa

// interni delle case (tasche lontane dal mondo)
const POCKET_SPACING = 120
const POCKET_BASE = 3000

// tipo esteso: includo i tipi runtime extra
type Keys = { f: boolean; b: boolean; l: boolean; r: boolean; run: boolean }

// ---------- tipi del runtime ----------

type EnemyRT = {
  id: string
  kind: EntityKind
  x: number
  z: number
  homeX: number
  homeZ: number
  hp: number
  maxHp: number
  dmg: number
  speed: number
  color: string
  aggro: number
  flying: boolean
  turret: boolean
  boss: boolean
  cd: number
  wanderT: number
  dirX: number
  dirZ: number
  dead: boolean
  deadAt: number
  flash: number
  y: number
  stunT?: number // v13: stordito dopo una parata perfetta
}

type ProjRT = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  dmg: number
  ttl: number
  from: 'player' | 'enemy'
  color: string
}

type ItemRT = {
  id: string
  kind: EntityKind | 'rpgitem' // v13: 'rpgitem' = bottino dal catalogo RPG
  x: number
  z: number
  amount: number
  taken: boolean
  rpgId?: string // id dell'oggetto RPG (per kind 'rpgitem')
}

// v13: NPC con dialoghi ad albero e percorsi nel mondo
type NpcRT = {
  id: string
  name: string
  color: string
  x: number
  z: number
  homeX: number
  homeZ: number
  pages: string[] // fallback senza albero
  dialogueId: string | null // dialogo RPG collegato (per nome)
  route: { x: number; z: number }[] // waypoints in coordinate mondo
  routeLoop: boolean
  routeSpeed: number
  wpIdx: number
  waitT: number
}

// v13: porte che portano negli interni delle case
type DoorRT = {
  x: number
  z: number
  pocketIdx: number
  pocketX: number
  pocketZ: number
  sceneId: string
  backX: number
  backZ: number
}

type Runtime = {
  phase: 'play' | 'over'
  px: number
  pz: number
  py: number
  yaw: number
  hp: number
  maxHp: number
  coins: number
  keys: number
  enemies: EnemyRT[]
  projs: ProjRT[]
  items: ItemRT[]
  npc: { x: number; z: number; name: string; pages: string[] } | null
  npcs: NpcRT[] // v13: tutti i PNG del mondo
  doors: DoorRT[] // v13: porte verso gli interni
  interior: number | null // v13: tasca-interno attiva (null = fuori)
  doorLatch: number // v13: anti-riaggancio porta (timestamp)
  portal: { x: number; z: number; active: boolean } | null
  objective: string
  attack: number // timestamp dell'ultimo attacco
  weapon: 'spada' | 'blaster'
  playerDmg: number
  msg: string
  msgT: number
  ended: null | 'win' | 'lose'
  // ---- v13: sistemi RPG ----
  combat: CombatOptions
  rpg: RpgConfig
  stamina: number
  maxStamina: number
  staminaRegen: number
  mana: number
  maxMana: number
  dodgeT: number // invulnerabilità residua
  dodgeCd: number
  dodgeX: number
  dodgeZ: number
  parryT: number // finestra di parata residua
  parryCd: number
  riposteT: number // contrattacco dopo parata
  combo: number
  comboT: number // timestamp dell'ultimo colpo
  critPct: number
  dmgBonus: number
  def: number
  speedPct: number
  shieldT: number // scudo arcano residuo
  xp: number
  xpNext: number
  level: number
  skillPts: number
  skills: SkillNode[]
  bought: string[]
  spells: (RpgSpell & { cd: number; cd0: number })[]
  selSpell: number
  cast: number // timestamp del lancio magia
  inv: { itemId: string; count: number }[]
  weaponItemId: string | null
  armorItemId: string | null
  quests: QuestState[]
  dlg: { npcId: string; dialogueId: string; nodeId: string } | null
  lastOutX: number // posizione fuori dalla casa
  lastOutZ: number
}

type Props = {
  project: GameProject
  onExit: () => void
  onEdit?: () => void
}

type FloaterIn = { id: number; sx: number; sy: number; text: string; color: string }
type FloaterUI = FloaterIn & { t: number }

// ---------- helper di mondo ----------

function blockedCells(objects: WO[], customAssets: CustomAsset[]): Set<string> {
  const s = new Set<string>()
  for (const o of objects) {
    const def = getAssetDef(o.asset, customAssets)
    if (def && !def.walkable) s.add(`${o.x},${o.z}`)
  }
  return s
}

function groundHeightAt(x: number, z: number): number {
  const { objects, customAssets, terrain, vast } = useWorld.getState()
  const base = vast ? vastHeight(x, z, vast) : terrain ? terrainHeightAt(terrain, x, z) : 0
  const o = objects.find(p => p.x === Math.round(x) && p.z === Math.round(z))
  if (!o) return base
  const def = getAssetDef(o.asset, customAssets)
  if (!def || !def.walkable) return base
  return base + (def.walkHeight ?? 0)
}

function flashMsg(R: Runtime, m: string) {
  R.msg = m
  R.msgT = performance.now() + 2200
}

// ============================================================
// GIOCATORE (corpo procedurale) — terza o prima persona
// ============================================================

function PlayerController({
  rt,
  runRef,
  camMode,
  blocked,
}: {
  rt: React.MutableRefObject<Runtime>
  runRef: React.MutableRefObject<boolean>
  camMode: 'terza' | 'prima'
  blocked: Set<string>
}) {
  const group = useRef<THREE.Group>(null)
  const sword = useRef<THREE.Mesh>(null)
  const { camera: cam } = useThree()
  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, run: false })
  const dragging = useRef<{ x: number; yaw: number } | null>(null)
  const walkT = useRef(0)
  const moving = useRef(false)
  const facing = useRef(Math.PI)
  const stepT = useRef(0)

  // tastiera
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': keys.current.f = true; break
        case 'KeyS': case 'ArrowDown': keys.current.b = true; break
        case 'KeyA': case 'ArrowLeft': keys.current.l = true; break
        case 'KeyD': case 'ArrowRight': keys.current.r = true; break
        case 'ShiftLeft': case 'ShiftRight': keys.current.run = true; break
        case 'Space':
          if (runRef.current) {
            e.preventDefault()
            rt.current.attack = performance.now()
          }
          break
        // ---- v13: schivata, parata, magie ----
        case 'KeyE': {
          if (!runRef.current) break
          const R = rt.current
          if (!R.combat.dodge || R.dodgeCd > 0 || R.dodgeT > 0 || R.stamina < DODGE_COST) break
          R.stamina -= DODGE_COST
          R.dodgeCd = DODGE_CD
          R.dodgeT = DODGE_TIME
          const k = keys.current
          let ix = (k.r ? 1 : 0) - (k.l ? 1 : 0)
          let iz = (k.b ? 1 : 0) - (k.f ? 1 : 0)
          if (!ix && !iz) { ix = 0; iz = -1 } // in avanti di default
          const L = Math.hypot(ix, iz) || 1
          const sin = Math.sin(R.yaw)
          const cos = Math.cos(R.yaw)
          R.dodgeX = (-sin * -iz + cos * ix) / L
          R.dodgeZ = (-cos * -iz + -sin * ix) / L
          sfx.step()
          flashMsg(R, '🌀 Schivata!')
          break
        }
        case 'KeyF': {
          if (!runRef.current) break
          const R = rt.current
          if (!R.combat.parry || R.parryCd > 0) break
          R.parryCd = PARRY_CD
          R.parryT = PARRY_WINDOW
          sfx.step()
          break
        }
        case 'KeyQ': {
          if (runRef.current) rt.current.cast = performance.now()
          break
        }
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
          const idx = Number(e.code.slice(5)) - 1
          if (runRef.current && rt.current.spells[idx]) rt.current.selSpell = idx
          break
        }
      }
    }
    const up = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': keys.current.f = false; break
        case 'KeyS': case 'ArrowDown': keys.current.b = false; break
        case 'KeyA': case 'ArrowLeft': keys.current.l = false; break
        case 'KeyD': case 'ArrowRight': keys.current.r = false; break
        case 'ShiftLeft': case 'ShiftRight': keys.current.run = false; break
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [rt, runRef])

  // drag del mouse per ruotare la visuale
  useEffect(() => {
    const dn = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return
      dragging.current = { x: e.clientX, yaw: rt.current.yaw }
    }
    const mv = (e: PointerEvent) => {
      if (dragging.current)
        rt.current.yaw = dragging.current.yaw + (e.clientX - dragging.current.x) * 0.006
    }
    const upp = () => { dragging.current = null }
    window.addEventListener('pointerdown', dn)
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', upp)
    return () => {
      window.removeEventListener('pointerdown', dn)
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', upp)
    }
  }, [rt])

  // tasti virtuali del dpad touch
  useEffect(() => {
    const h = (e: Event) => {
      const ce = e as CustomEvent<{ code: string; down: boolean }>
      const { code, down } = ce.detail
      if (code === 'KeyW') keys.current.f = down
      if (code === 'KeyS') keys.current.b = down
      if (code === 'KeyA') keys.current.l = down
      if (code === 'KeyD') keys.current.r = down
      if (down && code === 'ATK') rt.current.attack = performance.now()
    }
    window.addEventListener('dpad3d', h as EventListener)
    return () => window.removeEventListener('dpad3d', h as EventListener)
  }, [rt])

  const canStand = (x: number, z: number) => {
    // v13: gli interni delle case sono fuori dal mondo: lì niente confini
    if (rt.current.interior != null) return !blocked.has(`${Math.round(x)},${Math.round(z)}`)
    const half = useWorld.getState().vast ? VAST_HALF : GRID_HALF
    if (Math.abs(x) > half || Math.abs(z) > half) return false
    return !blocked.has(`${Math.round(x)},${Math.round(z)}`)
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (!runRef.current) return
    const R = rt.current

    // ---- v13: ricariche e rigenerazioni ----
    if (R.dodgeCd > 0) R.dodgeCd = Math.max(0, R.dodgeCd - dt)
    if (R.parryCd > 0) R.parryCd = Math.max(0, R.parryCd - dt)
    if (R.parryT > 0) R.parryT = Math.max(0, R.parryT - dt)
    if (R.riposteT > 0 && performance.now() > R.riposteT) R.riposteT = 0
    if (R.shieldT > 0) R.shieldT = Math.max(0, R.shieldT - dt)
    for (const sp of R.spells) if (sp.cd > 0) sp.cd = Math.max(0, sp.cd - dt)
    R.mana = Math.min(R.maxMana, R.mana + dt * 3)

    const k = keys.current
    let ix = 0
    let iz = 0
    if (k.f) iz -= 1
    if (k.b) iz += 1
    if (k.l) ix -= 1
    if (k.r) ix += 1
    moving.current = ix !== 0 || iz !== 0

    let lastDx = 0
    let lastDz = 0
    if (R.dodgeT > 0) {
      // ---- v13: volteggio della schivata ----
      R.dodgeT = Math.max(0, R.dodgeT - dt)
      lastDx = R.dodgeX * DODGE_SPEED * dt
      lastDz = R.dodgeZ * DODGE_SPEED * dt
      const nx = R.px + lastDx
      const nz = R.pz + lastDz
      if (canStand(nx, R.pz)) R.px = nx
      if (canStand(R.px, nz)) R.pz = nz
      R.py += (groundHeightAt(R.px, R.pz) - R.py) * Math.min(1, dt * 12)
      facing.current = Math.atan2(lastDx, lastDz)
    } else if (moving.current) {
      const wantRun = k.run && R.combat.sprint && R.stamina > 1
      if (wantRun) R.stamina = Math.max(0, R.stamina - SPRINT_DRAIN * dt)
      const spdMul = 1 + R.speedPct / 100
      const speed = (wantRun ? RUN_SPEED : SPEED) * spdMul
      const yaw = R.yaw
      const sin = Math.sin(yaw)
      const cos = Math.cos(yaw)
      let dx = (-sin * -iz + cos * ix) * speed * dt
      let dz = (-cos * -iz + -sin * ix) * speed * dt
      const dl = Math.hypot(dx, dz)
      if (dl > speed * dt) {
        dx = (dx / dl) * speed * dt
        dz = (dz / dl) * speed * dt
      }
      lastDx = dx
      lastDz = dz
      const nx = R.px + dx
      const nz = R.pz + dz
      if (canStand(nx, R.pz)) R.px = nx
      if (canStand(R.px, nz)) R.pz = nz
      R.py += (groundHeightAt(R.px, R.pz) - R.py) * Math.min(1, dt * 10)
      walkT.current += dt * (wantRun ? 14 : 10)
      stepT.current += dt
      if (stepT.current > 0.34) { stepT.current = 0; sfx.step() }
    } else {
      walkT.current += dt * 2
    }
    // rigenerazione stamina (non mentre corri o schivi)
    const sprinting = moving.current && k.run && R.combat.sprint && R.stamina > 0
    if (!sprinting) R.stamina = Math.min(R.maxStamina, R.stamina + R.staminaRegen * dt)

    if (group.current) {
      group.current.position.set(R.px, R.py, R.pz)
      if (moving.current) {
        const target = Math.atan2(lastDx, lastDz)
        let diff = target - facing.current
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        facing.current += diff * Math.min(1, dt * 12)
      }
      group.current.rotation.y = facing.current
      group.current.visible = camMode === 'terza'
    }

    // camera
    if (camMode === 'prima') {
      cam.position.set(R.px, R.py + EYE_HEIGHT, R.pz)
      cam.rotation.set(0, R.yaw, 0, 'YXZ')
    } else {
      const camX = R.px + Math.sin(R.yaw) * 5.2
      const camZ = R.pz + Math.cos(R.yaw) * 5.2
      cam.position.lerp(new THREE.Vector3(camX, R.py + 2.6, camZ), Math.min(1, dt * 6))
      cam.lookAt(R.px, R.py + 1.2, R.pz)
    }

    // lama dell'attacco (feedback visivo)
    if (sword.current) {
      const since = performance.now() - R.attack
      const attacking = R.weapon === 'spada' && since < 220
      sword.current.visible = attacking
      if (attacking) sword.current.rotation.z = Math.sin(since / 40) * 0.9
    }
  })

  return (
    <group ref={group} visible={camMode === 'terza'}>
      <HeroBody walkT={walkT} moving={moving} />
      {/* arco della spada */}
      <mesh ref={sword} position={[0, 1.05, 0.75]} visible={false}>
        <torusGeometry args={[0.55, 0.045, 6, 16, Math.PI]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.85} />
      </mesh>
      {/* lucina dell'eroe in prima persona per vedere i muri vicini */}
      {camMode === 'prima' && <pointLight position={[0, 1.5, 0.4]} intensity={3} distance={9} color="#bfd8ff" />}
    </group>
  )
}

/** Corpo dell'eroe cyberpunk di serie (stesso stile del PlayMode) */
function HeroBody({
  walkT,
  moving,
}: {
  walkT: React.MutableRefObject<number>
  moving: React.MutableRefObject<boolean>
}) {
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)

  useFrame(() => {
    const t = walkT.current
    const mv = moving.current
    const swing = mv ? Math.sin(t) * 0.55 : 0
    const bob = mv ? Math.abs(Math.sin(t)) * 0.05 : Math.sin(t) * 0.02
    if (body.current) body.current.position.y = bob
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.8
    if (armR.current) armR.current.rotation.x = swing * 0.8
  })

  const tunic = pbrMat('tessuto', '#1c2b4a', { roughness: 0.95, rx: 1.4, ry: 1.4 })
  const pants = pbrMat('tessuto', '#121a2e', { roughness: 0.95, rx: 1, ry: 1 })
  const leather = pbrMat('legno', '#0e1626', { roughness: 0.82, rx: 0.8, ry: 0.8 })
  const boots = pbrMat('pelle', '#0c1220', { roughness: 0.8 })
  const skin = pbrMat('pelle', '#e2b48f', { roughness: 0.72 })
  const hairM = pbrMat('pelle', '#22262e', { roughness: 0.9 })
  const neon = pbrMat('metallo', '#00f0ff', { emissive: '#00f0ff', emissiveIntensity: 1.4 })

  return (
    <group ref={body}>
      <group ref={legL} position={[-0.085, 0.76, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.36, 4, 10]} />
          <primitive object={pants} attach="material" />
        </mesh>
        <mesh position={[0, -0.62, 0.02]} castShadow>
          <boxGeometry args={[0.11, 0.14, 0.16]} />
          <primitive object={boots} attach="material" />
        </mesh>
      </group>
      <group ref={legR} position={[0.085, 0.76, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <capsuleGeometry args={[0.055, 0.36, 4, 10]} />
          <primitive object={pants} attach="material" />
        </mesh>
        <mesh position={[0, -0.62, 0.02]} castShadow>
          <boxGeometry args={[0.11, 0.14, 0.16]} />
          <primitive object={boots} attach="material" />
        </mesh>
      </group>
      <mesh position={[0, 0.98, 0]} castShadow>
        <capsuleGeometry args={[0.135, 0.3, 6, 12]} />
        <primitive object={tunic} attach="material" />
      </mesh>
      <mesh position={[0, 0.83, 0]} castShadow>
        <cylinderGeometry args={[0.155, 0.165, 0.09, 12]} />
        <primitive object={leather} attach="material" />
      </mesh>
      <mesh position={[-0.13, 1.13, 0]} rotation={[0, 0, 0.4]} castShadow>
        <boxGeometry args={[0.09, 0.05, 0.16]} />
        <primitive object={leather} attach="material" />
      </mesh>
      <mesh position={[0.13, 1.13, 0]} rotation={[0, 0, -0.4]} castShadow>
        <boxGeometry args={[0.09, 0.05, 0.16]} />
        <primitive object={leather} attach="material" />
      </mesh>
      <group ref={armL} position={[-0.19, 1.13, 0]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <capsuleGeometry args={[0.042, 0.19, 4, 8]} />
          <primitive object={tunic} attach="material" />
        </mesh>
        <mesh position={[0, -0.28, 0]}>
          <sphereGeometry args={[0.042, 8, 6]} />
          <primitive object={skin} attach="material" />
        </mesh>
      </group>
      <group ref={armR} position={[0.19, 1.13, 0]}>
        <mesh position={[0, -0.13, 0]} castShadow>
          <capsuleGeometry args={[0.042, 0.19, 4, 8]} />
          <primitive object={tunic} attach="material" />
        </mesh>
        <mesh position={[0, -0.28, 0]}>
          <sphereGeometry args={[0.042, 8, 6]} />
          <primitive object={skin} attach="material" />
        </mesh>
      </group>
      <mesh position={[0, 1.28, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.07, 8]} />
        <primitive object={skin} attach="material" />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <sphereGeometry args={[0.115, 16, 14]} />
        <primitive object={skin} attach="material" />
      </mesh>
      <mesh position={[0, 1.44, -0.01]} castShadow>
        <sphereGeometry args={[0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
        <primitive object={hairM} attach="material" />
      </mesh>
      {/* visore neon: l'eroe cyberpunk di serie */}
      <mesh position={[0, 1.42, 0.1]}>
        <boxGeometry args={[0.15, 0.03, 0.02]} />
        <primitive object={neon} attach="material" />
      </mesh>
    </group>
  )
}

// ============================================================
// NEMICI
// ============================================================

function EnemyMesh({ e, rt }: { e: EnemyRT; rt: React.MutableRefObject<Runtime> }) {
  const group = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const bar = useRef<THREE.Mesh>(null)
  const t = useRef(Math.random() * 10)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const g = group.current
    if (!g) return
    t.current += dt
    if (e.dead) {
      const k = Math.max(0, 1 - (performance.now() - e.deadAt) / 600)
      g.scale.setScalar(0.001 + k * (e.boss ? 1.9 : 1))
      g.position.y = e.y - (1 - k) * 0.6
      if (k <= 0.01) g.visible = false
      return
    }
    g.position.set(e.x, e.y, e.z)
    const R = rt.current
    const dx = R.px - e.x
    const dz = R.pz - e.z
    if (Math.hypot(dx, dz) < e.aggro) g.rotation.y = Math.atan2(dx, dz)
    if (inner.current) {
      inner.current.position.y = e.flying
        ? Math.sin(t.current * 4) * 0.15
        : Math.abs(Math.sin(t.current * (e.boss ? 5 : 8))) * (e.speed > 0.1 ? 0.06 : 0)
      inner.current.scale.setScalar(e.flash > 0 ? 1.12 : 1)
      if (e.flash > 0) e.flash -= dt
    }
    if (bar.current) bar.current.scale.x = Math.max(0.001, e.hp / e.maxHp)
  })

  const barY = e.boss ? 2.9 : e.turret ? 1.5 : 2.1
  return (
    <group ref={group} position={[e.x, e.y, e.z]}>
      <group ref={inner}>
        <EnemyBody kind={e.kind} color={e.color} boss={e.boss} />
      </group>
      {/* barra vita sempre rivolta alla camera */}
      <Billboard position={[0, barY, 0]}>
        <mesh>
          <planeGeometry args={[0.95, 0.14]} />
          <meshBasicMaterial color="#04060d" />
        </mesh>
        <mesh ref={bar} position={[0, 0, 0.012]}>
          <planeGeometry args={[0.88, 0.085]} />
          <meshBasicMaterial color={e.color} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

function Billboard({
  children,
  position,
}: {
  children: React.ReactNode
  position?: [number, number, number]
}) {
  const ref = useRef<THREE.Group>(null)
  const { camera } = useThree()
  useFrame(() => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion)
  })
  return <group ref={ref} position={position}>{children}</group>
}

function EnemyBody({ kind, color, boss }: { kind: EntityKind; color: string; boss: boolean }) {
  const glow = useMemo(
    () => pbrMat('metallo', color, { emissive: color, emissiveIntensity: 1.2 }),
    [color]
  )
  const shell = useMemo(() => pbrMat('metallo', color, { metalness: 0.7, roughness: 0.4 }), [color])
  const dark = useMemo(() => pbrMat('metallo', '#10141f', { metalness: 0.6, roughness: 0.5 }), [])
  const s = boss ? 1.9 : 1

  switch (kind) {
    case 'drone':
      return (
        <group scale={s}>
          <mesh castShadow>
            <sphereGeometry args={[0.34, 16, 12]} />
            <primitive object={shell} attach="material" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.5, 0.04, 8, 24]} />
            <primitive object={dark} attach="material" />
          </mesh>
          <mesh position={[0, 0, 0.3]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <primitive object={glow} attach="material" />
          </mesh>
        </group>
      )
    case 'turret':
      return (
        <group scale={s}>
          <mesh position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.42, 0.52, 0.5, 10]} />
            <primitive object={dark} attach="material" />
          </mesh>
          <mesh position={[0, 0.72, 0]} castShadow>
            <sphereGeometry args={[0.26, 12, 10]} />
            <primitive object={shell} attach="material" />
          </mesh>
          <mesh position={[0, 0.72, 0.34]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
            <primitive object={shell} attach="material" />
          </mesh>
          <mesh position={[0, 0.72, 0.6]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <primitive object={glow} attach="material" />
          </mesh>
        </group>
      )
    case 'slime':
      return (
        <group scale={s} position={[0, 0.3, 0]}>
          <mesh castShadow scale={[1, 0.72, 1]}>
            <sphereGeometry args={[0.5, 16, 12]} />
            <meshStandardMaterial color={color} transparent opacity={0.85} roughness={0.2} emissive={color} emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[-0.14, 0.18, 0.36]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshBasicMaterial color="#04060d" />
          </mesh>
          <mesh position={[0.14, 0.18, 0.36]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshBasicMaterial color="#04060d" />
          </mesh>
        </group>
      )
    case 'golem':
    case 'guardiano':
    case 'boss':
      return (
        <group scale={s}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <capsuleGeometry args={[0.34, 0.6, 6, 12]} />
            <primitive object={shell} attach="material" />
          </mesh>
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.38, 0.42, 8]} />
            <primitive object={dark} attach="material" />
          </mesh>
          <mesh position={[0, 1.62, 0]} castShadow>
            <sphereGeometry args={[0.26, 14, 12]} />
            <primitive object={dark} attach="material" />
          </mesh>
          <mesh position={[0, 1.62, 0.2]}>
            <boxGeometry args={[0.3, 0.08, 0.04]} />
            <primitive object={glow} attach="material" />
          </mesh>
          {(kind === 'boss' || kind === 'guardiano') && (
            <>
              <mesh position={[-0.22, 1.92, 0]} rotation={[0, 0, 0.5]} castShadow>
                <coneGeometry args={[0.07, 0.34, 6]} />
                <primitive object={glow} attach="material" />
              </mesh>
              <mesh position={[0.22, 1.92, 0]} rotation={[0, 0, -0.5]} castShadow>
                <coneGeometry args={[0.07, 0.34, 6]} />
                <primitive object={glow} attach="material" />
              </mesh>
            </>
          )}
          <mesh position={[-0.42, 0.95, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.42, 4, 8]} />
            <primitive object={dark} attach="material" />
          </mesh>
          <mesh position={[0.42, 0.95, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.42, 4, 8]} />
            <primitive object={dark} attach="material" />
          </mesh>
        </group>
      )
    case 'ratto':
      return (
        <group scale={[s, s, s]} position={[0, 0.22, 0]}>
          <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.14, 0.34, 4, 8]} />
            <primitive object={shell} attach="material" />
          </mesh>
          <mesh position={[0, 0.05, 0.3]}>
            <sphereGeometry args={[0.11, 8, 8]} />
            <primitive object={dark} attach="material" />
          </mesh>
          <mesh position={[0, 0.05, 0.4]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <primitive object={glow} attach="material" />
          </mesh>
        </group>
      )
    default: // soldato, zombie, ecc.
      return (
        <group scale={s}>
          <mesh position={[0, 0.85, 0]} castShadow>
            <capsuleGeometry args={[0.24, 0.5, 6, 12]} />
            <primitive object={shell} attach="material" />
          </mesh>
          <mesh position={[0, 1.42, 0]} castShadow>
            <sphereGeometry args={[0.2, 12, 10]} />
            <primitive object={dark} attach="material" />
          </mesh>
          <mesh position={[0, 1.42, 0.16]}>
            <boxGeometry args={[0.24, 0.06, 0.03]} />
            <primitive object={glow} attach="material" />
          </mesh>
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.26, 0.4, 8]} />
            <primitive object={dark} attach="material" />
          </mesh>
          <mesh position={[-0.32, 0.9, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.34, 4, 8]} />
            <primitive object={shell} attach="material" />
          </mesh>
          <mesh position={[0.32, 0.9, 0]} castShadow>
            <capsuleGeometry args={[0.07, 0.34, 4, 8]} />
            <primitive object={shell} attach="material" />
          </mesh>
        </group>
      )
  }
}

// ============================================================
// OGGETTI RACCOGLIBILI + NPC + PORTALE
// ============================================================

function ItemMesh({ it }: { it: ItemRT }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(state => {
    const g = ref.current
    if (!g) return
    if (it.taken) { g.visible = false; return }
    g.rotation.y += 0.03
    g.position.y = groundHeightAt(it.x, it.z) + 0.55 + Math.sin(state.clock.elapsedTime * 2.4) * 0.1
  })
  const rpgItem = it.kind === 'rpgitem' && it.rpgId
    ? undefined // il colore viene dal catalogo sotto
    : null
  void rpgItem
  const color =
    it.kind === 'moneta' ? '#fcee0a'
      : it.kind === 'pozione' ? '#ff3366'
        : it.kind === 'chiave' ? '#ffd23a'
          : '#b9884f'
  return (
    <group ref={ref} position={[it.x, 0.6, it.z]}>
      {it.kind === 'moneta' && (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.05, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} metalness={0.8} roughness={0.25} />
        </mesh>
      )}
      {it.kind === 'pozione' && (
        <group>
          <mesh castShadow>
            <sphereGeometry args={[0.16, 12, 10]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.14, 8]} />
            <meshStandardMaterial color="#8a6a3a" />
          </mesh>
        </group>
      )}
      {it.kind === 'chiave' && (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.14, 0.04, 8, 18]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[0.05, 0.22, 0.05]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
      )}
      {it.kind === 'cassa' && (
        <group position={[0, -0.25, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.62, 0.5, 0.62]} />
            <meshStandardMaterial color="#5d4033" roughness={0.8} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.66, 0.08, 0.66]} />
            <meshStandardMaterial color="#3a2a1e" />
          </mesh>
          <mesh position={[0, 0, 0.32]}>
            <boxGeometry args={[0.1, 0.14, 0.04]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.8} />
          </mesh>
        </group>
      )}
      {it.kind === 'rpgitem' && <RpgItemOrb itemId={it.rpgId ?? ''} />}
      <pointLight color={color} intensity={2.2} distance={3.2} />
    </group>
  )
}

/** v13: bottino RPG — sfera luminosa col colore della rarità */
function RpgItemOrb({ itemId }: { itemId: string }) {
  // il catalogo è nel runtime del gioco: cerca tra gli oggetti del progetto
  const color = '#b26bff'
  void itemId
  return (
    <group>
      <mesh castShadow>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} metalness={0.6} roughness={0.2} />
      </mesh>
      <mesh rotation={[0.6, 0.4, 0]}>
        <torusGeometry args={[0.3, 0.03, 8, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

function NpcMesh({ npc }: { npc: NpcRT }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.set(npc.x, groundHeightAt(npc.x, npc.z) + Math.sin(clock.elapsedTime * 1.8) * 0.03, npc.z)
    }
  })
  const robe = pbrMat('tessuto', npc.color, { roughness: 0.9 })
  const skin = pbrMat('pelle', '#e2b48f', { roughness: 0.72 })
  return (
    <group ref={ref} position={[npc.x, 0, npc.z]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <coneGeometry args={[0.3, 1.0, 10]} />
        <primitive object={robe} attach="material" />
      </mesh>
      <mesh position={[0, 1.14, 0]} castShadow>
        <sphereGeometry args={[0.16, 12, 10]} />
        <primitive object={skin} attach="material" />
      </mesh>
      <pointLight color={npc.color} intensity={1.6} distance={3} />
    </group>
  )
}

function PortalMesh({ portal }: { portal: Runtime['portal'] }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state, dt) => {
    const g = ref.current
    if (!g || !portal) return
    g.visible = portal.active
    g.rotation.y += dt * 1.4
    g.position.y = groundHeightAt(portal.x, portal.z) + 1.15 + Math.sin(state.clock.elapsedTime * 2) * 0.08
  })
  if (!portal) return null
  return (
    <group ref={ref} position={[portal.x, 1.15, portal.z]}>
      <mesh castShadow>
        <torusGeometry args={[0.75, 0.1, 12, 32]} />
        <meshStandardMaterial color="#fcee0a" emissive="#fcee0a" emissiveIntensity={1.6} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.68, 24]} />
        <meshStandardMaterial color="#fcee0a" emissive="#fcee0a" emissiveIntensity={1.1} transparent opacity={0.32} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#fcee0a" intensity={6} distance={9} />
    </group>
  )
}

// ============================================================
// DIRETTORE DI GIOCO: IA nemici, proiettili, danni, obiettivi
// ============================================================

function Director({
  rt,
  runRef,
  onHud,
  onDialogue,
  onEnd,
  onFloater,
}: {
  rt: React.MutableRefObject<Runtime>
  runRef: React.MutableRefObject<boolean>
  onHud: (h: HudState) => void
  onDialogue: (d: DlgState | null) => void
  onEnd: (r: 'win' | 'lose') => void
  onFloater: (f: FloaterIn) => void
}) {
  const { camera, size } = useThree()
  const hudT = useRef(0)
  const dlgOpen = useRef(false)
  const npcLatch = useRef(false)

  const endNow = useCallback(
    (r: 'win' | 'lose') => {
      const R = rt.current
      if (R.phase === 'over') return
      R.phase = 'over'
      R.ended = r
      runRef.current = false
      if (r === 'win') sfx.win()
      else sfx.lose()
      onEnd(r)
    },
    [rt, runRef, onEnd]
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const R = rt.current
    if (!runRef.current || R.phase !== 'play') return
    const now = performance.now()

    // ---------- attacco del giocatore (v13: combo, critici, riposte) ----------
    if (R.attack > 0 && now - R.attack < 260) {
      R.attack = 0
      // combo: colpi ravvicinati si potenziano
      if (R.combat.combo && now - R.comboT < COMBO_WINDOW) R.combo = Math.min(3, R.combo + 1)
      else R.combo = 1
      R.comboT = now
      const crit = Math.random() * 100 < R.critPct
      const comboMul = 1 + (R.combo - 1) * 0.18
      const riposteMul = R.riposteT > 0 ? 2.5 : 1
      const dmg = Math.round((R.playerDmg + R.dmgBonus) * comboMul * (crit ? 2 : 1) * riposteMul)
      if (R.riposteT > 0) R.riposteT = 0
      if (R.weapon === 'spada') {
        sfx.attack()
        let hitAny = false
        for (const e of R.enemies) {
          if (e.dead) continue
          const dx = e.x - R.px
          const dz = e.z - R.pz
          const d = Math.hypot(dx, dz)
          if (d > 3 + (e.boss ? 1.2 : 0)) continue
          const ang = Math.atan2(dx, dz)
          let diff = ang - R.yaw
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          if (Math.abs(diff) > 1.5) continue
          hurtEnemy(R, e, dmg, onFloater, camera, size, endNow, crit)
          hitAny = true
        }
        if (!hitAny) {
          onFloater({ id: Math.random(), sx: size.width / 2, sy: size.height / 2 - 40, text: 'MANCATO', color: '#9aa3b8' })
        }
      } else {
        sfx.shoot()
        R.projs.push({
          x: R.px - Math.sin(R.yaw) * 0.5,
          y: R.py + 1.25,
          z: R.pz - Math.cos(R.yaw) * 0.5,
          vx: -Math.sin(R.yaw) * 17,
          vy: 0,
          vz: -Math.cos(R.yaw) * 17,
          dmg,
          ttl: 1.5,
          from: 'player',
          color: crit ? '#ffb43a' : '#00f0ff',
        })
      }
    }

    // ---------- v13: lancio della magia ----------
    if (R.cast > 0 && now - R.cast < 260 && R.combat.mana) {
      R.cast = 0
      const sp = R.spells[R.selSpell]
      if (sp && sp.cd <= 0) {
        if (R.mana < sp.mana) {
          flashMsg(R, ' Mana insufficiente!')
        } else {
          R.mana -= sp.mana
          sp.cd = sp.cd0
          sfx.shoot()
          if (sp.kind === 'proiettile') {
            R.projs.push({
              x: R.px - Math.sin(R.yaw) * 0.6,
              y: R.py + 1.3,
              z: R.pz - Math.cos(R.yaw) * 0.6,
              vx: -Math.sin(R.yaw) * 14,
              vy: 0,
              vz: -Math.cos(R.yaw) * 14,
              dmg: sp.dmg ?? 10,
              ttl: 1.8,
              from: 'player',
              color: sp.color,
            })
          } else if (sp.kind === 'cura') {
            const heal = sp.heal ?? 20
            R.hp = Math.min(R.maxHp, R.hp + heal)
            sfx.heal()
            addFloater(R, onFloater, camera, size, R.px, R.py + 2, R.pz, `+${heal}`, '#7cffb2')
          } else if (sp.kind === 'scudo') {
            R.shieldT = 6
            flashMsg(R, '🔵 Barriera arcana attiva!')
          } else if (sp.kind === 'area') {
            flashMsg(R, `💥 ${sp.name}!`)
            for (const e of R.enemies) {
              if (e.dead) continue
              if (Math.hypot(e.x - R.px, e.z - R.pz) < 7) {
                e.stunT = 0.8
                hurtEnemy(R, e, sp.dmg ?? 12, onFloater, camera, size, endNow, false)
              }
            }
          }
        }
      }
    }

    // ---------- nemici ----------
    for (const e of R.enemies) {
      if (e.dead) continue
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt)
      if (e.stunT && e.stunT > 0) {
        e.stunT = Math.max(0, e.stunT - dt)
        continue // stordito dopo la parata perfetta
      }
      const dx = R.px - e.x
      const dz = R.pz - e.z
      const dist = Math.max(0.001, Math.hypot(dx, dz))

      if (e.turret) {
        e.cd -= dt
        if (dist < 15 && e.cd <= 0) {
          e.cd = 1.7
          sfx.shoot()
          R.projs.push({
            x: e.x, y: e.y + 0.75, z: e.z,
            vx: (dx / dist) * 9, vy: 0, vz: (dz / dist) * 9,
            dmg: e.dmg, ttl: 2.2, from: 'enemy', color: e.color,
          })
        }
        continue
      }

      if (dist < e.aggro) {
        if (dist > (e.boss ? 2.3 : 1.6)) {
          e.x += (dx / dist) * e.speed * dt
          e.z += (dz / dist) * e.speed * dt
        } else {
          e.cd -= dt
          if (e.cd <= 0) {
            e.cd = 0.95
            damagePlayer(R, e.dmg, onFloater, camera, size, e)
          }
        }
        if (e.flying) {
          e.cd -= dt
          if (dist < 11 && e.cd <= 0) {
            e.cd = 2.1
            sfx.shoot()
            R.projs.push({
              x: e.x, y: e.y + 0.4, z: e.z,
              vx: (dx / dist) * 10, vy: 0, vz: (dz / dist) * 10,
              dmg: Math.max(6, Math.round(e.dmg * 0.7)), ttl: 2, from: 'enemy', color: e.color,
            })
          }
        }
      } else {
        // pattugliamento attorno al punto di spawn
        e.wanderT -= dt
        if (e.wanderT <= 0) {
          e.wanderT = 1.5 + Math.random() * 2
          const a = Math.random() * Math.PI * 2
          e.dirX = Math.cos(a)
          e.dirZ = Math.sin(a)
        }
        if (Math.hypot(e.x - e.homeX, e.z - e.homeZ) < 5.2) {
          e.x += e.dirX * e.speed * 0.45 * dt
          e.z += e.dirZ * e.speed * 0.45 * dt
        } else {
          e.dirX *= -1
          e.dirZ *= -1
        }
      }
      e.y = groundHeightAt(e.x, e.z) + (e.flying ? 1.7 : 0)
    }

    // ---------- proiettili ----------
    for (const p of R.projs) {
      p.ttl -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.from === 'player') {
        for (const e of R.enemies) {
          if (e.dead) continue
          if (Math.hypot(e.x - p.x, e.z - p.z) < (e.boss ? 1.2 : 0.75)) {
            p.ttl = 0
            hurtEnemy(R, e, p.dmg, onFloater, camera, size, endNow, false)
            break
          }
        }
      } else if (Math.hypot(R.px - p.x, R.pz - p.z) < 0.7 && Math.abs(R.py + 1 - p.y) < 1.7) {
        p.ttl = 0
        damagePlayer(R, p.dmg, onFloater, camera, size, null)
      }
      const far = R.interior != null ? POCKET_BASE + 400 : GRID_HALF + 1
      if (Math.abs(p.x) > far || Math.abs(p.z) > far) p.ttl = 0
    }
    if (R.projs.some(p => p.ttl <= 0)) R.projs = R.projs.filter(p => p.ttl > 0)

    // ---------- oggetti (v13: anche bottino RPG) ----------
    for (const it of R.items) {
      if (it.taken) continue
      if (Math.hypot(it.x - R.px, it.z - R.pz) < 1.25) {
        it.taken = true
        if (it.kind === 'moneta') { R.coins += it.amount || 1; sfx.pickup() }
        else if (it.kind === 'pozione') { R.hp = Math.min(R.maxHp, R.hp + (it.amount || 25)); sfx.heal() }
        else if (it.kind === 'chiave') { R.keys++; sfx.pickup(); flashMsg(R, '🔑 Chiave trovata!') }
        else if (it.kind === 'cassa') { R.coins += it.amount || 5; sfx.pickup() }
        else if (it.kind === 'rpgitem' && it.rpgId) {
          const item = (R.rpg.items ?? []).find(x => x.id === it.rpgId)
          if (item) {
            const slot = R.inv.find(x => x.itemId === item.id)
            if (slot) slot.count++
            else R.inv.push({ itemId: item.id, count: 1 })
            sfx.pickup()
            flashMsg(R, `${item.icon} Trovato: ${item.name}!`)
            addFloater(R, onFloater, camera, size, it.x, 1.5, it.z, item.icon + ' ' + item.name, RARITY_COLOR[item.rarity])
          }
        }
      }
    }

    // ---------- v13: PNG con percorsi e dialoghi ----------
    let nearestNpc: NpcRT | null = null
    let nearestD = Infinity
    for (const n of R.npcs) {
      if (n.route.length >= 2) {
        // cammina per le sue strade quando il giocatore è lontano
        const pd = Math.hypot(R.px - n.x, R.pz - n.z)
        if (pd > 6 && n.waitT <= 0) {
          const wp = n.route[n.wpIdx]
          const dx = wp.x - n.x
          const dz = wp.z - n.z
          const d = Math.hypot(dx, dz)
          if (d < 0.5) {
            n.waitT = 1.4
            n.wpIdx = (n.wpIdx + 1) % n.route.length
          } else {
            n.x += (dx / d) * n.routeSpeed * dt
            n.z += (dz / d) * n.routeSpeed * dt
          }
        } else if (n.waitT > 0) {
          n.waitT -= dt
        }
      }
      const nd = Math.hypot(n.x - R.px, n.z - R.pz)
      if (nd < nearestD) { nearestD = nd; nearestNpc = n }
    }
    if (nearestNpc && nearestD < 2.4) {
      if (!dlgOpen.current && !npcLatch.current) {
        dlgOpen.current = true
        runRef.current = false
        openNpcDialogue(R, nearestNpc, onDialogue)
      }
    }
    if (nearestD > 3.6) npcLatch.current = false

    // ---------- v13: porte verso gli interni delle case ----------
    if (now > R.doorLatch) {
      if (R.interior == null) {
        for (const d0 of R.doors) {
          if (Math.hypot(d0.x - R.px, d0.z - R.pz) < 1.7) {
            // entra nella casa
            R.lastOutX = R.px
            R.lastOutZ = R.pz
            R.px = d0.pocketX
            R.pz = d0.pocketZ - 3
            R.py = 0
            R.interior = d0.pocketIdx
            R.doorLatch = now + 900
            sfx.step()
            flashMsg(R, '🏠 Sei entrato in casa (premi ESC sugli interni per uscire dalla porta)')
            break
          }
        }
      } else {
        const d0 = R.doors[R.interior]
        if (d0 && Math.hypot(d0.pocketX - R.px, (d0.pocketZ + 5.6) - R.pz) < 1.9) {
          // esci dalla casa
          R.px = d0.backX
          R.pz = d0.backZ
          R.py = groundHeightAt(R.px, R.pz)
          R.interior = null
          R.doorLatch = now + 900
          sfx.step()
          flashMsg(R, 'Sei uscito dalla casa')
        }
      }
    }

    // ---------- portale / obiettivo ----------
    if (R.portal && R.interior == null) {
      R.portal.active = R.objective.startsWith('→') || R.keys >= 3
      if (
        R.portal.active &&
        Math.hypot(R.portal.x - R.px, R.portal.z - R.pz) < 1.7
      ) {
        endNow('win')
        return
      }
    }

    // ---------- HUD (throttle) ----------
    hudT.current -= dt
    if (hudT.current <= 0) {
      hudT.current = 0.12
      onHud({
        hp: Math.max(0, Math.round(R.hp)),
        maxHp: R.maxHp,
        coins: R.coins,
        keys: R.keys,
        msg: now < R.msgT ? R.msg : '',
        objective: R.quests.some(q => !q.done) ? R.quests.find(q => !q.done)!.title : R.objective,
        stamina: Math.round(R.stamina),
        maxStamina: R.maxStamina,
        mana: Math.round(R.mana),
        maxMana: R.maxMana,
        xp: R.xp,
        xpNext: R.xpNext,
        level: R.level,
        pts: R.skillPts,
        combo: R.comboT > 0 && now - R.comboT < COMBO_WINDOW ? R.combo : 0,
        shield: R.shieldT > 0,
        parryReady: R.parryCd <= 0,
        spellIdx: R.selSpell,
        spells: R.spells.map(sp => ({ icon: sp.icon, cd: Math.round(sp.cd * 10) / 10, mana: sp.mana })),
        quests: R.quests.map(q => ({ title: q.title, done: q.done })),
        invCount: R.inv.reduce((n, x) => n + x.count, 0),
        interior: R.interior != null,
      })
    }

    // ---------- sconfitta ----------
    if (R.hp <= 0 && R.phase === 'play') endNow('lose')
  })

  // il dialogo è stato chiuso: riparte il movimento
  useEffect(() => {
    const h = () => {
      dlgOpen.current = false
      npcLatch.current = true
      rt.current.dlg = null
      if (rt.current.phase !== 'over') runRef.current = true
    }
    window.addEventListener('dialogue3d-closed', h)
    return () => window.removeEventListener('dialogue3d-closed', h)
  }, [rt, runRef])

  return null
}

// ---------- v13: stato HUD esteso e dialoghi ----------

export type HudState = {
  hp: number; maxHp: number; coins: number; keys: number; msg: string; objective: string
  stamina: number; maxStamina: number
  mana: number; maxMana: number
  xp: number; xpNext: number; level: number; pts: number
  combo: number; shield: boolean; parryReady: boolean
  spellIdx: number; spells: { icon: string; cd: number; mana: number }[]
  quests: { title: string; done: boolean }[]
  invCount: number
  interior: boolean
}

export type DlgState = {
  name: string
  color: string
  text: string
  choices: { id: string; text: string }[]
  mode: 'tree' | 'pages'
} | null

/** apre il dialogo: albero RPG se collegato, altrimenti pagine semplici */
function openNpcDialogue(R: Runtime, npc: NpcRT, onDialogue: (d: DlgState | null) => void) {
  const dlg = npc.dialogueId ? (R.rpg.dialogues ?? []).find(x => x.id === npc.dialogueId) : null
  if (dlg && dlg.nodes.length) {
    R.dlg = { npcId: npc.id, dialogueId: dlg.id, nodeId: dlg.start }
    const node = dlg.nodes.find(n => n.id === dlg.start) ?? dlg.nodes[0]
    onDialogue({
      name: npc.name,
      color: npc.color,
      text: node.text,
      choices: node.choices.length
        ? node.choices.map(c => ({ id: c.id, text: c.text }))
        : [{ id: '__close', text: '(Congedati) ▸' }],
      mode: 'tree',
    })
  } else {
    R.dlg = null
    onDialogue({ name: npc.name, color: npc.color, text: npc.pages[0] ?? '...', choices: [{ id: '__next', text: 'Continua ▸' }], mode: 'pages' })
  }
}

/** v13: danno al giocatore con TUTTE le difese: schivata, parata, scudo, armatura */
function damagePlayer(
  R: Runtime,
  dmg: number,
  onFloater: (f: FloaterIn) => void,
  camera: THREE.Camera,
  size: { width: number; height: number },
  attacker: EnemyRT | null
) {
  // schivata: invulnerabilità totale
  if (R.dodgeT > 0) {
    addFloater(R, onFloater, camera, size, R.px, R.py + 2, R.pz, 'SCHIVATA!', '#7cffb2')
    return
  }
  // parata perfetta: danno nullo + contrattacco + nemico stordito
  if (R.parryT > 0 && attacker) {
    R.parryT = 0
    R.riposteT = performance.now() + 1600
    attacker.stunT = 1.4
    sfx.hit()
    addFloater(R, onFloater, camera, size, R.px, R.py + 2.1, R.pz, '⚡ PARRATA PERFETTA!', '#ffd23a')
    flashMsg(R, '⚡ Contrattacco pronto: colpisci ORA!')
    return
  }
  // scudo arcano
  if (R.shieldT > 0) dmg = Math.max(1, Math.round(dmg * 0.3))
  // armatura
  dmg = Math.max(1, Math.round(dmg - R.def))
  R.hp -= dmg
  sfx.hurt()
  addFloater(R, onFloater, camera, size, R.px, R.py + 1.9, R.pz, `-${dmg}`, '#ff3355')
  window.dispatchEvent(new Event('game3d-hurt'))
}

function hurtEnemy(
  R: Runtime,
  e: EnemyRT,
  dmg: number,
  onFloater: (f: FloaterIn) => void,
  camera: THREE.Camera,
  size: { width: number; height: number },
  endNow: (r: 'win' | 'lose') => void,
  crit = false
) {
  e.hp -= dmg
  e.flash = 0.14
  sfx.hit()
  addFloater(R, onFloater, camera, size, e.x, e.y + (e.boss ? 3.2 : 2.4), e.z, crit ? `💥 ${dmg}!` : `-${dmg}`, crit ? '#ffb43a' : '#ff5a7a')
  if (e.hp <= 0) {
    e.dead = true
    e.deadAt = performance.now()
    sfx.enemyDie()
    const coins = 1 + Math.floor(Math.random() * 3)
    R.coins += coins
    flashMsg(R, e.boss ? '☠ BOSS ELIMINATO!' : `Nemico eliminato · +${coins} ◈`)
    // ---- v13: XP, livelli e bottino ----
    if (R.combat.xp) {
      R.xp += Math.round((R.rpg.xpPerKill ?? 20) * (e.boss ? 5 : 1))
      while (R.xp >= R.xpNext) {
        R.xp -= R.xpNext
        R.level++
        R.xpNext = 60 * R.level
        R.skillPts++
        R.maxHp += 10
        R.hp = Math.min(R.maxHp, R.hp + 25)
        sfx.win()
        flashMsg(R, `⭐ LIVELLO ${R.level}! +1 punto abilità (TAB) · vita +10`)
      }
    }
    // bottino: probabilità di far cadere un oggetto del catalogo RPG
    const items = R.rpg.items ?? []
    if (items.length && Math.random() < (e.boss ? 0.9 : 0.18)) {
      const w = Math.random()
      const pool = items.filter(it =>
        w < 0.6 ? it.rarity === 'comune'
          : w < 0.85 ? it.rarity === 'raro'
            : w < 0.97 ? it.rarity === 'epico'
              : it.rarity === 'leggendario'
      )
      const drop = (pool.length ? pool : items)[Math.floor(Math.random() * (pool.length || items.length))]
      if (drop) {
        const ang = Math.random() * Math.PI * 2
        R.items.push({
          id: `loot_${Math.random().toString(36).slice(2, 8)}`,
          kind: 'rpgitem',
          x: e.x + Math.cos(ang) * 0.8,
          z: e.z + Math.sin(ang) * 0.8,
          amount: 1,
          taken: false,
          rpgId: drop.id,
        })
      }
    }
    if (e.boss && R.objective.startsWith('☠')) endNow('win')
  }
}

function hurtPlayer(
  R: Runtime,
  dmg: number,
  onFloater: (f: FloaterIn) => void,
  camera: THREE.Camera,
  size: { width: number; height: number }
) {
  R.hp -= dmg
  sfx.hurt()
  addFloater(R, onFloater, camera, size, R.px, R.py + 1.9, R.pz, `-${dmg}`, '#ff3355')
  window.dispatchEvent(new Event('game3d-hurt'))
}

function addFloater(
  R: Runtime,
  onFloater: (f: FloaterIn) => void,
  camera: THREE.Camera,
  size: { width: number; height: number },
  x: number,
  y: number,
  z: number,
  text: string,
  color: string
) {
  const v = new THREE.Vector3(x, y, z).project(camera)
  if (v.z > 1) return
  const sx = (v.x * 0.5 + 0.5) * size.width
  const sy = (-v.y * 0.5 + 0.5) * size.height
  onFloater({ id: Math.random(), sx, sy, text, color })
  void R
}

// proiettili renderizzati con una sola InstancedMesh
function Projectiles({ rt }: { rt: React.MutableRefObject<Runtime> }) {
  const pool = useRef<THREE.InstancedMesh>(null)
  const MAX = 48
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const col = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const m = pool.current
    if (!m) return
    const ps = rt.current.projs
    for (let i = 0; i < MAX; i++) {
      const p = ps[i]
      if (p) {
        dummy.position.set(p.x, p.y, p.z)
        dummy.scale.setScalar(p.from === 'player' ? 1 : 0.85)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
        m.setColorAt(i, col.set(p.color))
      } else {
        dummy.position.set(0, -100, 0)
        dummy.scale.setScalar(0.001)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
      }
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={pool} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <sphereGeometry args={[0.1, 8, 8]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </instancedMesh>
  )
}

// ============================================================
// MONDO IMPORTATO (oggetti del reparto Mondi 3D)
// ============================================================

function ImportedWorld() {
  const objects = useWorld(s => s.objects)
  const customAssets = useWorld(s => s.customAssets)
  const version = useWorld(s => s.terrainVersion)
  const terrain = useWorld(s => s.terrain)
  const vast = useWorld(s => s.vast)
  const groundY = useMemo(() => {
    void version
    return (x: number, z: number) =>
      vast ? vastHeight(x, z, vast) : terrain ? terrainHeightAt(terrain, x, z) : 0
  }, [terrain, vast, version])
  return (
    <group>
      {/* v13: con il MONDO VASTO il terreno infinito sostituisce il rettangolo */}
      {vast ? <VastWorld cfg={vast} /> : <SculptedTerrain />}
      {objects.map((o: WO) => {
        const def = getAssetDef(o.asset, customAssets)
        if (!def) return null
        const AssetRender = def.render
        return (
          <group key={o.id} position={[o.x, groundY(o.x, o.z), o.z]}>
            <AssetRender color={o.color} rot={o.rot} scale={o.scale} />
          </group>
        )
      })}
    </group>
  )
}

/** v13: interni delle case — stanze pronte nelle tasche lontane */
function HouseInteriors({ rt }: { rt: React.MutableRefObject<Runtime> }) {
  const doors = rt.current.doors
  if (!doors.length) return null
  return (
    <group>
      {doors.map((d0, i) => {
        const cx = d0.pocketX
        const cz = d0.pocketZ
        const wallMat = <meshStandardMaterial color="#b8a284" roughness={0.9} />
        const floorMat = <meshStandardMaterial color="#7a5c3e" roughness={0.85} />
        void i
        return (
          <group key={d0.sceneId} position={[cx, 0, cz]}>
            {/* pavimento */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
              <planeGeometry args={[12, 12]} />
              {floorMat}
            </mesh>
            {/* muri (gap per la porta sul lato +z) */}
            <mesh position={[0, 1.6, -6]} castShadow receiveShadow>
              <boxGeometry args={[12, 3.2, 0.3]} />
              {wallMat}
            </mesh>
            <mesh position={[-6, 1.6, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.3, 3.2, 12]} />
              {wallMat}
            </mesh>
            <mesh position={[6, 1.6, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.3, 3.2, 12]} />
              {wallMat}
            </mesh>
            <mesh position={[-3.9, 1.6, 6]} castShadow receiveShadow>
              <boxGeometry args={[4.2, 3.2, 0.3]} />
              {wallMat}
            </mesh>
            <mesh position={[3.9, 1.6, 6]} castShadow receiveShadow>
              <boxGeometry args={[4.2, 3.2, 0.3]} />
              {wallMat}
            </mesh>
            {/* tetto */}
            <mesh position={[0, 3.35, 0]} castShadow>
              <boxGeometry args={[12.6, 0.25, 12.6]} />
              <meshStandardMaterial color="#6b4a34" roughness={0.9} />
            </mesh>
            {/* porta di uscita luminosa sul lato +z */}
            <mesh position={[0, 1.1, 5.95]}>
              <boxGeometry args={[1.5, 2.2, 0.12]} />
              <meshStandardMaterial color="#fcee0a" emissive="#fcee0a" emissiveIntensity={0.65} transparent opacity={0.85} />
            </mesh>
            {/* torce */}
            <pointLight position={[-3.5, 2.4, -3.5]} color="#ffb46a" intensity={14} distance={11} />
            <pointLight position={[3.5, 2.4, 3.5]} color="#ffb46a" intensity={14} distance={11} />
            <mesh position={[-3.5, 2.4, -3.5]}>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshBasicMaterial color="#ffca7a" toneMapped={false} />
            </mesh>
            <mesh position={[3.5, 2.4, 3.5]}>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshBasicMaterial color="#ffca7a" toneMapped={false} />
            </mesh>
            {/* tavolo + sedie semplici */}
            <mesh position={[0, 0.55, -2]} castShadow>
              <boxGeometry args={[2.2, 0.12, 1.2]} />
              <meshStandardMaterial color="#8a6a48" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.25, -2]} castShadow>
              <cylinderGeometry args={[0.12, 0.16, 0.5, 8]} />
              <meshStandardMaterial color="#6b4a34" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** eroe GLB del mondo (se impostato) — solo terza persona */
function PlayerGlb({
  url,
  rt,
  runRef,
  camMode,
  blocked,
}: {
  url: string
  rt: React.MutableRefObject<Runtime>
  runRef: React.MutableRefObject<boolean>
  camMode: 'terza' | 'prima'
  blocked: Set<string>
}) {
  const { scene, animations } = useGLTF(url)
  const group = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const dragging = useRef<{ x: number; yaw: number } | null>(null)
  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, run: false })
  const facing = useRef(Math.PI)

  const cloned = useMemo(() => {
    const c = skeletonClone(scene)
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    const s = 1.7 / Math.max(size.y, 0.001)
    c.scale.setScalar(s)
    const box2 = new THREE.Box3().setFromObject(c)
    c.position.y = -box2.min.y
    c.position.x = -(box2.min.x + box2.max.x) / 2
    c.position.z = -(box2.min.z + box2.max.z) / 2
    return c
  }, [scene])

  const mixer = useMemo(() => new THREE.AnimationMixer(cloned), [cloned])
  const actionRef = useRef<ReturnType<THREE.AnimationMixer['clipAction']> | null>(null)
  useEffect(() => {
    const clip = animations[0]
    if (!clip) return
    const a = mixer.clipAction(clip)
    a.play()
    actionRef.current = a
    return () => { a.stop(); actionRef.current = null }
  }, [animations, mixer])

  // tastiera
  useEffect(() => {
    const set = (code: string, down: boolean) => {
      if (code === 'KeyW' || code === 'ArrowUp') keys.current.f = down
      if (code === 'KeyS' || code === 'ArrowDown') keys.current.b = down
      if (code === 'KeyA' || code === 'ArrowLeft') keys.current.l = down
      if (code === 'KeyD' || code === 'ArrowRight') keys.current.r = down
      if (code === 'ShiftLeft' || code === 'ShiftRight') keys.current.run = down
    }
    const down = (e: KeyboardEvent) => {
      set(e.code, true)
      // v13: schivata / parata / magia anche col personaggio GLB
      const R = rt.current
      if (e.code === 'KeyE' && runRef.current && R.combat.dodge && R.dodgeCd <= 0 && R.dodgeT <= 0 && R.stamina >= DODGE_COST) {
        R.stamina -= DODGE_COST
        R.dodgeCd = DODGE_CD
        R.dodgeT = DODGE_TIME
        let ix = (keys.current.r ? 1 : 0) - (keys.current.l ? 1 : 0)
        let iz = (keys.current.b ? 1 : 0) - (keys.current.f ? 1 : 0)
        if (!ix && !iz) { ix = 0; iz = -1 }
        const L = Math.hypot(ix, iz) || 1
        const sin = Math.sin(R.yaw)
        const cos = Math.cos(R.yaw)
        R.dodgeX = (-sin * -iz + cos * ix) / L
        R.dodgeZ = (-cos * -iz + -sin * ix) / L
        sfx.step()
      }
      if (e.code === 'KeyF' && runRef.current && R.combat.parry && R.parryCd <= 0) {
        R.parryCd = PARRY_CD
        R.parryT = PARRY_WINDOW
        sfx.step()
      }
      if (e.code === 'KeyQ' && runRef.current) R.cast = performance.now()
      if (/^Digit[1-4]$/.test(e.code) && runRef.current) {
        const idx = Number(e.code.slice(5)) - 1
        if (R.spells[idx]) R.selSpell = idx
      }
    }
    const up = (e: KeyboardEvent) => set(e.code, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [rt, runRef])

  // drag visuale
  useEffect(() => {
    const dn = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return
      dragging.current = { x: e.clientX, yaw: rt.current.yaw }
    }
    const mv = (e: PointerEvent) => {
      if (dragging.current) rt.current.yaw = dragging.current.yaw + (e.clientX - dragging.current.x) * 0.006
    }
    const upp = () => { dragging.current = null }
    window.addEventListener('pointerdown', dn)
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', upp)
    return () => {
      window.removeEventListener('pointerdown', dn)
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', upp)
    }
  }, [rt])

  // tasti virtuali touch
  useEffect(() => {
    const h = (e: Event) => {
      const ce = e as CustomEvent<{ code: string; down: boolean }>
      const { code, down } = ce.detail
      if (code === 'KeyW') keys.current.f = down
      if (code === 'KeyS') keys.current.b = down
      if (code === 'KeyA') keys.current.l = down
      if (code === 'KeyD') keys.current.r = down
    }
    window.addEventListener('dpad3d', h as EventListener)
    return () => window.removeEventListener('dpad3d', h as EventListener)
  }, [])

  const canStand = (x: number, z: number) => {
    if (rt.current.interior != null) return !blocked.has(`${Math.round(x)},${Math.round(z)}`)
    const half = useWorld.getState().vast ? VAST_HALF : GRID_HALF
    if (Math.abs(x) > half || Math.abs(z) > half) return false
    return !blocked.has(`${Math.round(x)},${Math.round(z)}`)
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    mixer.update(dt)
    if (!runRef.current) return
    const R = rt.current
    const a = actionRef.current
    const k = keys.current
    const mv = k.f || k.b || k.l || k.r
    if (a) a.paused = !mv

    // v13: ricariche e rigenerazioni (path GLB)
    if (R.dodgeCd > 0) R.dodgeCd = Math.max(0, R.dodgeCd - dt)
    if (R.parryCd > 0) R.parryCd = Math.max(0, R.parryCd - dt)
    if (R.parryT > 0) R.parryT = Math.max(0, R.parryT - dt)
    if (R.riposteT > 0 && performance.now() > R.riposteT) R.riposteT = 0
    if (R.shieldT > 0) R.shieldT = Math.max(0, R.shieldT - dt)
    for (const sp of R.spells) if (sp.cd > 0) sp.cd = Math.max(0, sp.cd - dt)
    R.mana = Math.min(R.maxMana, R.mana + dt * 3)

    let lastDx = 0
    let lastDz = 0
    if (R.dodgeT > 0) {
      R.dodgeT = Math.max(0, R.dodgeT - dt)
      lastDx = R.dodgeX * DODGE_SPEED * dt
      lastDz = R.dodgeZ * DODGE_SPEED * dt
      const nx = R.px + lastDx
      const nz = R.pz + lastDz
      if (canStand(nx, R.pz)) R.px = nx
      if (canStand(R.px, nz)) R.pz = nz
      R.py += (groundHeightAt(R.px, R.pz) - R.py) * Math.min(1, dt * 12)
      facing.current = Math.atan2(lastDx, lastDz) + Math.PI
    } else if (mv) {
      const wantRun = k.run && R.combat.sprint && R.stamina > 1
      if (wantRun) R.stamina = Math.max(0, R.stamina - SPRINT_DRAIN * dt)
      const spdMul = 1 + R.speedPct / 100
      const speed = (wantRun ? RUN_SPEED : SPEED) * spdMul
      const ix = (k.r ? 1 : 0) - (k.l ? 1 : 0)
      const iz = (k.b ? 1 : 0) - (k.f ? 1 : 0)
      const sin = Math.sin(R.yaw)
      const cos = Math.cos(R.yaw)
      let dx = (-sin * -iz + cos * ix) * speed * dt
      let dz = (-cos * -iz + -sin * ix) * speed * dt
      const dl = Math.hypot(dx, dz)
      if (dl > speed * dt) { dx = (dx / dl) * speed * dt; dz = (dz / dl) * speed * dt }
      lastDx = dx
      lastDz = dz
      const nx = R.px + dx
      const nz = R.pz + dz
      if (canStand(nx, R.pz)) R.px = nx
      if (canStand(R.px, nz)) R.pz = nz
      R.py += (groundHeightAt(R.px, R.pz) - R.py) * Math.min(1, dt * 10)
      if (!a && group.current) {
        // piccolo dondolio se il modello non ha animazioni
        group.current.position.y = R.py
      }
      const target = Math.atan2(lastDx, lastDz) + Math.PI
      let diff = target - facing.current
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      facing.current += diff * Math.min(1, dt * 12)
    }
    // rigenerazione stamina (path GLB)
    if (!(mv && k.run && R.combat.sprint)) R.stamina = Math.min(R.maxStamina, R.stamina + R.staminaRegen * dt)

    if (group.current) {
      group.current.position.set(R.px, R.py, R.pz)
      group.current.rotation.y = facing.current
      group.current.visible = camMode === 'terza'
    }

    if (camMode === 'prima') {
      camera.position.set(R.px, R.py + EYE_HEIGHT, R.pz)
      camera.rotation.set(0, R.yaw, 0, 'YXZ')
    } else {
      const camX = R.px + Math.sin(R.yaw) * 5.2
      const camZ = R.pz + Math.cos(R.yaw) * 5.2
      camera.position.lerp(new THREE.Vector3(camX, R.py + 2.6, camZ), Math.min(1, dt * 6))
      camera.lookAt(R.px, R.py + 1.2, R.pz)
    }
  })

  return (
    <group ref={group} visible={camMode === 'terza'}>
      <primitive object={cloned} dispose={null} />
    </group>
  )
}

// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================

export default function GamePlayer3D({ project, onExit, onEdit }: Props) {
  const camMode: 'terza' | 'prima' = project.settings.camera === 'prima' ? 'prima' : 'terza'
  const [phase, setPhase] = useState<'loading' | 'error' | 'intro' | 'play'>('loading')
  const [errMsg, setErrMsg] = useState('')
  const [worldLabel, setWorldLabel] = useState(project.settings.worldProjectName ?? '')
  const [hud, setHud] = useState<HudState>({
    hp: project.settings.playerHp,
    maxHp: project.settings.playerHp,
    coins: 0,
    keys: 0,
    msg: '',
    objective: '',
    stamina: 100, maxStamina: 100,
    mana: 50, maxMana: 50,
    xp: 0, xpNext: 60, level: 1, pts: 0,
    combo: 0, shield: false, parryReady: true,
    spellIdx: 0, spells: [],
    quests: [],
    invCount: 0,
    interior: false,
  })
  const [dialogue, setDialogue] = useState<DlgState>(null)
  const [end, setEnd] = useState<'win' | 'lose' | null>(null)
  const [floaters, setFloaters] = useState<FloaterUI[]>([])
  const [hurtFlash, setHurtFlash] = useState(false)
  const [runId, setRunId] = useState(0)
  const [showInv, setShowInv] = useState(false)
  const [showTree, setShowTree] = useState(false)
  const [, setTick] = useState(0) // rerender per inventario/albero
  const [glOK] = useState(() => webglSupported())

  const rtRef = useRef<Runtime | null>(null)
  const runRef = useRef(false)
  const downPos = useRef<{ x: number; y: number } | null>(null)

  const entities = project.scenes[0]?.entities ?? []

  // ---------- carica il mondo 3D (una volta) ----------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const id = project.settings.worldProjectId
        if (!id) throw new Error('Nessun mondo collegato a questo gioco 3D')
        const res = await fetchAuth(`/api/projects/${id}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.project) throw new Error('Mondo non trovato: forse è stato eliminato')
        const st = parseState(data.project.state)
        // modelli globali (come fa l'editor dei mondi)
        try {
          const mres = await fetchAuth('/api/models')
          if (mres.ok) {
            const md = await mres.json()
            for (const m of md.models ?? []) {
              if (!m.url) continue
              if (st.customAssets.some((a: CustomAsset) => a.url === m.url)) continue
              st.customAssets.push({ id: `m_${m.id}`, name: m.name, url: m.url, kind: 'glb', scale: m.scale ?? 1 })
            }
          }
        } catch { /* facoltativo */ }
        // strutture della libreria globale
        try {
          useStructures.getState().load()
          const have = new Set(st.customAssets.map((a: CustomAsset) => a.id))
          for (const s of useStructures.getState().structures) {
            const aid = libraryAssetId(s.id)
            if (!have.has(aid))
              st.customAssets.push({ id: aid, name: s.name, kind: 'structure', pieces: s.pieces.map(p => ({ ...p })) })
          }
        } catch { /* facoltativo */ }
        if (cancelled) return
        useWorld.setState({
          objects: st.objects,
          customAssets: st.customAssets,
          terrain: st.terrain ? decodeTerrain(st.terrain) : null,
          terrainVersion: useWorld.getState().terrainVersion + 1,
          worldStyle: 'realistico',
          playerAsset: st.playerAsset ?? null,
          skyboxUrl: st.skyboxUrl ?? null,
          vast: st.vast ?? null, // v13: MONDO VASTO del mondo collegato!
          brush: 'none',
          playMode: false,
          selectedAsset: null,
        })
        setWorldLabel(data.project.name)
        // v13: se c'è una STORIA RPG e nessuna intro, la storia diventa l'intro
        const story = project.settings.rpg?.story
        const hasIntro = !!(project.settings.intro && project.settings.intro.length) || !!(story && (story.logline || story.synopsis))
        setPhase(hasIntro ? 'intro' : 'play')
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : 'Errore di caricamento')
          setPhase('error')
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- costruisce il runtime (mondo pronto, o "ricomincia") ----------
  useEffect(() => {
    if (phase !== 'play' && phase !== 'intro') return
    const { objects, customAssets } = useWorld.getState()
    const blocked = blockedCells(objects, customAssets)
    const W = project.scenes[0]?.w ?? 32
    const H = project.scenes[0]?.h ?? 32
    const enemies: EnemyRT[] = []
    const items: ItemRT[] = []
    const npcs: NpcRT[] = []
    const doors: DoorRT[] = []
    let portal: Runtime['portal'] = null
    let start = { x: 0, z: 0 }
    const diff = project.settings.difficulty
    const aggro = diff === 3 ? 16 : diff === 2 ? 12 : 8
    const rpg = project.settings.rpg ?? {}
    const combat = { ...DEFAULT_COMBAT, ...(rpg.combat ?? {}) }

    // porte: ogni scena di destinazione diventa un "interno" (tasca lontana)
    const scenePocket = new Map<string, number>()
    const pocketOf = (sceneId: string) => {
      if (!scenePocket.has(sceneId)) scenePocket.set(sceneId, scenePocket.size)
      return scenePocket.get(sceneId)!
    }

    for (const e of entities) {
      const [wx, wz] = schematicToWorld(e.x, e.y, W, H)
      if (e.type === 'player') start = { x: wx, z: wz }
      else if (e.type === 'goal') portal = { x: wx, z: wz, active: true }
      else if (e.type === 'npc') {
        const name = e.props.name ?? 'ALLEATO'
        // collega il dialogo RPG tramite il nome del personaggio
        const char = (rpg.characters ?? []).find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase())
        const dlg = (rpg.dialogues ?? []).find(d => d.characterId === char?.id) ?? null
        const routeCfg = (rpg.routes ?? []).find(rr => rr.characterId === char?.id)
        const route = (routeCfg?.waypoints ?? []).map(w2 => schematicToWorld(w2.x, w2.y, W, H)).map(([a, b]) => ({ x: a, z: b }))
        npcs.push({
          id: e.id,
          name,
          color: char?.color ?? e.props.color ?? '#fcee0a',
          x: wx,
          z: wz,
          homeX: wx,
          homeZ: wz,
          pages: e.props.pages ?? ['Buona fortuna.'],
          dialogueId: dlg?.id ?? null,
          route,
          routeLoop: routeCfg?.loop ?? true,
          routeSpeed: routeCfg?.speed ?? 1.6,
          wpIdx: 0,
          waitT: 0,
        })
      } else if (e.type === 'door') {
        const target = e.props.targetScene
        if (target && project.scenes.some(s => s.id === target)) {
          const idx = pocketOf(target)
          doors.push({
            x: wx,
            z: wz,
            pocketIdx: idx,
            pocketX: POCKET_BASE + idx * POCKET_SPACING,
            pocketZ: 0,
            sceneId: target,
            backX: wx + 0.01,
            backZ: wz + 1.4,
          })
        }
      } else if (e.type === 'enemy') {
        const kind = e.props.kind ?? 'soldato'
        // le statistiche del personaggio RPG collegato (se boss/nemico) vincono
        const char = (rpg.characters ?? []).find(c => c.name.trim().toLowerCase() === (e.props.name ?? '').trim().toLowerCase() && (c.role === 'nemico' || c.role === 'boss'))
        enemies.push({
          id: e.id,
          kind,
          x: wx,
          z: wz,
          homeX: wx,
          homeZ: wz,
          hp: char?.hp ?? e.props.hp ?? 60,
          maxHp: char?.hp ?? e.props.hp ?? 60,
          dmg: char?.dmg ?? e.props.dmg ?? 10,
          speed: (e.props.speed ?? (kind === 'drone' ? 3.4 : 2.2)) * (char?.speed ?? 1),
          color: char?.color ?? e.props.color ?? '#ff5a5a',
          aggro,
          flying: kind === 'drone',
          turret: kind === 'turret',
          boss: kind === 'boss',
          cd: 0,
          wanderT: 0,
          dirX: 1,
          dirZ: 0,
          dead: false,
          deadAt: 0,
          flash: 0,
          y: 0,
          stunT: 0,
        })
      } else if (e.type === 'item') {
        items.push({ id: e.id, kind: e.props.kind ?? 'moneta', x: wx, z: wz, amount: e.props.amount ?? 1, taken: false })
      }
    }

    // oggetti e PNG degli interni delle case (dalle scene di destinazione)
    for (const d0 of doors) {
      const sc = project.scenes.find(s => s.id === d0.sceneId)
      if (!sc) continue
      const offX = d0.pocketX - schematicToWorld(Math.floor(sc.w / 2), Math.floor(sc.h / 2), sc.w, sc.h)[0]
      const offZ = d0.pocketZ - schematicToWorld(Math.floor(sc.w / 2), Math.floor(sc.h / 2), sc.w, sc.h)[1]
      for (const e2 of sc.entities) {
        const [ix, iz] = schematicToWorld(e2.x, e2.y, sc.w, sc.h)
        if (e2.type === 'item') {
          items.push({ id: `${d0.sceneId}_${e2.id}`, kind: e2.props.kind ?? 'moneta', x: ix + offX, z: iz + offZ, amount: e2.props.amount ?? 1, taken: false })
        } else if (e2.type === 'npc') {
          const name = e2.props.name ?? 'ALLEATO'
          const char = (rpg.characters ?? []).find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase())
          const dlg = (rpg.dialogues ?? []).find(d => d.characterId === char?.id) ?? null
          npcs.push({
            id: `${d0.sceneId}_${e2.id}`,
            name,
            color: char?.color ?? '#fcee0a',
            x: ix + offX,
            z: iz + offZ,
            homeX: ix + offX,
            homeZ: iz + offZ,
            pages: e2.props.pages ?? ['Che piacere avere ospiti!'],
            dialogueId: dlg?.id ?? null,
            route: [],
            routeLoop: true,
            routeSpeed: 1.4,
            wpIdx: 0,
            waitT: 0,
          })
        }
      }
    }

    // se il mondo è cambiato e qualcosa è finito dentro un oggetto, sposta i nemici
    for (const e of enemies) {
      let tries = 0
      while (blocked.has(`${Math.round(e.x)},${Math.round(e.z)}`) && tries < 24) {
        e.x = e.homeX + (Math.random() - 0.5) * 6
        e.z = e.homeZ + (Math.random() - 0.5) * 6
        tries++
      }
    }

    const objective =
      project.settings.objective === 'boss'
        ? '☠ Elimina il BOSS'
        : project.settings.objective === 'collezione'
          ? `🔑 Trova ${project.settings.objectiveCount} chiavi, poi il portale`
          : '→ Raggiungi il portale dorato'

    // ---- v13: statistiche, inventario, magie e abilità ----
    const spells = (rpg.spells && rpg.spells.length ? rpg.spells : combat.mana ? defaultSpells() : [])
      .map(sp => ({ ...sp, cd: 0, cd0: sp.cd }))
    const inv = (rpg.startItems ?? []).map(id => ({ itemId: id, count: 1 }))
    const itemById = (id: string) => (rpg.items ?? []).find(x => x.id === id)
    const weaponItem = (rpg.startItems ?? []).map(itemById).find(it => it?.kind === 'arma')
    const armorItem = (rpg.startItems ?? []).map(itemById).find(it => it?.kind === 'armatura')

    rtRef.current = {
      phase: 'play',
      px: start.x,
      pz: start.z,
      py: groundHeightAt(start.x, start.z),
      yaw: Math.PI,
      hp: project.settings.playerHp,
      maxHp: project.settings.playerHp,
      coins: 0,
      keys: 0,
      enemies,
      projs: [],
      items,
      npc: npcs[0] ? { x: npcs[0].x, z: npcs[0].z, name: npcs[0].name, pages: npcs[0].pages } : null,
      npcs,
      doors,
      interior: null,
      doorLatch: 0,
      portal: project.settings.objective === 'boss' ? null : portal,
      objective,
      attack: 0,
      weapon: project.settings.weapon,
      playerDmg: project.settings.playerDmg,
      msg: '',
      msgT: 0,
      ended: null,
      combat,
      rpg,
      stamina: 100,
      maxStamina: 100,
      staminaRegen: 9,
      mana: combat.mana ? 50 : 0,
      maxMana: combat.mana ? 50 : 0,
      dodgeT: 0,
      dodgeCd: 0,
      dodgeX: 0,
      dodgeZ: 0,
      parryT: 0,
      parryCd: 0,
      riposteT: 0,
      combo: 0,
      comboT: 0,
      critPct: 5,
      dmgBonus: (weaponItem?.dmg ?? 0),
      def: (armorItem?.def ?? 0),
      speedPct: 0,
      shieldT: 0,
      xp: 0,
      xpNext: 60,
      level: 1,
      skillPts: 0,
      skills: rpg.skills && rpg.skills.length ? rpg.skills : defaultSkills(),
      bought: [],
      spells,
      selSpell: 0,
      cast: 0,
      inv,
      weaponItemId: weaponItem?.id ?? null,
      armorItemId: armorItem?.id ?? null,
      quests: [],
      dlg: null,
      lastOutX: start.x,
      lastOutZ: start.z,
    }
    runRef.current = true
    return () => { runRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runId])

  // flash rosso quando vieni colpito
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const h = () => {
      setHurtFlash(true)
      t = setTimeout(() => setHurtFlash(false), 180)
    }
    window.addEventListener('game3d-hurt', h)
    return () => {
      window.removeEventListener('game3d-hurt', h)
      if (t) clearTimeout(t)
    }
  }, [])

  // floaters: auto-scadenza
  useEffect(() => {
    if (!floaters.length) return
    const t = setTimeout(() => setFloaters(f => f.filter(x => performance.now() - x.t < 900)), 300)
    return () => clearTimeout(t)
  }, [floaters])

  // ESC esce dal gioco (se non ci sono dialoghi o pannelli aperti)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && phase === 'play' && !dialogue && !end) {
        if (showInv) { setShowInv(false); return }
        if (showTree) { setShowTree(false); return }
        onExit()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phase, dialogue, end, onExit, showInv, showTree])

  // v13: I = inventario, T = albero abilità
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (phase !== 'play' || dialogue || end) return
      if (e.code === 'KeyI') { setShowInv(v => !v); setShowTree(false) }
      if (e.code === 'KeyT' || e.code === 'Tab') {
        e.preventDefault()
        setShowTree(v => !v)
        setShowInv(false)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phase, dialogue, end])

  const addFloaterUI = useCallback((f: FloaterIn) => {
    setFloaters(prev => [...prev.slice(-10), { ...f, t: performance.now() }])
  }, [])

  const onHud = useCallback((h: HudState) => {
    setHud(h)
  }, [])

  const onEnd = useCallback((r: 'win' | 'lose') => {
    setEnd(r)
    runRef.current = false
  }, [])

  const onDialogue = useCallback((d: DlgState) => {
    setDialogue(d)
  }, [])

  const closeDialogue = () => {
    setDialogue(null)
    window.dispatchEvent(new Event('dialogue3d-closed'))
  }

  // v13: scelta nel dialogo ad albero — applica l'effetto e avanza
  const chooseDialogue = (choiceId: string) => {
    const R = rtRef.current
    if (!R) { closeDialogue(); return }
    if (dialogue?.mode === 'pages' || choiceId === '__next') {
      // dialogo semplice a pagine: mostra la pagina successiva
      const npc = R.npcs.find(n => dialogue && n.name === dialogue.name)
      if (npc && dialogue) {
        const idx = npc.pages.indexOf(dialogue.text)
        if (idx >= 0 && idx < npc.pages.length - 1) {
          setDialogue({ ...dialogue, text: npc.pages[idx + 1] })
          return
        }
      }
      closeDialogue()
      return
    }
    if (!R.dlg) { closeDialogue(); return }
    const dlg = (R.rpg.dialogues ?? []).find(x => x.id === R.dlg!.dialogueId)
    const node = dlg?.nodes.find(n => n.id === R.dlg!.nodeId)
    const choice = node?.choices.find(c => c.id === choiceId)
    if (!dlg || !node || !choice) { closeDialogue(); return }
    // effetti della scelta
    const act = choice.action
    if (act?.kind === 'dai' && act.itemId) {
      const item = (R.rpg.items ?? []).find(x => x.id === act.itemId)
      if (item) {
        const slot = R.inv.find(x => x.itemId === item.id)
        if (slot) slot.count++
        else R.inv.push({ itemId: item.id, count: 1 })
        flashMsg(R, `${item.icon} ${item.name} ricevuto!`)
        sfx.pickup()
      }
    } else if (act?.kind === 'missione') {
      const qid = act.questId || `mission_${Date.now()}`
      if (!R.quests.some(q => q.id === qid)) {
        R.quests.push({ id: qid, title: `📜 ${dlg.title || 'Missione'}`, done: false })
        flashMsg(R, '📜 Nuova missione aggiunta!')
        sfx.pickup()
      }
    } else if (act?.kind === 'cura') {
      R.hp = R.maxHp
      R.stamina = R.maxStamina
      R.mana = R.maxMana
      sfx.heal()
      flashMsg(R, '💚 Ti senti rigenerato!')
    }
    // avanza o chiudi
    if (choice.next) {
      const next = dlg.nodes.find(n => n.id === choice.next)
      if (next) {
        R.dlg = { ...R.dlg, nodeId: next.id }
        setDialogue({
          name: dialogue?.name ?? '?',
          color: dialogue?.color ?? '#fcee0a',
          text: next.text,
          choices: next.choices.length
            ? next.choices.map(c => ({ id: c.id, text: c.text }))
            : [{ id: '__close', text: '(Congedati) ▸' }],
          mode: 'tree',
        })
        return
      }
    }
    closeDialogue()
  }

  // v13: usa/equipaggia un oggetto dall'inventario
  const useItem = (itemId: string) => {
    const R = rtRef.current
    if (!R) return
    const item = (R.rpg.items ?? []).find(x => x.id === itemId)
    const slot = R.inv.find(x => x.itemId === itemId)
    if (!item || !slot) return
    if (item.kind === 'pozione') {
      if (item.heal) R.hp = Math.min(R.maxHp, R.hp + item.heal)
      if (item.mana) R.mana = Math.min(R.maxMana, R.mana + item.mana)
      slot.count--
      if (slot.count <= 0) R.inv = R.inv.filter(x => x.itemId !== itemId)
      sfx.heal()
      flashMsg(R, `${item.icon} ${item.name} usata!`)
    } else if (item.kind === 'arma') {
      // togli il bonus dell'arma precedente e metti quella nuova
      const prev = (R.rpg.items ?? []).find(x => x.id === R.weaponItemId)
      R.dmgBonus -= prev?.dmg ?? 0
      R.weaponItemId = item.id
      R.dmgBonus += item.dmg ?? 0
      sfx.pickup()
      flashMsg(R, `⚔ ${item.name} equipaggiata (+${item.dmg ?? 0} danni)`)
    } else if (item.kind === 'armatura' || item.kind === 'amuleto') {
      const prev = (R.rpg.items ?? []).find(x => x.id === R.armorItemId)
      R.def -= prev?.def ?? 0
      R.armorItemId = item.id
      R.def += item.def ?? 0
      sfx.pickup()
      flashMsg(R, `🛡 ${item.name} indossata (+${item.def ?? 0} difesa)`)
    }
    setTick(t => t + 1)
  }

  // v13: compra un nodo dell'albero abilità
  const buySkill = (id: string) => {
    const R = rtRef.current
    if (!R) return
    const node = R.skills.find(s => s.id === id)
    if (!node || R.bought.includes(id)) return
    if (R.skillPts < node.cost) return
    if (!node.req.every(q => R.bought.includes(q))) return
    R.skillPts -= node.cost
    R.bought.push(id)
    const ef = node.effect
    if (ef.hp) { R.maxHp += ef.hp; R.hp += ef.hp }
    if (ef.dmg) R.dmgBonus += ef.dmg
    if (ef.stamina) { R.maxStamina += ef.stamina; R.stamina += ef.stamina }
    if (ef.mana) { R.maxMana += ef.mana; R.mana += ef.mana }
    if (ef.speed) R.speedPct += ef.speed
    if (ef.crit) R.critPct += ef.crit
    if (ef.regen) R.staminaRegen += ef.regen
    if (ef.spell) {
      const sp = defaultSpells().find(x => x.id === ef.spell)
      if (sp && !R.spells.some(x => x.id === sp.id)) R.spells.push({ ...sp, cd: 0, cd0: sp.cd })
    }
    sfx.win()
    flashMsg(R, `${node.icon} ${node.name} sbloccata!`)
    setTick(t => t + 1)
  }

  const vkey = (code: string, down: boolean) => {
    window.dispatchEvent(new CustomEvent('dpad3d', { detail: { code, down } }))
    unlockAudio()
  }

  const hpPct = Math.max(0, (hud.hp / hud.maxHp) * 100)

  if (!glOK) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[var(--site-bg)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <span className="neon-text text-sm font-bold uppercase">{project.title}</span>
          <Button size="sm" variant="outline" onClick={onExit}>✕ Esci</Button>
        </div>
        <div className="flex flex-1 items-center justify-center"><NoGLCard /></div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--site-bg)]"
      onPointerDown={e => {
        downPos.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={e => {
        // click breve (non drag) = attacco
        const d = downPos.current
        downPos.current = null
        if (!d || !runRef.current) return
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
        const el = e.target as HTMLElement
        if (el.closest('button') || el.closest('.cp-panel')) return
        if (rtRef.current && rtRef.current.phase === 'play')
          rtRef.current.attack = performance.now()
        unlockAudio()
      }}
    >
      {/* barra superiore */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="neon-text truncate font-[family-name:var(--font-display)] text-sm font-bold tracking-widest uppercase">
            {project.title}
          </span>
          <span className="cp-chip hidden sm:inline-block">🌍 {worldLabel}</span>
          <span className="cp-chip hidden md:inline-block">3D · {camMode === 'prima' ? 'prima persona' : 'terza persona'}</span>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button size="sm" variant="outline" onClick={onEdit} className="cp-btn">✎ Editor</Button>
          )}
          <Button size="sm" variant="outline" onClick={onExit} className="cp-btn">✕ Esci</Button>
        </div>
      </div>

      {/* HUD (v13: HP + stamina + mana + XP + livelli + magie) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[var(--tx-dim)]">HP</span>
          <div className="h-2.5 w-36 overflow-hidden rounded-sm bg-black/60 ring-1 ring-[var(--line)]">
            <div
              className="h-full transition-all"
              style={{
                width: `${hpPct}%`,
                background:
                  hpPct > 50 ? 'linear-gradient(90deg,#00ff9c,#7cffb2)'
                    : hpPct > 25 ? 'linear-gradient(90deg,#fcee0a,#ffb43a)'
                      : 'linear-gradient(90deg,#ff3355,#ff7a7a)',
                boxShadow: '0 0 8px rgba(255,255,255,0.35)',
              }}
            />
          </div>
          <span className="text-[var(--tx)]">{hud.hp}/{hud.maxHp}</span>
        </div>
        {/* stamina */}
        <div className="flex items-center gap-1">
          <span className="text-[var(--tx-dim)]" title="Stamina (corri con SHIFT, schiva con E)">STA</span>
          <div className="h-2 w-24 overflow-hidden rounded-sm bg-black/60 ring-1 ring-[var(--line)]">
            <div className="h-full bg-gradient-to-r from-yellow-500 to-yellow-300 transition-all" style={{ width: `${(hud.stamina / hud.maxStamina) * 100}%` }} />
          </div>
        </div>
        {/* mana */}
        {hud.maxMana > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[var(--tx-dim)]" title="Mana (lancia magie con Q)">MP</span>
            <div className="h-2 w-24 overflow-hidden rounded-sm bg-black/60 ring-1 ring-[var(--line)]">
              <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-300 transition-all" style={{ width: `${(hud.mana / hud.maxMana) * 100}%` }} />
            </div>
          </div>
        )}
        {/* XP e livello */}
        <div className="flex items-center gap-1">
          <span className="font-bold text-[#ffb43a]">Lv.{hud.level}</span>
          <div className="h-2 w-20 overflow-hidden rounded-sm bg-black/60 ring-1 ring-[var(--line)]" title="Esperienza">
            <div className="h-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all" style={{ width: `${Math.min(100, (hud.xp / hud.xpNext) * 100)}%` }} />
          </div>
          {hud.pts > 0 && <span className="cp-chip animate-pulse text-[10px] text-[#ffb43a]">⭐ {hud.pts} pt (TAB)</span>}
        </div>
        {/* slot magie */}
        {hud.spells.length > 0 && (
          <div className="flex items-center gap-1">
            {hud.spells.map((sp, i) => (
              <span
                key={i}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-sm ring-1 ${i === hud.spellIdx ? 'bg-[var(--primary-soft)] ring-[var(--neon)]' : 'bg-black/40 ring-[var(--line)] opacity-70'}`}
                title={`Tasto ${i + 1}: mana ${sp.mana}${sp.cd > 0 ? ` · ricarica ${sp.cd}s` : ''}`}
              >
                {sp.icon}
              </span>
            ))}
            <span className="text-[10px] text-[var(--tx-faint)]">Q lancia</span>
          </div>
        )}
        {hud.shield && <span title="Scudo attivo">🔵</span>}
        {hud.combo > 1 && <span className="font-black text-[#ff7a2b]">COMBO ×{hud.combo}</span>}
        <span className="text-[#fcee0a]">◈ {hud.coins}</span>
        <span className="text-[var(--neon)]">🔑 {hud.keys}{project.settings.objective === 'collezione' ? `/${project.settings.objectiveCount}` : ''}</span>
        <span className="ml-auto hidden text-[var(--tx-dim)] md:inline">{hud.objective}</span>
      </div>

      {/* scena 3D */}
      <div className="relative flex-1 overflow-hidden">
        {phase === 'loading' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[var(--site-bg)]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--neon)]" />
            <p className="text-sm text-[var(--tx-dim)]">Importo il mondo 3D…</p>
          </div>
        )}
        {phase === 'error' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--site-bg)] p-6">
            <div className="cp-panel cp-panel-neon max-w-md p-6 text-center">
              <p className="neon-text-2 mb-2 text-lg font-bold">Mondo non disponibile</p>
              <p className="text-sm text-[var(--tx-dim)]">{errMsg}</p>
              <Button className="cp-btn mt-4" onClick={onExit}>← Torna indietro</Button>
            </div>
          </div>
        )}

        {(phase === 'play' || phase === 'intro') && rtRef.current && (
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ fov: 55, near: 0.1, far: 500, position: [0, 3, 8] }}
            onContextMenu={e => e.preventDefault()}
          >
            <SceneContent
              rt={rtRef as React.MutableRefObject<Runtime>}
              runRef={runRef}
              camMode={camMode}
              project={project}
              onHud={onHud}
              onDialogue={onDialogue}
              onEnd={onEnd}
              onFloater={addFloaterUI}
              runId={runId}
            />
          </Canvas>
        )}

        {/* crosshair in prima persona */}
        {phase === 'play' && camMode === 'prima' && !end && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--neon)] shadow-[0_0_8px_var(--neon)]" />
          </div>
        )}

        {/* flash danno */}
        {hurtFlash && (
          <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 120px rgba(255,51,85,0.55)' }} />
        )}

        {/* messaggio flottante */}
        {hud.msg && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
            <div className="cp-panel cp-panel-neon px-4 py-2 text-sm text-[var(--tx)]">{hud.msg}</div>
          </div>
        )}

        {/* floaters danno */}
        {floaters.map(f => (
          <div
            key={f.id}
            className="pointer-events-none absolute z-10 select-none font-[family-name:var(--font-geist-mono)] text-sm font-black"
            style={{ left: f.sx, top: f.sy, color: f.color, textShadow: '0 1px 4px #000', transform: 'translate(-50%,-50%)' }}
          >
            {f.text}
          </div>
        ))}

        {/* intro (v13: usa la STORIA RPG se esiste) */}
        {phase === 'intro' && (() => {
          const story = project.settings.rpg?.story
          const introText = (project.settings.intro ?? []).length
            ? project.settings.intro!
            : [
                ...(story?.logline ? [story.logline] : []),
                ...(story?.synopsis ? [story.synopsis] : []),
              ]
          return (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
              <div className="cp-panel cp-panel-neon max-h-[85vh] w-full max-w-xl overflow-y-auto p-6">
                <div className="cp-chip cp-chip-active mb-3 w-fit">{story ? 'LA STORIA' : 'MISSIONE'}</div>
                {introText.map((p, i) => (
                  <p key={i} className="mb-2 whitespace-pre-line text-[15px] leading-relaxed text-[var(--tx)]">{p}</p>
                ))}
                {story?.chapters?.length ? (
                  <div className="mt-3 border-t border-[var(--line)] pt-2">
                    <p className="mb-1 text-xs font-bold text-[var(--tx-dim)]">CAPITOLO 1 — {story.chapters[0].title}</p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--tx-dim)]">{story.chapters[0].text}</p>
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-[var(--tx-faint)]">
                  WASD muovi · mouse guarda · SPAZIO/click attacca · SHIFT corri · E schiva · F parata · Q magia · I inventario · TAB abilità
                </p>
                <Button
                  className="cp-btn mt-4 bg-[var(--neon)] font-bold text-[#04060d]"
                  onClick={() => { unlockAudio(); setPhase('play') }}
                >
                  ▶ COMINCIA
                </Button>
              </div>
            </div>
          )
        })()}

        {/* dialogo (v13: albero con scelte) */}
        {dialogue && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
            <div className="cp-panel cp-panel-neon w-full max-w-2xl p-4">
              <div
                className="mb-1 font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.2em] uppercase"
                style={{ color: dialogue.color }}
              >
                ▸ {dialogue.name}
              </div>
              <p className="min-h-12 text-[15px] leading-relaxed text-[var(--tx)]">{dialogue.text}</p>
              <div className="mt-3 flex flex-col gap-1.5">
                {dialogue.choices.map(c => (
                  <button
                    key={c.id}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-left text-sm text-[var(--tx)] transition-colors hover:border-[var(--neon)] hover:bg-[var(--panel-hover)]"
                    onClick={() => chooseDialogue(c.id)}
                  >
                    ▸ {c.text}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  className="cp-chip hover:text-[var(--neon)]"
                  onClick={() => closeDialogue()}
                >
                  chiudi ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* v13: INVENTARIO (tasto I) */}
        {showInv && rtRef.current && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="cp-panel cp-panel-neon max-h-[80vh] w-full max-w-lg overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-black text-[var(--tx)]">🎒 Inventario</h3>
                <button className="cp-chip" onClick={() => setShowInv(false)}>chiudi ✕</button>
              </div>
              {(() => {
                const R = rtRef.current!
                if (!R.inv.length) return <p className="text-sm text-[var(--tx-dim)]">Zaino vuoto. Sconfiggi nemici per trovare bottino!</p>
                return (
                  <div className="flex flex-col gap-2">
                    {R.inv.map(slot => {
                      const it = (R.rpg.items ?? []).find(x => x.id === slot.itemId)
                      if (!it) return null
                      const equipped = R.weaponItemId === it.id || R.armorItemId === it.id
                      return (
                        <div key={it.id} className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2.5">
                          <span className="text-2xl">{it.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold" style={{ color: RARITY_COLOR[it.rarity] }}>
                              {it.name} {slot.count > 1 && <span className="text-[var(--tx-dim)]">×{slot.count}</span>}
                              {equipped && <span className="ml-1 text-[10px] text-[var(--neon)]">[equipaggiato]</span>}
                            </p>
                            <p className="text-[11px] text-[var(--tx-dim)]">
                              {it.dmg ? `⚔ ${it.dmg} · ` : ''}{it.def ? `🛡 ${it.def} · ` : ''}{it.heal ? `💚 ${it.heal} · ` : ''}{it.mana ? `🔮 ${it.mana} · ` : ''}{it.desc}
                            </p>
                          </div>
                          {it.kind === 'pozione' && (
                            <Button size="sm" className="cp-btn" onClick={() => useItem(it.id)}>Bevi</Button>
                          )}
                          {(it.kind === 'arma' || it.kind === 'armatura' || it.kind === 'amuleto') && (
                            <Button size="sm" className="cp-btn" disabled={equipped} onClick={() => useItem(it.id)}>
                              {equipped ? '✓' : 'Equipaggia'}
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              <p className="mt-3 text-[11px] text-[var(--tx-faint)]">
                Danni attuali: {rtRef.current.playerDmg + rtRef.current.dmgBonus} · difesa: {rtRef.current.def}
              </p>
            </div>
          </div>
        )}

        {/* v13: ALBERO ABILITÀ (tasto TAB) */}
        {showTree && rtRef.current && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="cp-panel cp-panel-neon max-h-[80vh] w-full max-w-2xl overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-black text-[var(--tx)]">🌳 Albero abilità</h3>
                <span className="cp-chip text-[#ffb43a]">⭐ {rtRef.current.skillPts} punti</span>
                <button className="cp-chip" onClick={() => setShowTree(false)}>chiudi ✕</button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {rtRef.current.skills.map(sk => {
                  const bought = rtRef.current!.bought.includes(sk.id)
                  const canBuy = !bought && rtRef.current!.skillPts >= sk.cost && sk.req.every(q => rtRef.current!.bought.includes(q))
                  const locked = !bought && !sk.req.every(q => rtRef.current!.bought.includes(q))
                  return (
                    <div
                      key={sk.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        bought ? 'border-[var(--neon)] bg-[var(--primary-soft)]'
                          : canBuy ? 'border-[var(--line)] bg-[var(--panel-soft)]'
                            : 'border-[var(--line)] bg-[var(--panel-soft)] opacity-50'}
                      `}
                    >
                      <span className="text-2xl">{sk.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[var(--tx)]">
                          {sk.name} <span className="text-[10px] font-normal text-[var(--tx-dim)]">costo {sk.cost}</span>
                        </p>
                        <p className="text-[11px] text-[var(--tx-dim)]">{sk.desc}</p>
                        {locked && <p className="text-[10px] text-[#ff7a7a]">richiede: {sk.req.map(q => rtRef.current!.skills.find(s => s.id === q)?.name ?? q).join(', ')}</p>}
                      </div>
                      {bought ? (
                        <span className="text-lg text-[var(--neon)]">✓</span>
                      ) : (
                        <Button size="sm" className="cp-btn" disabled={!canBuy} onClick={() => buySkill(sk.id)}>
                          Sblocca
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[11px] text-[var(--tx-faint)]">
                I punti abilità si guadagnano salendo di livello: uccidi nemici per XP!
              </p>
            </div>
          </div>
        )}

        {/* fine partita */}
        {end && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="cp-panel cp-panel-neon flex flex-col items-center gap-4 px-10 py-8 text-center">
              {end === 'win' ? (
                <>
                  <div className="neon-text font-[family-name:var(--font-display)] text-4xl font-black tracking-widest">VITTORIA</div>
                  <p className="text-sm text-[var(--tx-dim)]">Obiettivo completato con ◈ {hud.coins} monete raccolte.</p>
                </>
              ) : (
                <>
                  <div className="neon-text-2 font-[family-name:var(--font-display)] text-4xl font-black tracking-widest">GAME OVER</div>
                  <p className="text-sm text-[var(--tx-dim)]">Il tuo eroe è caduto nel mondo di {worldLabel}…</p>
                </>
              )}
              <div className="flex gap-2">
                <Button className="cp-btn" onClick={() => { setEnd(null); setRunId(i => i + 1) }}>↻ Ricomincia</Button>
                <Button variant="outline" className="cp-btn" onClick={onExit}>Esci</Button>
              </div>
            </div>
          </div>
        )}

        {/* dpad touch */}
        <div className="absolute bottom-4 left-4 grid grid-cols-3 gap-1 md:hidden">
          <span />
          <button className="h-12 w-12 bg-[var(--panel)] text-lg text-[var(--neon)] ring-1 ring-[var(--line)]"
            onTouchStart={() => vkey('KeyW', true)} onTouchEnd={() => vkey('KeyW', false)}>▲</button>
          <span />
          <button className="h-12 w-12 bg-[var(--panel)] text-lg text-[var(--neon)] ring-1 ring-[var(--line)]"
            onTouchStart={() => vkey('KeyA', true)} onTouchEnd={() => vkey('KeyA', false)}>◀</button>
          <button className="h-12 w-12 bg-[var(--panel)] text-lg text-[var(--neon)] ring-1 ring-[var(--line)]"
            onTouchStart={() => vkey('KeyS', true)} onTouchEnd={() => vkey('KeyS', false)}>▼</button>
          <button className="h-12 w-12 bg-[var(--panel)] text-lg text-[var(--neon)] ring-1 ring-[var(--line)]"
            onTouchStart={() => vkey('KeyD', true)} onTouchEnd={() => vkey('KeyD', false)}>▶</button>
        </div>
        <button
          className="absolute bottom-4 right-4 h-16 w-16 rounded-full bg-[var(--neon)] font-black text-[#04060d] shadow-[var(--glow)] md:hidden"
          onTouchStart={() => { unlockAudio(); vkey('ATK', true) }}
        >
          ATK
        </button>
      </div>

      {/* hint comandi */}
      <div className="hidden justify-center gap-4 border-t border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[11px] tracking-wider text-[var(--tx-faint)] lg:flex">
        <span><b className="text-[var(--neon)]">WASD</b> muovi</span>
        <span><b className="text-[var(--neon)]">SPAZIO/click</b> attacca</span>
        <span><b className="text-[var(--neon)]">SHIFT</b> corri</span>
        <span><b className="text-[var(--neon)]">E</b> schiva</span>
        <span><b className="text-[var(--neon)]">F</b> parata</span>
        <span><b className="text-[var(--neon)]">Q/1-4</b> magie</span>
        <span><b className="text-[var(--neon)]">I</b> zaino</span>
        <span><b className="text-[var(--neon)]">TAB</b> abilità</span>
        <span><b className="text-[var(--neon)]">ESC</b> esci</span>
      </div>
    </div>
  )
}

// scena dentro il Canvas
function SceneContent({
  rt,
  runRef,
  camMode,
  project,
  onHud,
  onDialogue,
  onEnd,
  onFloater,
  runId,
}: {
  rt: React.MutableRefObject<Runtime>
  runRef: React.MutableRefObject<boolean>
  camMode: 'terza' | 'prima'
  project: GameProject
  onHud: (h: HudState) => void
  onDialogue: (d: DlgState | null) => void
  onEnd: (r: 'win' | 'lose') => void
  onFloater: (f: FloaterIn) => void
  runId: number
}) {
  const style = useWorld(s => s.worldStyle)
  const theme = getTheme(style)
  const playerAsset = useWorld(s => s.playerAsset)
  const customAssets = useWorld(s => s.customAssets)
  const vast = useWorld(s => s.vast)
  const blocked = useMemo(
    () => blockedCells(useWorld.getState().objects, customAssets),
    [customAssets]
  )
  // v12: il personaggio principale scelto nel Game Studio ha la
  // priorità; altrimenti si usa quello scelto nell'editor dei mondi
  const settingsUrl = project.settings.playerModelUrl ?? null
  const playerCustom = settingsUrl
    ? { url: settingsUrl, name: project.settings.playerModelName ?? 'personaggio' }
    : playerAsset
      ? customAssets.find(a => a.id === playerAsset && a.url) ?? null
      : null
  const R = rt

  return (
    <>
      {vast ? null : <color attach="background" args={[theme.sky]} />}
      {vast ? null : <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />}
      {vast ? null : useWorld.getState().skyboxUrl ? (
        <SkyDome />
      ) : (
        <Sky sunPosition={theme.sunPosition} turbidity={theme.turbidity} rayleigh={theme.rayleigh} />
      )}
      {vast ? null : <SunLight />}
      {vast ? null : <IslandEnvironment />}
      <ImportedWorld />
      <HouseInteriors rt={R} />

      {playerCustom?.url ? (
        <Suspense fallback={null}>
          <PlayerGlb url={playerCustom.url} rt={R} runRef={runRef} camMode={camMode} blocked={blocked} />
        </Suspense>
      ) : (
        <PlayerController rt={R} runRef={runRef} camMode={camMode} blocked={blocked} />
      )}

      {R.current.enemies.map(e => (
        <EnemyMesh key={`e${runId}${e.id}`} e={e} rt={R} />
      ))}
      {R.current.items.map(it => <ItemMesh key={`i${runId}${it.id}`} it={it} />)}
      {R.current.npcs.map(n => <NpcMesh key={`n${runId}${n.id}`} npc={n} />)}
      <PortalMesh portal={R.current.portal} />
      <Projectiles rt={R} />
      <Director
        rt={R}
        runRef={runRef}
        onHud={onHud}
        onDialogue={onDialogue}
        onEnd={onEnd}
        onFloater={onFloater}
      />
    </>
  )
}
