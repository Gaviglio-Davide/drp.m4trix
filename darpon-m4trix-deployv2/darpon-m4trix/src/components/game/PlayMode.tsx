'use client'

// ============================================================
// Modalità Gioca: esplori il mondo in terza persona.
// Personaggio: "Eroe" procedurale di serie, oppure un modello
// GLB caricato dall'utente (scelto tra i suoi asset privati).
// ============================================================

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useWorld, GRID_HALF, terrainHeightAt, type WorldObject as WO } from '@/lib/world-store'
import { getAssetDef } from '@/lib/assets'
import { getTheme } from '@/lib/scene-theme'
import { pbrMat } from '@/lib/pbr'
import { SkyDome, SculptedTerrain } from './EditorScene'
import { IslandEnvironment, SunLight } from './EditorScene' // re-export parity

const SPEED = 3.2
const RUN_SPEED = 6.2
const CAM_HEIGHT = 2.6
const CAM_DIST = 5.2

type Keys = { f: boolean; b: boolean; l: boolean; r: boolean; run: boolean }

function useKeyboard() {
  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, run: false })
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.f = true
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.current.b = true
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.l = true
          break
        case 'KeyD':
        case 'ArrowRight':
          keys.current.r = true
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.current.run = true
          break
      }
    }
    const up = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.f = false
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.current.b = false
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.l = false
          break
        case 'KeyD':
        case 'ArrowRight':
          keys.current.r = false
          break
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.current.run = false
          break
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  return keys
}

function blockedCells(): Set<string> {
  const { objects, customAssets } = useWorld.getState()
  const s = new Set<string>()
  for (const o of objects) {
    const def = getAssetDef(o.asset, customAssets)
    if (def && !def.walkable) s.add(`${o.x},${o.z}`)
  }
  return s
}

/** Altezza del terreno alla cella: heightmap scolpita + asset calpestabili */
function groundHeightAt(x: number, z: number): number {
  const { objects, customAssets, terrain } = useWorld.getState()
  const base = terrain ? terrainHeightAt(terrain, x, z) : 0
  const o = objects.find(p => p.x === Math.round(x) && p.z === Math.round(z))
  if (!o) return base
  const def = getAssetDef(o.asset, customAssets)
  if (!def || !def.walkable) return base
  return base + (def.walkHeight ?? 0)
}

/** Logica di movimento/camera condivisa tra i personaggi */
function usePlayerMotion(zFlip: number) {
  const group = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(0, 0, 2))
  const groundY = useRef(0)
  const facing = useRef(Math.PI)
  const moving = useRef(false)
  const walkT = useRef(0)
  const keys = useKeyboard()
  const blocked = useMemo(() => blockedCells(), [])
  const { camera } = useThree()

  const canStand = (x: number, z: number) => {
    if (Math.abs(x) > GRID_HALF || Math.abs(z) > GRID_HALF) return false
    return !blocked.has(`${Math.round(x)},${Math.round(z)}`)
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)

    const k = keys.current
    let ix = 0
    let iz = 0
    if (k.f) iz -= 1
    if (k.b) iz += 1
    if (k.l) ix -= 1
    if (k.r) ix += 1
    moving.current = ix !== 0 || iz !== 0

    if (moving.current) {
      const speed = k.run ? RUN_SPEED : SPEED
      const yaw = camYawRef.current
      const sin = Math.sin(yaw)
      const cos = Math.cos(yaw)
      let dx = (-sin * -iz + cos * ix) * speed * dt
      let dz = (-cos * -iz + -sin * ix) * speed * dt
      const dl = Math.hypot(dx, dz)
      if (dl > speed * dt) {
        dx = (dx / dl) * speed * dt
        dz = (dz / dl) * speed * dt
      }
      const nx = pos.current.x + dx
      const nz = pos.current.z + dz
      if (canStand(nx, pos.current.z)) pos.current.x = nx
      if (canStand(pos.current.x, nz)) pos.current.z = nz
      // segue dolcemente il dislivello (colline, strade rialzate)
      const targetY = groundHeightAt(pos.current.x, pos.current.z)
      groundY.current += (targetY - groundY.current) * Math.min(1, dt * 10)
      pos.current.y = groundY.current
      const targetRot = Math.atan2(dx, dz)
      let diff = targetRot - facing.current
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      facing.current += diff * Math.min(1, dt * 12)
      walkT.current += dt * (k.run ? 14 : 10)
    } else {
      walkT.current += dt * 2
    }

    if (group.current) {
      group.current.position.copy(pos.current)
      group.current.rotation.y = facing.current + zFlip
    }

    const camX = pos.current.x + Math.sin(camYawRef.current) * CAM_DIST
    const camZ = pos.current.z + Math.cos(camYawRef.current) * CAM_DIST
    camera.position.lerp(
      new THREE.Vector3(camX, CAM_HEIGHT + groundY.current, camZ),
      Math.min(1, dt * 5)
    )
    camera.lookAt(pos.current.x, 1.2 + groundY.current, pos.current.z)
  })

  return { group, walkT, moving }
}

