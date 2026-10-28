'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky } from '@react-three/drei'
import { useWorld, GRID_HALF, terrainHeightAt, type WorldObject } from '@/lib/world-store'
import { getTheme } from '@/lib/scene-theme'
import {
  getAssetDef,
  GhostGroup,
  PopIn,
  DieOut,
  type RoadLinks,
} from '@/lib/assets'
import { T_SIZE } from '@/lib/terrain'

function cellFromPoint(p: THREE.Vector3): [number, number] {
  return [Math.round(p.x), Math.round(p.z)]
}

function inGrid(x: number, z: number) {
  return x >= -GRID_HALF && x <= GRID_HALF && z >= -GRID_HALF && z <= GRID_HALF
}

// ---------------- terreno scolpito ----------------

function useGroundY() {
  const terrain = useWorld(s => s.terrain)
  const version = useWorld(s => s.terrainVersion)
  return useMemo(() => {
    void version
    return (x: number, z: number) => terrainHeightAt(terrain, x, z)
  }, [terrain, version])
}

export function SculptedTerrain() {
  const terrain = useWorld(s => s.terrain)
  const version = useWorld(s => s.terrainVersion)
  const style = useWorld(s => s.worldStyle)
  const t = getTheme(style)

  const geometry = useMemo(() => {
    void version
    const g = new THREE.PlaneGeometry(T_SIZE, T_SIZE, T_SIZE - 1, T_SIZE - 1)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, terrainHeightAt(terrain, x, z))
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    return g
  }, [terrain, version])

  // libera la geometria vecchia quando cambia
  useEffect(() => {
    return () => geometry.dispose()
  }, [geometry])

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color={t.grass} roughness={1} />
      </mesh>
      {/* bordo sabbia morbido attorno all'isola */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[GRID_HALF + 0.4, GRID_HALF + 2.6, 64]} />
        <meshStandardMaterial color={t.sand} roughness={1} />
      </mesh>
    </group>
  )
}

// ---------------- cursore pennello ----------------

