'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { PALETTE, ROOF_PALETTE } from './world-store'

export const KNIGHT_URL = '/models/knight.glb'
useGLTF.preload(KNIGHT_URL)

export type RoadLinks = { n: boolean; e: boolean; s: boolean; w: boolean }

export type AssetRenderProps = {
  color: number
  rot: number
  links?: RoadLinks
  playing?: boolean // walk animation (only knight in play mode)
}

export type AssetDef = {
  id: string
  label: string
  icon: string
  walkable?: boolean
  isGlb?: boolean
  glbUrl?: string
  render: (props: AssetRenderProps) => ReactNode
}

// ---------- shared helpers ----------

function roofColorOf(color: number) {
  return ROOF_PALETTE[color % ROOF_PALETTE.length]
}

function trimShade(hex: string, amt: number) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amt, 0.05, 0.95))
  return `#${c.getHexString()}`
}

// ---------- procedural buildings ----------

function Casa({ color, rot }: AssetRenderProps) {
  const wall = PALETTE[color % PALETTE.length]
  const roof = roofColorOf(color)
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.82, 0.72, 0.82]} />
        <meshStandardMaterial color={wall} roughness={0.85} />
      </mesh>
      {/* roof: 4-sided pyramid */}
      <mesh position={[0, 0.94, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.68, 0.48, 4]} />
        <meshStandardMaterial color={roof} roughness={0.8} />
      </mesh>
      {/* door */}
      <mesh position={[0, 0.22, 0.415]}>
        <boxGeometry args={[0.2, 0.44, 0.02]} />
        <meshStandardMaterial color="#5d4033" roughness={0.9} />
      </mesh>
      {/* windows */}
      <mesh position={[0.24, 0.42, 0.415]}>
        <boxGeometry args={[0.16, 0.16, 0.02]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#e8b84c" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[-0.24, 0.42, 0.415]}>
        <boxGeometry args={[0.16, 0.16, 0.02]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#e8b84c" emissiveIntensity={0.35} />
      </mesh>
      {/* chimney */}
      <mesh position={[0.24, 1.05, -0.2]} castShadow>
        <boxGeometry args={[0.12, 0.34, 0.12]} />
        <meshStandardMaterial color="#8a6a56" roughness={0.9} />
      </mesh>
    </group>
  )
}

function Casatorre({ color, rot }: AssetRenderProps) {
  const wall = PALETTE[color % PALETTE.length]
  const roof = roofColorOf(color)
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 1.5, 0.78]} />
        <meshStandardMaterial color={wall} roughness={0.85} />
      </mesh>
      {/* floor trims */}
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[0.84, 0.06, 0.84]} />
        <meshStandardMaterial color={trimShade(wall, -0.08)} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.28, 0]}>
        <boxGeometry args={[0.84, 0.06, 0.84]} />
        <meshStandardMaterial color={trimShade(wall, -0.08)} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.72, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.64, 0.55, 4]} />
        <meshStandardMaterial color={roof} roughness={0.8} />
      </mesh>
      {/* door + windows */}
      <mesh position={[0, 0.24, 0.4]}>
        <boxGeometry args={[0.2, 0.46, 0.02]} />
        <meshStandardMaterial color="#5d4033" roughness={0.9} />
      </mesh>
      {[0.5, 1.0].map(y =>
        [-0.22, 0.22].map(x => (
          <mesh key={`${x}-${y}`} position={[x, y, 0.4]}>
            <boxGeometry args={[0.14, 0.18, 0.02]} />
            <meshStandardMaterial color="#ffe9a8" emissive="#e8b84c" emissiveIntensity={0.35} />
          </mesh>
        ))
      )}
    </group>
  )
}

function Torre({ color, rot }: AssetRenderProps) {
  const wall = PALETTE[color % PALETTE.length]
  const roof = roofColorOf(color)
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.4, 1.9, 10]} />
        <meshStandardMaterial color={wall} roughness={0.85} />
      </mesh>
      {/* stone base ring */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.44, 0.47, 0.2, 10]} />
        <meshStandardMaterial color={trimShade(wall, -0.12)} roughness={0.95} />
      </mesh>
      {/* roof cone */}
      <mesh position={[0, 2.15, 0]} castShadow>
        <coneGeometry args={[0.46, 0.6, 10]} />
        <meshStandardMaterial color={roof} roughness={0.8} />
      </mesh>
      {/* flag */}
      <mesh position={[0, 2.62, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.35, 6]} />
        <meshStandardMaterial color="#5d4033" />
      </mesh>
      <mesh position={[0.09, 2.72, 0]}>
        <boxGeometry args={[0.18, 0.1, 0.01]} />
        <meshStandardMaterial color="#d9534f" />
      </mesh>
      {/* window */}
      <mesh position={[0, 1.35, 0.36]}>
        <boxGeometry args={[0.14, 0.2, 0.06]} />
        <meshStandardMaterial color="#ffe9a8" emissive="#e8b84c" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