// yaw della camera condiviso (impostato da PlayScene)
const camYawRef = { current: Math.PI } as React.MutableRefObject<number>

/** Eroe procedurale di serie: avventuriero realistico (v7) */
function Hero() {
  const { group, walkT, moving } = usePlayerMotion(0)
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

  // materiali PBR condivisi (tessuto, cuoio, pelle…)
  const tunic = pbrMat('tessuto', '#8a6a4a', { roughness: 0.95, rx: 1.4, ry: 1.4 })
  const pants = pbrMat('tessuto', '#4d4438', { roughness: 0.95, rx: 1, ry: 1 })
  const leather = pbrMat('legno', '#5d4033', { roughness: 0.82, rx: 0.8, ry: 0.8 })
  const boots = pbrMat('pelle', '#4a3325', { roughness: 0.8 })
  const skin = pbrMat('pelle', '#e2b48f', { roughness: 0.72 })
  const hairM = pbrMat('pelle', '#4b3621', { roughness: 0.9 })
  const iron = pbrMat('metallo', '#8a8f96', { metalness: 0.9, roughness: 0.35 })

  return (
    <group ref={group}>
      <group ref={body}>
        {/* gambe (pantaloni + stivali) */}
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
        {/* torso: camicia + tunica + cintura */}
        <mesh position={[0, 0.98, 0]} castShadow>
          <capsuleGeometry args={[0.135, 0.3, 6, 12]} />
          <primitive object={tunic} attach="material" />
        </mesh>
        <mesh position={[0, 0.83, 0]} castShadow>
          <cylinderGeometry args={[0.155, 0.165, 0.09, 12]} />
          <primitive object={leather} attach="material" />
        </mesh>
        {/* fibbia della cintura */}
        <mesh position={[0, 0.83, 0.16]}>
          <boxGeometry args={[0.06, 0.05, 0.015]} />
          <primitive object={iron} attach="material" />
        </mesh>
        {/* spallacci in cuoio */}
        <mesh position={[-0.13, 1.13, 0]} rotation={[0, 0, 0.4]} castShadow>
          <boxGeometry args={[0.09, 0.05, 0.16]} />
          <primitive object={leather} attach="material" />
        </mesh>
        <mesh position={[0.13, 1.13, 0]} rotation={[0, 0, -0.4]} castShadow>
          <boxGeometry args={[0.09, 0.05, 0.16]} />
          <primitive object={leather} attach="material" />
        </mesh>
        {/* braccia (camicia + mani) */}
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
        {/* collo + testa */}
        <mesh position={[0, 1.28, 0]}>
          <cylinderGeometry args={[0.035, 0.045, 0.07, 8]} />
          <primitive object={skin} attach="material" />
        </mesh>
        <mesh position={[0, 1.4, 0]} castShadow>
            <sphereGeometry args={[0.115, 16, 14]} />
          <primitive object={skin} attach="material" />
        </mesh>
        {/* capelli + naso + occhi sobri */}
        <mesh position={[0, 1.44, -0.01]} castShadow>
          <sphereGeometry args={[0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
          <primitive object={hairM} attach="material" />
        </mesh>
        <mesh position={[-0.04, 1.4, 0.1]}>
          <sphereGeometry args={[0.013, 6, 6]} />
          <meshStandardMaterial color="#3a2e26" roughness={0.6} />
        </mesh>
        <mesh position={[0.04, 1.4, 0.1]}>
          <sphereGeometry args={[0.013, 6, 6]} />
          <meshStandardMaterial color="#3a2e26" roughness={0.6} />
        </mesh>
        {/* cappuccio dietro le spalle */}
        <mesh position={[0, 1.16, -0.09]} rotation={[0.25, 0, 0]} castShadow>
          <coneGeometry args={[0.11, 0.22, 8, 1, true]} />
          <primitive object={tunic} attach="material" />
        </mesh>
        {/* sacca da viaggio */}
        <mesh position={[0.15, 0.95, -0.1]} rotation={[0, 0.3, -0.2]} castShadow>
          <sphereGeometry args={[0.08, 10, 8]} />
          <primitive object={leather} attach="material" />
        </mesh>
      </group>
    </group>
  )
}

/** Personaggio GLB scelto dall'utente (solo dai SUOI asset) */
function PlayerGlb({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url)
  const { group, walkT, moving } = usePlayerMotion(Math.PI)
  const body = useRef<THREE.Group>(null)

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
    return () => {
      a.stop()
      actionRef.current = null
    }
  }, [animations, mixer])

  useEffect(() => {
    return () => {
      mixer.stopAllAction()
    }
  }, [mixer])

  useFrame((_, dt) => {
    mixer.update(dt)
    const a = actionRef.current
    if (a) a.paused = !moving.current
    if (!a && body.current) {
      const t = walkT.current
      const mv = moving.current
      body.current.position.y = mv
        ? Math.abs(Math.sin(t * 2)) * 0.06
        : Math.sin(t) * 0.02
      body.current.rotation.z = mv ? Math.sin(t * 2) * 0.05 : 0
    }
  })

  return (
    <group ref={group}>
      <group ref={body}>
        <primitive object={cloned} dispose={null} />
      </group>
    </group>
  )
}

