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

const SPEED = 3.4
const RUN_SPEED = 6.4
const EYE_HEIGHT = 1.55

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
  kind: EntityKind
  x: number
  z: number
  amount: number
  taken: boolean
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
  portal: { x: number; z: number; active: boolean } | null
  objective: string
  attack: number // timestamp dell'ultimo attacco
  weapon: 'spada' | 'blaster'
  playerDmg: number
  msg: string
  msgT: number
  ended: null | 'win' | 'lose'
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
  const { objects, customAssets, terrain } = useWorld.getState()
  const base = terrain ? terrainHeightAt(terrain, x, z) : 0
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
    if (Math.abs(x) > GRID_HALF || Math.abs(z) > GRID_HALF) return false
    return !blocked.has(`${Math.round(x)},${Math.round(z)}`)
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (!runRef.current) return
    const R = rt.current

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
    if (moving.current) {
      const speed = k.run ? RUN_SPEED : SPEED
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
      walkT.current += dt * (k.run ? 14 : 10)
      stepT.current += dt
      if (stepT.current > 0.34) { stepT.current = 0; sfx.step() }
    } else {
      walkT.current += dt * 2
    }

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
      <pointLight color={color} intensity={2.2} distance={3.2} />
    </group>
  )
}

function NpcMesh({ npc, rt }: { npc: NonNullable<Runtime['npc']>; rt: React.MutableRefObject<Runtime> }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = groundHeightAt(npc.x, npc.z) + Math.sin(clock.elapsedTime * 1.8) * 0.03
      ref.current.rotation.y = Math.atan2(rt.current.px - npc.x, rt.current.pz - npc.z)
    }
  })
  const robe = pbrMat('tessuto', '#fcee0a', { roughness: 0.9 })
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
      <pointLight color="#fcee0a" intensity={1.6} distance={3} />
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
  onHud: (h: { hp: number; maxHp: number; coins: number; keys: number; msg: string; objective: string }) => void
  onDialogue: (d: { name: string; pages: string[] } | null) => void
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

    // ---------- attacco del giocatore ----------
    if (R.attack > 0 && now - R.attack < 260) {
      R.attack = 0
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
          hurtEnemy(R, e, R.playerDmg, onFloater, camera, size, endNow)
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
          dmg: R.playerDmg,
          ttl: 1.5,
          from: 'player',
          color: '#00f0ff',
        })
      }
    }

    // ---------- nemici ----------
    for (const e of R.enemies) {
      if (e.dead) continue
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
            hurtPlayer(R, e.dmg, onFloater, camera, size)
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
            hurtEnemy(R, e, p.dmg, onFloater, camera, size, endNow)
            break
          }
        }
      } else if (Math.hypot(R.px - p.x, R.pz - p.z) < 0.7 && Math.abs(R.py + 1 - p.y) < 1.7) {
        p.ttl = 0
        hurtPlayer(R, p.dmg, onFloater, camera, size)
      }
      if (Math.abs(p.x) > GRID_HALF + 1 || Math.abs(p.z) > GRID_HALF + 1) p.ttl = 0
    }
    if (R.projs.some(p => p.ttl <= 0)) R.projs = R.projs.filter(p => p.ttl > 0)

    // ---------- oggetti ----------
    for (const it of R.items) {
      if (it.taken) continue
      if (Math.hypot(it.x - R.px, it.z - R.pz) < 1.25) {
        it.taken = true
        if (it.kind === 'moneta') { R.coins += it.amount || 1; sfx.pickup() }
        else if (it.kind === 'pozione') { R.hp = Math.min(R.maxHp, R.hp + (it.amount || 25)); sfx.heal() }
        else if (it.kind === 'chiave') { R.keys++; sfx.pickup(); flashMsg(R, '🔑 Chiave trovata!') }
        else if (it.kind === 'cassa') { R.coins += it.amount || 5; sfx.pickup() }
      }
    }

    // ---------- NPC ----------
    if (R.npc) {
      const nd = Math.hypot(R.npc.x - R.px, R.npc.z - R.pz)
      if (!dlgOpen.current && !npcLatch.current && nd < 2.2) {
        dlgOpen.current = true
        runRef.current = false
        onDialogue({ name: R.npc.name, pages: R.npc.pages })
      }
      if (nd > 3.4) npcLatch.current = false
    }

    // ---------- portale / obiettivo ----------
    if (R.portal) {
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
        objective: R.objective,
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
      if (rt.current.phase !== 'over') runRef.current = true
    }
    window.addEventListener('dialogue3d-closed', h)
    return () => window.removeEventListener('dialogue3d-closed', h)
  }, [rt, runRef])

  return null
}