function Albero() {
  return (
    <group>
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 0.56, 7]} />
        <meshStandardMaterial color="#6d4c33" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <sphereGeometry args={[0.34, 12, 10]} />
        <meshStandardMaterial color="#5f9e54" roughness={0.9} />
      </mesh>
      <mesh position={[0.18, 0.98, 0.1]} castShadow>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial color="#6fae5f" roughness={0.9} />
      </mesh>
    </group>
  )
}

function Pino() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.4, 7]} />
        <meshStandardMaterial color="#6d4c33" roughness={0.95} />
      </mesh>
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[0, 0.5 + i * 0.3, 0]} castShadow>
          <coneGeometry args={[0.3 - i * 0.08, 0.42, 8]} />
          <meshStandardMaterial color={i === 2 ? '#4d8a47' : '#437a3e'} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function Cespuglio({ color }: AssetRenderProps) {
  const c = PALETTE[color % PALETTE.length]
  return (
    <group>
      <mesh position={[0, 0.16, 0]} scale={[1, 0.7, 1]} castShadow>
        <sphereGeometry args={[0.24, 10, 8]} />
        <meshStandardMaterial color={trimShade(c, -0.18)} roughness={0.9} />
      </mesh>
      <mesh position={[0.14, 0.1, 0.1]} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.14, 8, 7]} />
        <meshStandardMaterial color={trimShade(c, -0.24)} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Roccia() {
  return (
    <mesh position={[0, 0.14, 0]} scale={[1, 0.55, 0.85]} rotation={[0.2, 0.5, 0.1]} castShadow>
      <icosahedronGeometry args={[0.28, 0]} />
      <meshStandardMaterial color="#9a9a94" roughness={1} />
    </mesh>
  )
}

function Muro({ color, rot }: AssetRenderProps) {
  const wall = PALETTE[color % PALETTE.length]
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.98, 0.6, 0.22]} />
        <meshStandardMaterial color={wall} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.63, 0]}>
        <boxGeometry args={[1.0, 0.07, 0.26]} />
        <meshStandardMaterial color={trimShade(wall, -0.1)} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Portone({ color, rot }: AssetRenderProps) {
  const wall = PALETTE[color % PALETTE.length]
  const roof = roofColorOf(color)
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      {[-0.36, 0.36].map(x => (
        <mesh key={x} position={[x, 0.45, 0]} castShadow>
          <boxGeometry args={[0.22, 0.9, 0.22]} />
          <meshStandardMaterial color={wall} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.98, 0]}>
        <boxGeometry args={[0.95, 0.16, 0.26]} />
        <meshStandardMaterial color={trimShade(wall, -0.08)} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.14, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.32, 0.22, 4]} />
        <meshStandardMaterial color={roof} roughness={0.8} />
      </mesh>
    </group>
  )
}

function Lampioncino() {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.05, 0.9, 8]} />
        <meshStandardMaterial color="#3f3a35" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshStandardMaterial
          color="#ffd98a"
          emissive="#ffb84c"
          emissiveIntensity={0.9}
        />
      </mesh>
      <mesh position={[0, 1.07, 0]}>
        <coneGeometry args={[0.1, 0.08, 8]} />
        <meshStandardMaterial color="#3f3a35" />
      </mesh>
    </group>
  )
}

function Strada({ links }: AssetRenderProps) {
  const L = links ?? { n: false, e: false, s: false, w: false }
  const asphalt = '#8d8578'
  const dash = '#e8e2d2'
  return (
    <group>
      {/* center pad */}
      <mesh position={[0, 0.021, 0]} receiveShadow>
        <boxGeometry args={[0.96, 0.04, 0.96]} />
        <meshStandardMaterial color={asphalt} roughness={1} />
      </mesh>
      {/* arms toward connected neighbours */}
      {L.n && (
        <mesh position={[0, 0.021, -0.5]} receiveShadow>
          <boxGeometry args={[0.42, 0.04, 0.52]} />
          <meshStandardMaterial color={asphalt} roughness={1} />
        </mesh>
      )}
      {L.s && (
        <mesh position={[0, 0.021, 0.5]} receiveShadow>
          <boxGeometry args={[0.42, 0.04, 0.52]} />
          <meshStandardMaterial color={asphalt} roughness={1} />
        </mesh>
      )}
      {L.e && (
        <mesh position={[0.5, 0.021, 0]} receiveShadow>
          <boxGeometry args={[0.52, 0.04, 0.42]} />
          <meshStandardMaterial color={asphalt} roughness={1} />
        </mesh>
      )}
      {L.w && (
        <mesh position={[-0.5, 0.021, 0]} receiveShadow>
          <boxGeometry args={[0.52, 0.04, 0.42]} />
          <meshStandardMaterial color={asphalt} roughness={1} />
        </mesh>
      )}
      {/* dashes */}
      {(L.n || L.s) && (
        <mesh position={[0, 0.045, 0]}>
          <boxGeometry args={[0.05, 0.005, 0.3]} />
          <meshStandardMaterial color={dash} roughness={1} />
        </mesh>
      )}
      {(L.e || L.w) && (
        <mesh position={[0, 0.045, 0]}>
          <boxGeometry args={[0.3, 0.005, 0.05]} />
          <meshStandardMaterial color={dash} roughness={1} />
        </mesh>
      )}
    </group>
  )
}

