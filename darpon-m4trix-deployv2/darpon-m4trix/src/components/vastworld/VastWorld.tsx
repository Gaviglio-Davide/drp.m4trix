'use client'

// ============================================================
// darpon.m4trix — V13 VAST WORLD (renderer)
// Terreno infinito a chunk attorno al giocatore:
//  - chunk 24×24 m costruiti su richiesta, smontati a distanza
//  - geometria unica per chunk con VERTEX COLORS realistici
//  - vegetazione unita in un'unica geometria per chunk
//    (pini, querce, betulle, cespugli, rocce)
//  - acqua infinita che segue il giocatore
//  - cielo/luce/nebbia per ora del giorno (alba/giorno/tramonto/notte)
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  vastHeight,
  vastSlope,
  vastColor,
  vastPlants,
  vastAtmo,
  WATER_LEVEL,
  qualityRadius,
  type VastConfig,
  type VastPlant,
} from '@/lib/vastworld'

const CHUNK = 24 // metri
const STEP = 1.5 // risoluzione griglia chunk (m)

// ---------------- template vegetazione ----------------

function plantTemplate(kind: VastPlant['kind']): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const wood = new THREE.Color('#4a3524')
  const leafA = new THREE.Color('#2c4a1e')
  const leafB = new THREE.Color('#3d5c26')
  const birch = new THREE.Color('#e8e4d8')
  const rock = new THREE.Color('#6b675f')
  const bush = new THREE.Color('#39572a')

  const push = (g: THREE.BufferGeometry, c: THREE.Color, m: THREE.Matrix4) => {
    g.applyMatrix4(m)
    const n = g.attributes.position.count
    const cols = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      cols[i * 3] = c.r
      cols[i * 3 + 1] = c.g
      cols[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    parts.push(g)
  }

  if (kind === 'pino') {
    // tronco + 3 coni sovrapposti (abete)
    push(new THREE.CylinderGeometry(0.09, 0.14, 1.4, 6), wood, new THREE.Matrix4().makeTranslation(0, 0.7, 0))
    push(new THREE.ConeGeometry(1.15, 1.9, 7), leafA, new THREE.Matrix4().makeTranslation(0, 1.9, 0))
    push(new THREE.ConeGeometry(0.85, 1.7, 7), leafB, new THREE.Matrix4().makeTranslation(0, 2.9, 0))
    push(new THREE.ConeGeometry(0.5, 1.3, 7), leafA, new THREE.Matrix4().makeTranslation(0, 3.8, 0))
  } else if (kind === 'querce') {
    // tronco + chioma a 3 blob (quercia)
    push(new THREE.CylinderGeometry(0.13, 0.2, 1.7, 7), wood, new THREE.Matrix4().makeTranslation(0, 0.85, 0))
    push(new THREE.SphereGeometry(1.35, 8, 7), leafA, new THREE.Matrix4().makeTranslation(0, 2.6, 0))
    push(new THREE.SphereGeometry(0.9, 7, 6), leafB, new THREE.Matrix4().makeTranslation(0.7, 2.2, 0.3))
    push(new THREE.SphereGeometry(0.8, 7, 6), leafB, new THREE.Matrix4().makeTranslation(-0.6, 2.3, -0.4))
  } else if (kind === 'betulla') {
    // tronco bianco + chioma snella
    push(new THREE.CylinderGeometry(0.08, 0.11, 2.4, 6), birch, new THREE.Matrix4().makeTranslation(0, 1.2, 0))
    push(new THREE.SphereGeometry(0.95, 8, 7), leafB, new THREE.Matrix4().makeTranslation(0, 2.9, 0))
    push(new THREE.SphereGeometry(0.6, 7, 6), leafA, new THREE.Matrix4().makeTranslation(0.4, 3.4, 0.2))
  } else if (kind === 'cespuglio') {
    push(new THREE.SphereGeometry(0.5, 7, 6), bush, new THREE.Matrix4().makeTranslation(0, 0.35, 0))
    push(new THREE.SphereGeometry(0.34, 6, 5), leafB, new THREE.Matrix4().makeTranslation(0.35, 0.25, 0.15))
  } else {
    // roccia irregolare
    push(new THREE.DodecahedronGeometry(0.6, 0), rock, new THREE.Matrix4().makeScale(1.3, 0.8, 1).setPosition(0, 0.3, 0))
  }
  const merged = mergeGeometries(parts, false) ?? parts[0]
  parts.forEach(p => p.dispose())
  merged.computeVertexNormals()
  return merged
}

