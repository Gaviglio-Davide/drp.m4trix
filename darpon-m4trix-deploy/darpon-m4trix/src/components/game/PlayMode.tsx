'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useWorld, GRID_HALF, type WorldObject as WO } from '@/lib/world-store'
import { getAssetDef, KNIGHT_URL } from '@/lib/assets'
import { IslandEnvironment, SunLight } from './EditorScene'

const SPEED = 3.2
const RUN_SPEED = 6.2
const CAM_HEIGHT = 2.6
const CAM_DIST = 5.2
// if the exported model faces -Z we flip with PI; verify visually
const MODEL_Z_FLIP = Math.PI

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

function Knight({ camYaw }: { camYaw: React.MutableRefObject<number> }) {
  const { scene, animations } = useGLTF(KNIGHT_URL)
  const group = useRef<THREE.Group>(null)
  const pos = useRef(new THREE.Vector3(0, 0, 2))
  const facing = useRef(Math.PI)
  const moving = useRef(false)
  const keys = useKeyboard()
  const blocked = useMemo(() => blockedCells(), [])
  const { camera } = useThree()

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

  const canStand = (x: number, z: number) => {
    if (Math.abs(x) > GRID_HALF || Math.abs(z) > GRID_HALF) return false
    return !blocked.has(`${Math.round(x)},${Math.round(z)}`)
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    mixer.update(dt)

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
      const yaw = camYaw.current
      const sin = Math.sin(yaw)
      const cos = Math.cos(yaw)
      // view direction (camera -> knight) is -(sin, cos)
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
      const targetRot = Math.atan2(dx, dz)
      let diff = targetRot - facing.current
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      facing.current += diff * Math.min(1, dt * 12)
    }

    const a = actionRef.current
    if (a) a.paused = !moving.current

    if (group.current) {
      group.current.position.copy(pos.current)
      group.current.rotation.y = facing.current + MODEL_Z_FLIP
    }

    const camX = pos.current.x + Math.sin(camYaw.current) * CAM_DIST
    const camZ = pos.current.z + Math.cos(camYaw.current) * CAM_DIST
    camera.position.lerp(
      new THREE.Vector3(camX, CAM_HEIGHT, camZ),
      Math.min(1, dt * 5)
    )
    camera.lookAt(pos.current.x, 1.2, pos.current.z)
  })

  return (
    <group ref={group}>
      <primitive object={cloned} dispose={null} />
    </group>
  )
}

function PlacedWorld() {
  const objects = useWorld(s => s.objects)
  const customAssets = useWorld(s => s.customAssets)
  return (
    <group>
      {objects.map((o: WO) => {
        const def = getAssetDef(o.asset, customAssets)
        if (!def) return null
        const AssetRender = def.render
        return (
          <group key={o.id} position={[o.x, 0, o.z]}>
            <AssetRender color={o.color} rot={o.rot} />
          </group>
        )
      })}
    </group>
  )
}

function PlayScene() {
  const camYaw = useRef(Math.PI)
  const dragging = useRef<{ x: number; yaw: number } | null>(null)

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.button === 0 || e.button === 2)
        dragging.current = { x: e.clientX, yaw: camYaw.current }
    }
    const move = (e: PointerEvent) => {
      if (dragging.current) {
        const dx = e.clientX - dragging.current.x
        camYaw.current = dragging.current.yaw + dx * 0.006
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

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.1, far: 500, position: [0, CAM_HEIGHT, 7] }}
      onContextMenu={e => e.preventDefault()}
    >
      <color attach="background" args={['#bfe3f2']} />
      <fog attach="fog" args={['#bfe3f2', 45, 130]} />
      <Sky sunPosition={[18, 28, 12]} turbidity={5} rayleigh={0.6} />
      <SunLight />
      <IslandEnvironment />
      <PlacedWorld />
      <Knight camYaw={camYaw} />
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