function hurtEnemy(
  R: Runtime,
  e: EnemyRT,
  dmg: number,
  onFloater: (f: FloaterIn) => void,
  camera: THREE.Camera,
  size: { width: number; height: number },
  endNow: (r: 'win' | 'lose') => void
) {
  e.hp -= dmg
  e.flash = 0.14
  sfx.hit()
  addFloater(R, onFloater, camera, size, e.x, e.y + (e.boss ? 3.2 : 2.4), e.z, `-${dmg}`, '#ff5a7a')
  if (e.hp <= 0) {
    e.dead = true
    e.deadAt = performance.now()
    sfx.enemyDie()
    const coins = 1 + Math.floor(Math.random() * 3)
    R.coins += coins
    flashMsg(R, e.boss ? '☠ BOSS ELIMINATO!' : `Nemico eliminato · +${coins} ◈`)
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
  const groundY = useMemo(() => {
    void version
    return (x: number, z: number) => terrainHeightAt(terrain, x, z)
  }, [terrain, version])
  return (
    <group>
      <SculptedTerrain />
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
    const down = (e: KeyboardEvent) => set(e.code, true)
    const up = (e: KeyboardEvent) => set(e.code, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

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
    if (Math.abs(x) > GRID_HALF || Math.abs(z) > GRID_HALF) return false
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

    let lastDx = 0
    let lastDz = 0
    if (mv) {
      const speed = k.run ? RUN_SPEED : SPEED
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
  const [hud, setHud] = useState({
    hp: project.settings.playerHp,
    maxHp: project.settings.playerHp,
    coins: 0,
    keys: 0,
    msg: '',
    objective: '',
  })
  const [dialogue, setDialogue] = useState<{ name: string; pages: string[] } | null>(null)
  const [page, setPage] = useState(0)
  const [end, setEnd] = useState<'win' | 'lose' | null>(null)
  const [floaters, setFloaters] = useState<FloaterUI[]>([])
  const [hurtFlash, setHurtFlash] = useState(false)
  const [runId, setRunId] = useState(0)
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
          brush: 'none',
          playMode: false,
          selectedAsset: null,
        })
        setWorldLabel(data.project.name)
        setPhase(project.settings.intro && project.settings.intro.length ? 'intro' : 'play')
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
    let npc: Runtime['npc'] = null
    let portal: Runtime['portal'] = null
    let start = { x: 0, z: 0 }
    const diff = project.settings.difficulty
    const aggro = diff === 3 ? 16 : diff === 2 ? 12 : 8

    for (const e of entities) {
      const [wx, wz] = schematicToWorld(e.x, e.y, W, H)
      if (e.type === 'player') start = { x: wx, z: wz }
      else if (e.type === 'goal') portal = { x: wx, z: wz, active: true }
      else if (e.type === 'npc')
        npc = { x: wx, z: wz, name: e.props.name ?? 'ALLEATO', pages: e.props.pages ?? ['Buona fortuna.'] }
      else if (e.type === 'enemy') {
        const kind = e.props.kind ?? 'soldato'
        enemies.push({
          id: e.id,
          kind,
          x: wx,
          z: wz,
          homeX: wx,
          homeZ: wz,
          hp: e.props.hp ?? 60,
          maxHp: e.props.hp ?? 60,
          dmg: e.props.dmg ?? 10,
          speed: e.props.speed ?? (kind === 'drone' ? 3.4 : 2.2),
          color: e.props.color ?? '#ff5a5a',
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
        })
      } else if (e.type === 'item') {
        items.push({ id: e.id, kind: e.props.kind ?? 'moneta', x: wx, z: wz, amount: e.props.amount ?? 1, taken: false })
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
      npc,
      portal: project.settings.objective === 'boss' ? null : portal,
      objective,
      attack: 0,
      weapon: project.settings.weapon,
      playerDmg: project.settings.playerDmg,
      msg: '',
      msgT: 0,
      ended: null,
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

  // ESC esce dal gioco (se non ci sono dialoghi)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && phase === 'play' && !dialogue && !end) onExit()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phase, dialogue, end, onExit])

  const addFloaterUI = useCallback((f: FloaterIn) => {
    setFloaters(prev => [...prev.slice(-10), { ...f, t: performance.now() }])
  }, [])

  const onHud = useCallback((h: { hp: number; maxHp: number; coins: number; keys: number; msg: string; objective: string }) => {
    setHud(h)
  }, [])

  const onEnd = useCallback((r: 'win' | 'lose') => {
    setEnd(r)
    runRef.current = false
  }, [])

  const onDialogue = useCallback((d: { name: string; pages: string[] } | null) => {
    setDialogue(d)
    setPage(0)
  }, [])

  const closeDialogue = () => {
    setDialogue(null)
    window.dispatchEvent(new Event('dialogue3d-closed'))
  }

  const advanceDialogue = () => {
    if (!dialogue) return
    if (page < dialogue.pages.length - 1) setPage(p => p + 1)
    else closeDialogue()
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

      {/* HUD */}
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
        <span className="text-[#fcee0a]">◈ {hud.coins}</span>
        <span className="text-[var(--neon)]">🔑 {hud.keys}{project.settings.objective === 'collezione' ? `/${project.settings.objectiveCount}` : ''}</span>
        <span className="hidden text-[var(--tx-dim)] md:inline">{hud.objective}</span>
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

        {/* intro */}
        {phase === 'intro' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="cp-panel cp-panel-neon w-full max-w-xl p-6">
              <div className="cp-chip cp-chip-active mb-3 w-fit">MISSIONE</div>
              {(project.settings.intro ?? []).map((p, i) => (
                <p key={i} className="mb-2 text-[15px] leading-relaxed text-[var(--tx)]">{p}</p>
              ))}
              <p className="mt-3 text-xs text-[var(--tx-faint)]">
                WASD muovi · trascina il mouse per guardare · SPAZIO attacca · SHIFT corri
              </p>
              <Button
                className="cp-btn mt-4 bg-[var(--neon)] font-bold text-[#04060d]"
                onClick={() => { unlockAudio(); setPhase('play') }}
              >
                ▶ COMINCIA
              </Button>
            </div>
          </div>
        )}

        {/* dialogo */}
        {dialogue && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-4">
            <div className="cp-panel cp-panel-neon w-full max-w-2xl cursor-pointer p-4" onClick={advanceDialogue}>
              <div className="neon-text mb-1 font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.2em] uppercase">
                ▸ {dialogue.name}
              </div>
              <p className="min-h-12 text-[15px] leading-relaxed text-[var(--tx)]">{dialogue.pages[page]}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--tx-faint)]">
                <span>{page + 1}/{dialogue.pages.length} — click per continuare</span>
                <button
                  className="cp-chip hover:text-[var(--neon)]"
                  onClick={e => {
                    e.stopPropagation()
                    closeDialogue()
                  }}
                >
                  chiudi ✕
                </button>
              </div>
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
      <div className="hidden justify-center gap-6 border-t border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[11px] tracking-wider text-[var(--tx-faint)] md:flex">
        <span><b className="text-[var(--neon)]">WASD</b> muovi</span>
        <span><b className="text-[var(--neon)]">trascina mouse</b> guarda</span>
        <span><b className="text-[var(--neon)]">SPAZIO / click</b> attacca</span>
        <span><b className="text-[var(--neon)]">SHIFT</b> corri</span>
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
  onHud: (h: { hp: number; maxHp: number; coins: number; keys: number; msg: string; objective: string }) => void
  onDialogue: (d: { name: string; pages: string[] } | null) => void
  onEnd: (r: 'win' | 'lose') => void
  onFloater: (f: FloaterIn) => void
  runId: number
}) {
  const style = useWorld(s => s.worldStyle)
  const theme = getTheme(style)
  const playerAsset = useWorld(s => s.playerAsset)
  const customAssets = useWorld(s => s.customAssets)
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
      <color attach="background" args={[theme.sky]} />
      <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />
      {useWorld.getState().skyboxUrl ? (
        <SkyDome />
      ) : (
        <Sky sunPosition={theme.sunPosition} turbidity={theme.turbidity} rayleigh={theme.rayleigh} />
      )}
      <SunLight />
      <IslandEnvironment />
      <ImportedWorld />

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
      {R.current.npc && <NpcMesh npc={R.current.npc} rt={R} />}
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