const TEMPLATES = new Map<VastPlant['kind'], THREE.BufferGeometry>()
function template(kind: VastPlant['kind']): THREE.BufferGeometry {
  let t = TEMPLATES.get(kind)
  if (!t) {
    t = plantTemplate(kind)
    TEMPLATES.set(kind, t)
  }
  return t
}

// ---------------- geometria terreno chunk ----------------

function chunkGroundGeometry(cx: number, cz: number, cfg: VastConfig): THREE.BufferGeometry {
  const n = Math.round(CHUNK / STEP) + 1 // vertici per lato
  const ox = cx * CHUNK
  const oz = cz * CHUNK
  const pos = new Float32Array(n * n * 3)
  const col = new Float32Array(n * n * 3)
  const idx: number[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ox + i * STEP
      const z = oz + j * STEP
      const h = vastHeight(x, z, cfg)
      const k = (j * n + i) * 3
      pos[k] = x
      pos[k + 1] = h
      pos[k + 2] = z
      const slope = vastSlope(x, z, cfg)
      const c = vastColor(x, z, h, slope, cfg)
      col[k] = c[0]
      col[k + 1] = c[1]
      col[k + 2] = c[2]
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      const b = a + 1
      const c2 = a + n
      const d = c2 + 1
      idx.push(a, c2, b, b, c2, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

function chunkPlantsGeometry(plants: VastPlant[]): THREE.BufferGeometry | null {
  if (!plants.length) return null
  const parts: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const t = new THREE.Vector3()
  for (const p of plants) {
    const tpl = template(p.kind)
    const g = tpl.clone()
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot)
    s.setScalar(p.scale)
    t.set(p.x, p.y - 0.06, p.z)
    m.compose(t, q, s)
    g.applyMatrix4(m)
    parts.push(g)
  }
  const merged = mergeGeometries(parts, false) ?? null
  parts.forEach(p => p.dispose())
  if (merged) merged.computeVertexNormals()
  return merged
}

// ---------------- chunk React ----------------

type ChunkData = { ground: THREE.BufferGeometry; plants: THREE.BufferGeometry | null }

const chunkCache = new Map<string, ChunkData>()

function buildChunk(cx: number, cz: number, cfg: VastConfig): ChunkData {
  const key = `${cx},${cz}`
  const hit = chunkCache.get(key)
  if (hit) return hit
  const ground = chunkGroundGeometry(cx, cz, cfg)
  const plants = chunkPlantsGeometry(vastPlants(ox(cx), ox(cz), ox(cx + 1), ox(cz + 1), cfg))
  const data = { ground, plants }
  chunkCache.set(key, data)
  // cache LRU semplice: oltre 900 chunk smonta i più vecchi
  if (chunkCache.size > 900) {
    const first = chunkCache.keys().next().value as string | undefined
    if (first && first !== key) {
      const old = chunkCache.get(first)
      old?.ground.dispose()
      old?.plants?.dispose()
      chunkCache.delete(first)
    }
  }
  return data
}

function ox(c: number): number {
  return c * CHUNK
}

function ChunkMesh({ cx, cz, cfg }: { cx: number; cz: number; cfg: VastConfig }) {
  const data = useMemo(() => buildChunk(cx, cz, cfg), [cx, cz, cfg])
  useEffect(() => {
    return () => {
      // niente dispose qui: la cache riutilizza le geometrie
    }
  }, [data])
  return (
    <group>
      <mesh geometry={data.ground} receiveShadow castShadow={false}>
        <meshStandardMaterial vertexColors roughness={0.96} metalness={0} />
      </mesh>
      {data.plants && (
        <mesh geometry={data.plants} castShadow receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
        </mesh>
      )}
    </group>
  )
}

// ---------------- acqua ----------------

function VastWater({ cfg }: { cfg: VastConfig }) {
  const ref = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const atmo = vastAtmo(cfg.tod)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.x = camera.position.x
    ref.current.position.z = camera.position.z
    const mat = ref.current.material as THREE.MeshStandardMaterial
    mat.opacity = 0.82 + Math.sin(clock.elapsedTime * 0.8) * 0.03
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]}>
      <planeGeometry args={[2400, 2400]} />
      <meshStandardMaterial color={atmo.waterColor} transparent opacity={0.85} roughness={0.15} metalness={0.35} />
    </mesh>
  )
}

