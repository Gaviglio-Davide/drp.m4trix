'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky } from '@react-three/drei'
import { useWorld, GRID_HALF, type WorldObject } from '@/lib/world-store'
import {
  getAssetDef,
  GhostGroup,
  PopIn,
  DieOut,
  type RoadLinks,
} from '@/lib/assets'

function cellFromPoint(p: THREE.Vector3): [number, number] {
  return [Math.round(p.x), Math.round(p.z)]
}

function inGrid(x: number, z: number) {
  return x >= -GRID_HALF && x <= GRID_HALF && z >= -GRID_HALF && z <= GRID_HALF
}

// ---------------- objects ----------------

function RoadLinksFor(obj: WorldObject, objects: WorldObject[]): RoadLinks {
  const isRoad = (x: number, z: number) =>
    objects.some(o => o.x === x && o.z === z && o.asset === 'strada')
  return {
    n: isRoad(obj.x, obj.z - 1),
    s: isRoad(obj.x, obj.z + 1),
    e: isRoad(obj.x + 1, obj.z),
    w: isRoad(obj.x - 1, obj.z),
  }
}

function PlacedObjects() {
  const objects = useWorld(s => s.objects)
  const customAssets = useWorld(s => s.customAssets)
  const dying = useWorld(s => s.dying)
  const pruneDying = useWorld(s => s.pruneDying)

  useEffect(() => {
    if (dying.length) {
      const t = setTimeout(pruneDying, 320)
      return () => clearTimeout(t)
    }
  }, [dying, pruneDying])

  const items = objects.map(o => {
    const def = getAssetDef(o.asset, customAssets)
    return { o, def }
  })

  return (
    <group>
      {items.map(({ o, def }) => {
        if (!def) return null
        const AssetRender = def.render
        return (
          <group key={o.id} position={[o.x, 0, o.z]}>
            <PopIn>
              <AssetRender
                color={o.color}
                rot={o.rot}
                links={
                  o.asset === 'strada' ? RoadLinksFor(o, objects) : undefined
                }
              />
            </PopIn>
          </group>
        )
      })}
      {dying.map(({ obj, at }) => {
        const def = getAssetDef(obj.asset, customAssets)
        if (!def) return null
        const AssetRender = def.render
        return (
          <group key={`d${obj.id}${at}`} position={[obj.x, 0, obj.z]}>
            <DieOut>
              <AssetRender color={obj.color} rot={obj.rot} />
            </DieOut>
          </group>
        )
      })}
    </group>
  )
}

// ---------------- ghost preview ----------------

function GhostPreview() {
  const hoverCell = useWorld(s => s.hoverCell)
  const selectedAsset = useWorld(s => s.selectedAsset)
  const ghostRot = useWorld(s => s.ghostRot)
  const ghostColor = useWorld(s => s.ghostColor)
  const objects = useWorld(s => s.objects)
  const customAssets = useWorld(s => s.customAssets)
  const cameraMode = useWorld(s => s.cameraMode)

  const cellKey = hoverCell ? `${hoverCell[0]},${hoverCell[1]}` : null
  const occupied = objects.some(o => `${o.x},${o.z}` === cellKey)

  if (!hoverCell || !selectedAsset || cameraMode) return null
  const def = getAssetDef(selectedAsset, customAssets)
  if (!def) return null

  const AssetRender = def.render
  return (
    <group position={[hoverCell[0], 0, hoverCell[1]]}>
      <GhostGroup>
        <AssetRender color={ghostColor} rot={ghostRot} />
      </GhostGroup>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.96, 0.96]} />
        <meshBasicMaterial
          color={occupied ? '#e8a13c' : '#7ddb8a'}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// ---------------- camera ----------------

function CameraRig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(10, 12, 16)
    camera.lookAt(0, 0, 0)
  }, [camera])
  return null
}

function Controls() {
  const cameraMode = useWorld(s => s.cameraMode)
  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      minDistance={5}
      maxDistance={60}
      maxPolarAngle={Math.PI / 2.15}
      target={[0, 0, 0]}
      mouseButtons={{
        LEFT: cameraMode ? THREE.MOUSE.ROTATE : -1,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: -1,
      }}
    />
  )
}