function PlacedWorld() {
  const objects = useWorld(s => s.objects)
  const customAssets = useWorld(s => s.customAssets)
  const terrain = useWorld(s => s.terrain)
  const version = useWorld(s => s.terrainVersion)
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

function PlayScene() {
  const dragging = useRef<{ x: number; yaw: number } | null>(null)
  const style = useWorld(s => s.worldStyle)
  const theme = getTheme(style)
  const playerAsset = useWorld(s => s.playerAsset)
  const customAssets = useWorld(s => s.customAssets)

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.button === 0 || e.button === 2)
        dragging.current = { x: e.clientX, yaw: camYawRef.current }
    }
    const move = (e: PointerEvent) => {
      if (dragging.current) {
        const dx = e.clientX - dragging.current.x
        camYawRef.current = dragging.current.yaw + dx * 0.006
      }
    }
    const up = () => {
      dragging.current = null
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const playerCustom = playerAsset
    ? customAssets.find(a => a.id === playerAsset && a.url)
    : null

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 500, position: [0, CAM_HEIGHT, 7] }}
      onContextMenu={e => e.preventDefault()}
    >
      <color attach="background" args={[theme.sky]} />
      {/* nebbia lontana: il terreno non "svanisce" più sotto i piedi */}
      <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />
      {useWorld.getState().skyboxUrl ? (
        <SkyDome />
      ) : (
        <Sky
          sunPosition={theme.sunPosition}
          turbidity={theme.turbidity}
          rayleigh={theme.rayleigh}
        />
      )}
      <SunLight />
      <IslandEnvironment />
      <PlacedWorld />
      <Suspense fallback={null}>
        {playerCustom?.url ? (
          <PlayerGlb url={playerCustom.url} />
        ) : (
          <Hero />
        )}
      </Suspense>
    </Canvas>
  )
}

export default function PlayMode() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 50)
    return () => clearTimeout(t)
  }, [])
  if (!ready) return null
  return <PlayScene />
}