// ---------------- manager chunk ----------------

function ChunkManager({ cfg, ready }: { cfg: VastConfig; ready: number }) {
  const [chunks, setChunks] = useState<[number, number][]>([])
  const { camera } = useThree()
  const queue = useRef<[number, number][]>([])
  const built = useRef<Set<string>>(new Set())
  const [, force] = useState(0)
  const radius = qualityRadius(cfg.quality)

  // pianifica i chunk attorno alla camera, uno alla volta
  useFrame(() => {
    const pcx = Math.floor(camera.position.x / CHUNK)
    const pcz = Math.floor(camera.position.z / CHUNK)
    const needed: [number, number][] = []
    const want = new Set<string>()
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > (radius + 0.4) * (radius + 0.4)) continue
        const cx = pcx + dx
        const cz = pcz + dz
        const key = `${cx},${cz}`
        want.add(key)
        if (!built.current.has(key)) needed.push([cx, cz])
      }
    }
    // smonta i chunk fuori raggio
    let removed = false
    for (const key of [...built.current]) {
      if (!want.has(key)) {
        const [cx, cz] = key.split(',').map(Number)
        const data = chunkCache.get(key)
        data?.ground.dispose()
        data?.plants?.dispose()
        chunkCache.delete(key)
        built.current.delete(key)
        removed = true
      }
    }
    // costruisce al massimo 2 chunk per frame (niente scatti)
    let added = false
    for (let i = 0; i < Math.min(2, needed.length); i++) {
      const [cx, cz] = needed[i]
      buildChunk(cx, cz, cfg)
      built.current.add(`${cx},${cz}`)
      added = true
    }
    if (added || removed) {
      setChunks([...built.current].map(k => k.split(',').map(Number) as [number, number]))
      force(x => x + 1)
    }
  })

  return (
    <group>
      {chunks.map(([cx, cz]) => (
        <ChunkMesh key={`${cx},${cz}-${ready}`} cx={cx} cz={cz} cfg={cfg} />
      ))}
    </group>
  )
}

// ---------------- ambiente (cielo, sole, nebbia) ----------------

function VastEnvironment({ cfg }: { cfg: VastConfig }) {
  const atmo = useMemo(() => vastAtmo(cfg.tod), [cfg.tod])
  const sunRef = useRef<THREE.DirectionalLight>(null)
  return (
    <group>
      <hemisphereLight args={[atmo.hemiSky, atmo.hemiGround, atmo.hemiIntensity]} />
      <ambientLight intensity={atmo.ambient} />
      <directionalLight
        ref={sunRef}
        position={atmo.sunPos}
        color={atmo.sunColor}
        intensity={atmo.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
      />
    </group>
  )
}

// ---------------- componente esportato ----------------

export default function VastWorld({ cfg }: { cfg: VastConfig }) {
  const atmo = useMemo(() => vastAtmo(cfg.tod), [cfg.tod])
  const [ready, setReady] = useState(0)
  const { scene } = useThree()
  useEffect(() => {
    setReady(r => r + 1)
    return () => {
      // pulizia cache quando si esce dal mondo
      chunkCache.forEach(d => {
        d.ground.dispose()
        d.plants?.dispose()
      })
      chunkCache.clear()
    }
  }, [scene])
  return (
    <group>
      <color attach="background" args={[atmo.sky]} />
      <fog attach="fog" args={[atmo.fogColor, atmo.fogNear, atmo.fogFar]} />
      <VastEnvironment cfg={cfg} />
      <ChunkManager cfg={cfg} ready={ready} />
      <VastWater cfg={cfg} />
    </group>
  )
}