// ---------------- input plane ----------------

function InputPlane() {
  const objects = useWorld(s => s.objects)
  const selectedAsset = useWorld(s => s.selectedAsset)
  const ghostRot = useWorld(s => s.ghostRot)
  const ghostColor = useWorld(s => s.ghostColor)
  const cameraMode = useWorld(s => s.cameraMode)
  const addObject = useWorld(s => s.addObject)
  const removeObject = useWorld(s => s.removeObject)
  const cycleColor = useWorld(s => s.cycleColor)
  const setHoverCell = useWorld(s => s.setHoverCell)

  const drag = useRef<{ button: number; lastCell: string; moved: number } | null>(null)

  const act = (cell: [number, number], button: number) => {
    if (!inGrid(cell[0], cell[1])) return
    const key = `${cell[0]},${cell[1]}`
    const occupied = objects.some(o => `${o.x},${o.z}` === key)
    if (button === 2) {
      if (occupied) removeObject(cell[0], cell[1])
      return
    }
    if (occupied) return
    if (!selectedAsset) return
    addObject({
      asset: selectedAsset,
      x: cell[0],
      z: cell[1],
      rot: ghostRot,
      color: ghostColor,
    })
  }

  return (
    <mesh
      position={[0, 0, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
      onPointerMove={e => {
        if (cameraMode) return
        const cell = cellFromPoint(e.point)
        setHoverCell(inGrid(cell[0], cell[1]) ? cell : null)
        if (drag.current) {
          const key = `${cell[0]},${cell[1]}`
          if (key !== drag.current.lastCell) {
            drag.current.lastCell = key
            drag.current.moved++
            act(cell, drag.current.button)
          }
        }
      }}
      onPointerDown={e => {
        if (cameraMode) return
        const cell = cellFromPoint(e.point)
        drag.current = { button: e.button, lastCell: `${cell[0]},${cell[1]}`, moved: 0 }
        if (e.button === 0 || e.button === 2) act(cell, e.button)
      }}
      onPointerUp={e => {
        if (cameraMode || !drag.current) return
        const cell = cellFromPoint(e.point)
        const key = `${cell[0]},${cell[1]}`
        const isClick = drag.current.moved === 0 && drag.current.lastCell === key
        if (isClick && e.button === 0) {
          const occupied = objects.some(o => `${o.x},${o.z}` === key)
          if (occupied) cycleColor(cell[0], cell[1])
        }
        drag.current = null
      }}
      onPointerLeave={() => {
        drag.current = null
        setHoverCell(null)
      }}
    >
      <planeGeometry args={[GRID_HALF * 2 + 1, GRID_HALF * 2 + 1]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

// ---------------- environment ----------------

export function IslandEnvironment() {
  return (
    <group>
      {/* ocean */}
      <mesh position={[0, -0.28, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[220, 48]} />
        <meshStandardMaterial color="#3f9db8" roughness={0.35} metalness={0.1} />
      </mesh>
      {/* sand rim */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID_HALF * 2 + 5, GRID_HALF * 2 + 5]} />
        <meshStandardMaterial color="#e8d5a3" roughness={1} />
      </mesh>
      {/* grass island */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID_HALF * 2 + 3, GRID_HALF * 2 + 3]} />
        <meshStandardMaterial color="#7fb069" roughness={1} />
      </mesh>
    </group>
  )
}

export function SunLight() {
  return (
    <>
      <directionalLight
        position={[18, 28, 12]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-camera-far={90}
      />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#cfe8ff', '#8a9a6b', 0.5]} />
    </>
  )
}

// ---------------- root ----------------

export default function EditorScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 500, position: [10, 12, 16] }}
      onContextMenu={e => e.preventDefault()}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#bfe3f2']} />
      <fog attach="fog" args={['#bfe3f2', 60, 160]} />
      <Sky sunPosition={[18, 28, 12]} turbidity={5} rayleigh={0.6} />
      <SunLight />
      <IslandEnvironment />
      <PlacedObjects />
      <GhostPreview />
      <InputPlane />
      <Controls />
      <CameraRig />
    </Canvas>
  )
}