function BrushCursor() {
  const brush = useWorld(s => s.brush)
  const brushSize = useWorld(s => s.brushSize)
  const hoverCell = useWorld(s => s.hoverCell)
  const groundY = useGroundY()
  const ring = useRef<THREE.Mesh>(null)
  const color =
    brush === 'raise' ? '#7ddb8a' : brush === 'lower' ? '#5ab0d6' : '#e8d13c'
  useFrame(() => {
    if (ring.current && hoverCell) {
      ring.current.position.set(
        hoverCell[0],
        groundY(hoverCell[0], hoverCell[1]) + 0.04,
        hoverCell[1]
      )
    }
  })
  if (brush === 'none' || !hoverCell) return null
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
      <ringGeometry args={[brushSize - 0.12, brushSize, 48]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.9}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
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
  const groundY = useGroundY()

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
        const y = groundY(o.x, o.z)
        return (
          <group key={o.id} position={[o.x, y, o.z]}>
            <PopIn>
              <AssetRender
                color={o.color}
                rot={o.rot}
                scale={o.scale}
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
          <group key={`d${obj.id}${at}`} position={[obj.x, groundY(obj.x, obj.z), obj.z]}>
            <DieOut>
              <AssetRender color={obj.color} rot={obj.rot} scale={obj.scale} />
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
  const ghostScale = useWorld(s => s.ghostScale)
  const objects = useWorld(s => s.objects)
  const customAssets = useWorld(s => s.customAssets)
  const cameraMode = useWorld(s => s.cameraMode)
  const brush = useWorld(s => s.brush)
  const groundY = useGroundY()

  const cellKey = hoverCell ? `${hoverCell[0]},${hoverCell[1]}` : null
  const occupied = objects.some(o => `${o.x},${o.z}` === cellKey)

  if (!hoverCell || brush !== 'none') return null
  if (!selectedAsset || cameraMode) return null
  const def = getAssetDef(selectedAsset, customAssets)
  if (!def) return null

  const AssetRender = def.render
  const y = groundY(hoverCell[0], hoverCell[1])
  return (
    <group position={[hoverCell[0], y, hoverCell[1]]}>
      <GhostGroup>
        <AssetRender
          color={ghostColor}
          rot={ghostRot}
          scale={def.isGlb ? ghostScale : undefined}
        />
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
    camera.position.set(13, 15, 20)
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
      maxDistance={85}
      maxPolarAngle={Math.PI / 2.15}
      target={[0, 0, 0]}
      mouseButtons={{
        LEFT: cameraMode ? THREE.MOUSE.ROTATE : -1,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      touches={{
        ONE: cameraMode ? THREE.TOUCH.ROTATE : -1,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
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
  const ghostScale = useWorld(s => s.ghostScale)
  const cameraMode = useWorld(s => s.cameraMode)
  const brush = useWorld(s => s.brush)
  const addObject = useWorld(s => s.addObject)
  const removeObject = useWorld(s => s.removeObject)
  const cycleColor = useWorld(s => s.cycleColor)
  const cycleScale = useWorld(s => s.cycleScale)
  const setHoverCell = useWorld(s => s.setHoverCell)
  const applyBrushAt = useWorld(s => s.applyBrushAt)
  const customAssets = useWorld(s => s.customAssets)

  const drag = useRef<{
    button: number
    lastCell: string
    moved: number
  } | null>(null)

  const act = (cell: [number, number], button: number) => {
    if (!inGrid(cell[0], cell[1])) return
    const key = `${cell[0]},${cell[1]}`
    const occupied = objects.some(o => `${o.x},${o.z}` === key)
    if (button === 2) {
      // click destro secco: elimina (il drag destro ruota la visuale)
      if (drag.current && drag.current.moved > 1) return
      if (occupied) removeObject(cell[0], cell[1])
      return
    }
    if (occupied) return
    if (!selectedAsset) return
    const def = getAssetDef(selectedAsset, customAssets)
    addObject({
      asset: selectedAsset,
      x: cell[0],
      z: cell[1],
      rot: ghostRot,
      color: ghostColor,
      ...(def?.isGlb ? { scale: ghostScale } : {}),
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
        if (!drag.current) return
        const key = `${cell[0]},${cell[1]}`
        if (brush !== 'none' && drag.current.button === 0) {
          // scolpisce in continuo mentre trascina
          drag.current.moved++
          applyBrushAt(cell[0], cell[1])
          return
        }
        if (drag.current.button === 0 && key !== drag.current.lastCell) {
          drag.current.lastCell = key
          drag.current.moved++
          act(cell, 0)
        }
        if (drag.current.button === 2) {
          drag.current.moved++
        }
      }}
      onPointerDown={e => {
        if (cameraMode) return
        const cell = cellFromPoint(e.point)
        drag.current = {
          button: e.button,
          lastCell: `${cell[0]},${cell[1]}`,
          moved: 0,
        }
        if (brush !== 'none' && e.button === 0) {
          applyBrushAt(cell[0], cell[1])
          drag.current.moved++
          return
        }
        if (e.button === 0) act(cell, e.button)
        // destro: agisce solo al rilascio se è un click secco
      }}
      onPointerUp={e => {
        if (cameraMode || !drag.current) return
        const cell = cellFromPoint(e.point)
        const key = `${cell[0]},${cell[1]}`
        if (drag.current.button === 2) {
          act(cell, 2)
        } else {
          const isClick = drag.current.moved === 0 && drag.current.lastCell === key
          if (isClick && e.button === 0) {
            const hit = objects.find(o => `${o.x},${o.z}` === key)
            if (hit) {
              const def = getAssetDef(hit.asset, customAssets)
              if (def?.isGlb) cycleScale(cell[0], cell[1])
              else cycleColor(cell[0], cell[1])
            }
          }
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
  const style = useWorld(s => s.worldStyle)
  const t = getTheme(style)
  return (
    <group>
      {/* oceano: visibile anche nei laghi scavati sotto -0.28 */}
      <mesh position={[0, -0.28, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[220, 48]} />
        <meshStandardMaterial color={t.ocean} roughness={0.35} metalness={0.1} />
      </mesh>
    </group>
  )
}

export function SunLight() {
  const style = useWorld(s => s.worldStyle)
  const t = getTheme(style)
  return (
    <>
      <directionalLight
        position={t.sunPosition}
        intensity={t.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={46}
        shadow-camera-bottom={-46}
        shadow-camera-far={110}
      />
      <ambientLight intensity={t.ambientIntensity} />
      <hemisphereLight args={[t.hemiSky, t.hemiGround, t.hemiIntensity]} />
    </>
  )
}

// ---------------- skybox immagine (Darpx.ai) ----------------

export function SkyDome() {
  const skyboxUrl = useWorld(s => s.skyboxUrl)
  const texture = useMemo(() => {
    if (!skyboxUrl) return null
    const tex = new THREE.TextureLoader().load(skyboxUrl)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [skyboxUrl])
  useEffect(() => {
    return () => texture?.dispose()
  }, [texture])
  if (!skyboxUrl || !texture) return null
  return (
    <mesh scale={[-240, 240, 240]}>
      <sphereGeometry args={[1, 32, 24]} />
      <meshBasicMaterial map={texture} depthWrite={false} fog={false} />
    </mesh>
  )
}

// ---------------- root ----------------

export default function EditorScene() {
  const style = useWorld(s => s.worldStyle)
  const skyboxUrl = useWorld(s => s.skyboxUrl)
  const t = getTheme(style)
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 500, position: [10, 12, 16] }}
      onContextMenu={e => e.preventDefault()}
      gl={{ antialias: true }}
    >
      {skyboxUrl ? (
        <>
          <color attach="background" args={[t.sky]} />
          <SkyDome />
        </>
      ) : (
        <>
          <color attach="background" args={[t.sky]} />
          <Sky sunPosition={t.sunPosition} turbidity={t.turbidity} rayleigh={t.rayleigh} />
        </>
      )}
      <fog attach="fog" args={[t.fogColor, t.fogNear, t.fogFar]} />
      <SunLight />
      <IslandEnvironment />
      <SculptedTerrain />
      <PlacedObjects />
      <GhostPreview />
      <BrushCursor />
      <InputPlane />
      <Controls />
      <CameraRig />
    </Canvas>
  )
}