// ---------- GLB knight ----------

export function useKnightScene(url: string = KNIGHT_URL) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const cloned = skeletonClone(scene)
    const box = new THREE.Box3().setFromObject(cloned)
    const size = box.getSize(new THREE.Vector3())
    const h = Math.max(size.y, 0.001)
    const s = 1.7 / h
    cloned.position.set(0, 0, 0)
    // recentre feet to ground
    const scaled = s
    cloned.scale.setScalar(scaled)
    const box2 = new THREE.Box3().setFromObject(cloned)
    cloned.position.y = -box2.min.y
    cloned.position.x = -(box2.min.x + box2.max.x) / 2
    cloned.position.z = -(box2.min.z + box2.max.z) / 2
    return cloned
  }, [scene])
}

function Cavaliere({ rot }: AssetRenderProps) {
  const cloned = useKnightScene()
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      <primitive object={cloned} dispose={null} />
    </group>
  )
}

// ---------- registry ----------

export const BUILTIN_ASSETS: AssetDef[] = [
  { id: 'casa', label: 'Casa', icon: '🏠', render: Casa },
  { id: 'casatorre', label: 'Casa a torre', icon: '🏘️', render: Casatorre },
  { id: 'torre', label: 'Torre', icon: '🗼', render: Torre },
  { id: 'strada', label: 'Strada', icon: '🛣️', walkable: true, render: Strada },
  { id: 'muro', label: 'Muretto', icon: '🧱', render: Muro },
  { id: 'portone', label: 'Portone', icon: '🚪', render: Portone },
  { id: 'albero', label: 'Albero', icon: '🌳', render: Albero },
  { id: 'pino', label: 'Pino', icon: '🌲', render: Pino },
  { id: 'cespuglio', label: 'Cespuglio', icon: '🌿', render: Cespuglio },
  { id: 'roccia', label: 'Roccia', icon: '🪨', render: Roccia },
  { id: 'lampioncino', label: 'Lampioncino', icon: '🏮', render: Lampioncino },
  {
    id: 'cavaliere',
    label: 'Cavaliere',
    icon: '⚔️',
    isGlb: true,
    glbUrl: KNIGHT_URL,
    render: Cavaliere,
  },
]

export function getAssetDef(id: string, customAssets: { id: string; name: string; url: string }[]): AssetDef | null {
  const builtin = BUILTIN_ASSETS.find(a => a.id === id)
  if (builtin) return builtin
  const custom = customAssets.find(a => a.id === id)
  if (custom) {
    return {
      id: custom.id,
      label: custom.name,
      icon: '📦',
      isGlb: true,
      glbUrl: custom.url,
      render: props => <GlbModel url={custom.url} rot={props.rot} />,
    }
  }
  return null
}

export function GlbModel({ url, rot }: { url: string; rot: number }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => {
    const c = skeletonClone(scene)
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const s = 1.4 / maxDim
    c.scale.setScalar(s)
    const box2 = new THREE.Box3().setFromObject(c)
    c.position.y = -box2.min.y
    c.position.x = -(box2.min.x + box2.max.x) / 2
    c.position.z = -(box2.min.z + box2.max.z) / 2
    return c
  }, [scene])
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      <primitive object={cloned} dispose={null} />
    </group>
  )
}

// ---------- ghost (semi-transparent preview) ----------

export function GhostGroup({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (!ref.current) return
    const mats: THREE.Material[] = []
    ref.current.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        const mat = m.material as THREE.Material | THREE.Material[]
        const list = Array.isArray(mat) ? mat : [mat]
        for (const mm of list) {
          if (mats.includes(mm)) continue
          mats.push(mm)
          ;(mm as THREE.MeshStandardMaterial).transparent = true
          ;(mm as THREE.MeshStandardMaterial).opacity = 0.45
          ;(mm as THREE.MeshStandardMaterial).depthWrite = false
        }
      }
    })
  })
  return <group ref={ref}>{children}</group>
}

// ---------- pop-in animation wrapper ----------

export function PopIn({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!ref.current || t.current >= 1) return
    t.current = Math.min(1, t.current + dt * 3.2)
    // ease-out-back
    const c1 = 1.70158
    const c3 = c1 + 1
    const p = t.current
    const ease = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
    ref.current.scale.setScalar(Math.max(0.001, ease))
  })
  return <group ref={ref}>{children}</group>
}

export function DieOut({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!ref.current) return
    t.current = Math.min(1, t.current + dt * 5)
    ref.current.scale.setScalar(Math.max(0.001, 1 - t.current))
    ref.current.rotation.y += dt * 4
  })
  return <group ref={ref}>{children}</group>
}
