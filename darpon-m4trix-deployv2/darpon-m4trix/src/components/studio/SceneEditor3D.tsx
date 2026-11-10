'use client'

// ============================================================
// v16: SCENA 3D — l'editor dei giochi 3D dello Studio.
// Un vero banco di lavoro in 3D:
//  - ruota la visuale, clicca un oggetto e lo MUOVI con le
//    FRECCE rosse/verdi/blu (X/Y/Z), lo RUOTI e lo SCALI
//  - importi strutture, modelli e personaggi (anche animati)
//  - piazzi nemici, PNG, oggetti, porte e portale
//  - scegli l'animazione del personaggio principale
// Tutto viene salvato nel gioco: in ▶ GIOCA trovi esattamente
// quello che hai costruito qui.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Sky, TransformControls, useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Move3d, RotateCw, Scaling, Trash2, Copy, Camera } from 'lucide-react'
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
import { SkyDome, SculptedTerrain, IslandEnvironment, SunLight } from '../game/EditorScene'
import { useStructures, libraryAssetId } from '@/lib/structures-store'
import { fetchAuth } from '@/lib/http'
import {
  worldToSchematic,
  schematicToWorld,
  eid,
  type EntityKind,
  type GameEntity,
  type GameProject,
} from '@/lib/game2d/types'
import { parseVastConfig, vastHeight } from '@/lib/vastworld'
import VastWorld from '@/components/vastworld/VastWorld'
import { NoGLCard, webglSupported } from '../game/GLGuard'

type GizmoMode = 'translate' | 'rotate' | 'scale'

type PaletteItem = {
  key: string
  label: string
  icon: string
  group: string
  build: (x: number, y: number) => GameEntity
}

// ---------- terreno: altezza in un punto ----------
function useGroundY() {
  const terrain = useWorld(s => s.terrain)
  const version = useWorld(s => s.terrainVersion)
  const vast = useWorld(s => s.vast)
  return useMemo(() => {
    void version
    return (x: number, z: number) =>
      vast ? vastHeight(x, z, vast) : terrain ? terrainHeightAt(terrain, x, z) : 0
  }, [terrain, vast, version])
}

// ---------- modello GLB (centrato, a terra, animato) ----------
function GlbModel({
  url,
  scale = 1,
  rotY = 0,
  animIndex = null,
  spin,
  onClips,
}: {
  url: string
  scale?: number
  rotY?: number
  animIndex?: number | null
  spin?: React.MutableRefObject<number> | null
  onClips?: (names: string[]) => void
}) {
  const { scene, animations } = useGLTF(url)
  const mixer = useRef<THREE.AnimationMixer | null>(null)

  const prepared = useMemo(() => {
    const c = skeletonClone(scene)
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    const s = 1.8 / Math.max(size.y, 0.001)
    c.scale.setScalar(s)
    const box2 = new THREE.Box3().setFromObject(c)
    c.position.y = -box2.min.y
    c.position.x = -(box2.min.x + box2.max.x) / 2
    c.position.z = -(box2.min.z + box2.max.z) / 2
    return c
  }, [scene])

  // riporta le clip disponibili all'ispettore (una volta per url)
  const clipsNames = useMemo(() => animations.map(a => a.name), [animations])
  useEffect(() => {
    onClips?.(clipsNames)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  useEffect(() => {
    const m = new THREE.AnimationMixer(prepared)
    mixer.current = m
    const idx = animIndex != null && animations[animIndex] ? animIndex : 0
    const clip = animations[idx] ?? animations[0]
    let action: THREE.AnimationAction | null = null
    if (clip) action = m.clipAction(clip)
    action?.play()
    return () => {
      action?.stop()
      m.stopAllAction()
      mixer.current = null
    }
  }, [prepared, animations, animIndex])

  useFrame((_, dt) => {
    if (mixer.current) mixer.current.update(Math.min(dt, 0.05))
  })

  return (
    <group rotation={[0, (rotY * Math.PI) / 180, 0]} scale={scale}>
      <primitive object={prepared} dispose={null} />
    </group>
  )
}

// ---------- asset di struttura / oggetto builtin ----------
function AssetShape({ assetId, color = 0 }: { assetId: string; color?: number }) {
  const customAssets = useWorld(s => s.customAssets)
  const def = getAssetDef(assetId, customAssets)
  if (!def) return null
  const Render = def.render
  return <Render color={color} rot={0} />
}

// ---------- marker visuale di un'entità ----------
function EntityVisual({
  ent,
  spin,
  onClips,
}: {
  ent: GameEntity
  spin: React.MutableRefObject<number>
  onClips?: (id: string, names: string[]) => void
}) {
  const kind = ent.props.kind
  const color = ent.props.color ?? '#ff5a5a'
  const sc = ent.props.scale ?? 1
  const rot = ent.props.rotY ?? 0

  if (ent.type === 'deco' && (ent.props.glbUrl || ent.props.assetId)) {
    if (ent.props.glbUrl) {
      return (
        <GlbModel
          url={ent.props.glbUrl}
          scale={sc}
          rotY={rot}
          animIndex={ent.props.animIndex ?? null}
          onClips={names => onClips?.(ent.id, names)}
        />
      )
    }
    return (
      <group rotation={[0, (rot * Math.PI) / 180, 0]} scale={sc}>
        <AssetShape assetId={ent.props.assetId!} />
      </group>
    )
  }

  switch (ent.type) {
    case 'player':
      return (
        <group scale={sc} rotation={[0, (rot * Math.PI) / 180, 0]}>
          <mesh position={[0, 0.55, 0]}>
            <capsuleGeometry args={[0.32, 0.7, 6, 12]} />
            <meshStandardMaterial color={ent.props.color ?? '#00f0ff'} emissive={ent.props.color ?? '#00f0ff'} emissiveIntensity={0.55} />
          </mesh>
          <mesh position={[0, 1.45, 0]}>
            <octahedronGeometry args={[0.16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      )
    case 'enemy':
      return (
        <group scale={sc} rotation={[0, (rot * Math.PI) / 180, 0]}>
          <mesh position={[0, kind === 'boss' ? 1.15 : 0.62, 0]}>
            <capsuleGeometry args={[kind === 'boss' ? 0.55 : 0.34, kind === 'boss' ? 1.3 : 0.72, 6, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
          {kind === 'boss' && (
            <mesh position={[0, 2.3, 0]}>
              <sphereGeometry args={[0.14]} />
              <meshBasicMaterial color="#ff2bd6" />
            </mesh>
          )}
        </group>
      )
    case 'npc':
      return (
        <group scale={sc} rotation={[0, (rot * Math.PI) / 180, 0]}>
          <mesh position={[0, 0.6, 0]}>
            <capsuleGeometry args={[0.3, 0.66, 6, 12]} />
            <meshStandardMaterial color={ent.props.color ?? '#fcee0a'} emissive={ent.props.color ?? '#fcee0a'} emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 1.35, 0]}>
            <sphereGeometry args={[0.1]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      )
    case 'item':
      return (
        <group scale={sc} rotation={[0, spin.current, 0]}>
          <mesh position={[0, 0.5, 0]}>
            <octahedronGeometry args={[0.28]} />
            <meshStandardMaterial color={ent.props.kind === 'chiave' ? '#00f0ff' : ent.props.kind === 'pozione' ? '#7cffb2' : ent.props.kind === 'cassa' ? '#e8c35a' : '#fcee0a'} metalness={0.4} roughness={0.3} />
          </mesh>
        </group>
      )
    case 'door':
      return (
        <group scale={sc} rotation={[0, (rot * Math.PI) / 180, 0]}>
          <mesh position={[0, 1.1, 0]}>
            <torusGeometry args={[0.55, 0.09, 8, 24]} />
            <meshStandardMaterial color={ent.props.locked ? '#ff3355' : '#00f0ff'} emissive={ent.props.locked ? '#ff3355' : '#00f0ff'} emissiveIntensity={0.5} />
          </mesh>
        </group>
      )
    case 'goal':
      return (
        <group scale={sc} rotation={[0, (rot * Math.PI) / 180, 0]}>
          <mesh position={[0, 1.25, 0]}>
            <torusGeometry args={[0.7, 0.12, 10, 28]} />
            <meshStandardMaterial color="#fcee0a" emissive="#fcee0a" emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0, 1.25, 0]}>
            <sphereGeometry args={[0.3]} />
            <meshBasicMaterial color="#fff7c0" transparent opacity={0.5} />
          </mesh>
        </group>
      )
    default:
      return (
        <mesh scale={sc} position={[0, 0.4, 0]}>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color="#999" />
        </mesh>
      )
  }
}

// ---------- entità in scena: visuale + hitbox + gizmo ----------
function EntityMarker({
  ent,
  selected,
  onSelect,
  groups,
  spin,
  onClips,
}: {
  ent: GameEntity
  selected: boolean
  onSelect: (id: string | null) => void
  groups: React.MutableRefObject<Map<string, THREE.Group>>
  spin: React.MutableRefObject<number>
  onClips?: (id: string, names: string[]) => void
}) {
  const W = 32
  const H = 32
  const [wx, wz] = useMemo(() => schematicToWorld(ent.x, ent.y, W, H), [ent.x, ent.y])
  const groundY = useGroundY()
  const y = groundY(wx, wz)

  return (
    <group
      ref={g => {
        if (g) groups.current.set(ent.id, g)
        else groups.current.delete(ent.id)
      }}
      position={[wx, y, wz]}
    >
      {/* hitbox invisibile per il click */}
      <mesh
        position={[0, 0.9, 0]}
        visible={false}
        onPointerDown={e => {
          e.stopPropagation()
        }}
        onClick={e => {
          e.stopPropagation()
          if (e.delta > 6) return
          onSelect(ent.id)
        }}
      >
        <sphereGeometry args={[1.1]} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.95, 1.12, 32]} />
          <meshBasicMaterial color="#00e5ff" transparent opacity={0.9} />
        </mesh>
      )}
      <EntityVisual ent={ent} spin={spin} onClips={onClips} />
    </group>
  )
}

// ---------- gizmo: le FRECCE rosse/verdi/blu ----------
function Gizmo({
  id,
  groups,
  mode,
  onCommit,
}: {
  id: string | null
  groups: React.MutableRefObject<Map<string, THREE.Group>>
  mode: GizmoMode
  onCommit: (id: string, wx: number, wz: number, rotDeg: number, scale: number) => void
}) {
  const [target, setTarget] = useState<THREE.Object3D | null>(null)
  const drag = useRef<{ wx: number; wz: number; rot: number; sc: number } | null>(null)

  useEffect(() => {
    setTarget(id ? groups.current.get(id) ?? null : null)
  }, [id, groups])

  if (!target) return null
  return (
    <TransformControls
      object={target}
      mode={mode}
      size={0.9}
      onObjectChange={() => {
        drag.current = {
          wx: target.position.x,
          wz: target.position.z,
          rot: Math.round((target.rotation.y * 180) / Math.PI),
          sc: Math.max(0.1, Number(target.scale.x.toFixed(2))),
        }
      }}
      onMouseUp={() => {
        if (drag.current) {
          onCommit(id!, drag.current.wx, drag.current.wz, drag.current.rot, drag.current.sc)
          drag.current = null
        }
      }}
    />
  )
}

// ---------- piano di clic per piazzare nuovo ----------
function PlacePlane({
  enabled,
  onPlace,
}: {
  enabled: boolean
  onPlace: (wx: number, wz: number) => void
}) {
  if (!enabled) return null
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      visible={false}
      onPointerDown={e => {
        if (e.button !== 0) return
        e.stopPropagation()
        onPlace(e.point.x, e.point.z)
      }}
    >
      <planeGeometry args={[GRID_HALF * 2 + 2, GRID_HALF * 2 + 2]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

// ---------- rotore per gli oggetti (gira lentamente) ----------
function SpinLoop({ spin }: { spin: React.MutableRefObject<number> }) {
  useFrame((_, dt) => {
    spin.current += dt * 0.9
  })
  return null
}

// ---------- mondo importato (terreno + oggetti del mondo) ----------
function EditorWorld() {
  const objects = useWorld(s => s.objects)
  const customAssets = useWorld(s => s.customAssets)
  const vast = useWorld(s => s.vast)
  const groundY = useGroundY()
  return (
    <group>
      {vast ? <VastWorld cfg={vast} /> : <SculptedTerrain />}
      {objects.map((o: WO) => {
        const def = getAssetDef(o.asset, customAssets)
        if (!def) return null
        const Render = def.render
        return (
          <group key={o.id} position={[o.x, groundY(o.x, o.z), o.z]}>
            <Render color={o.color} rot={o.rot} scale={o.scale} />
          </group>
        )
      })}
    </group>
  )
}

// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================
export default function SceneEditor3D({
  project,
  mutate,
  onClose,
}: {
  project: GameProject
  mutate: (fn: (p: GameProject) => void) => void
  onClose: () => void
}) {
  const scene = project.scenes[0]
  const W = scene?.w ?? 32
  const H = scene?.h ?? 32
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<GizmoMode>('translate')
  const [placing, setPlacing] = useState<PaletteItem | null>(null)
  const [cameraMode, setCameraMode] = useState(false)
  const [clips, setClips] = useState<Record<string, string[]>>({})
  const [glOK] = useState(() => webglSupported())
  const groups = useRef<Map<string, THREE.Group>>(new Map())
  const spin = useRef(0)

  const entities = scene?.entities ?? []
  const selected = entities.find(e => e.id === selectedId) ?? null
  const customAssets = useWorld(s => s.customAssets)

  // ---------- carica il mondo del gioco (come fa il player) ----------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const id = project.settings.worldProjectId
        const selfVast = project.settings.vast ?? null
        let st: ReturnType<typeof parseState>
        if (id) {
          const res = await fetchAuth(`/api/projects/${id}`)
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data.project) throw new Error('Mondo non trovato: collegalo dall\'editor (sezione Mondo)')
          st = parseState(data.project.state)
        } else if (selfVast) {
          st = { ...parseState(null), vast: parseVastConfig(selfVast) }
        } else {
          throw new Error('Nessun mondo: apri la sezione MONDO e crea il Mondo Vasto del gioco')
        }
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
          vast: st.vast ?? null,
          brush: 'none',
          playMode: false,
          selectedAsset: null,
        })
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : 'Errore di caricamento')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ESC annulla piazzamento / deseleziona / chiude
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (placing) { setPlacing(null); return }
      if (selectedId) { setSelectedId(null); return }
      onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [placing, selectedId, onClose])

  // ---------- commit dalla gizmo al progetto ----------
  const commitGizmo = useCallback(
    (id: string, wx: number, wz: number, rotDeg: number, sc: number) => {
      mutate(p => {
        const sc0 = p.scenes[0]
        if (!sc0) return
        const ent = sc0.entities.find(e => e.id === id)
        if (!ent) return
        const [sx, sy] = worldToSchematic(wx, wz, sc0.w, sc0.h)
        ent.x = sx
        ent.y = sy
        ent.props.rotY = ((rotDeg % 360) + 360) % 360
        if (sc !== 1) ent.props.scale = Number(sc.toFixed(2))
        else delete ent.props.scale
      })
    },
    [mutate]
  )

  // ---------- piazzamento ----------
  const placeAt = useCallback(
    (wx: number, wz: number) => {
      if (!placing) return
      const [sx, sy] = worldToSchematic(wx, wz, W, H)
      const ent = placing.build(sx, sy)
      mutate(p => {
        const sc0 = p.scenes[0]
        if (!sc0) return
        if (ent.type === 'player') {
          const old = sc0.entities.find(e => e.type === 'player')
          if (old) { old.x = ent.x; old.y = ent.y; return }
        }
        if (ent.type === 'goal') {
          // un solo portale: sposta quello esistente
          const old = sc0.entities.find(e => e.type === 'goal')
          if (old) { old.x = ent.x; old.y = ent.y; return }
        }
        sc0.entities.push(ent)
      })
      setSelectedId(null)
      toast.success(`${placing.icon} ${placing.label} piazzato: cliccalo per spostarlo con le frecce`)
      setPlacing(null)
    },
    [placing, mutate, W, H]
  )

  // ---------- palette ----------
  const palette: PaletteItem[] = useMemo(() => {
    const items: PaletteItem[] = []
    // strutture e modelli importati
    for (const a of customAssets) {
      if (a.kind === 'structure') {
        items.push({
          key: `st_${a.id}`,
          label: a.name,
          icon: '🏗️',
          group: 'Strutture & Modelli',
          build: (x, y) => ({ id: eid(), type: 'deco', x, y, props: { assetId: a.id, name: a.name, solid: false } }),
        })
      } else if (a.url) {
        items.push({
          key: `glb_${a.id}`,
          label: a.name.replace(/\.glb$/i, ''),
          icon: '📦',
          group: 'Strutture & Modelli',
          build: (x, y) => ({ id: eid(), type: 'deco', x, y, props: { glbUrl: a.url!, glbName: a.name, name: a.name.replace(/\.glb$/i, ''), solid: true } }),
        })
      }
    }
    // nemici
    const enemyKinds: { k: EntityKind; label: string; color: string; hp: number }[] = [
      { k: 'soldato', label: 'Soldato', color: '#ff5a8a', hp: 60 },
      { k: 'zombie', label: 'Zombie', color: '#7cffb2', hp: 50 },
      { k: 'slime', label: 'Slime', color: '#a3ff12', hp: 30 },
      { k: 'drone', label: 'Drone volante', color: '#00f0ff', hp: 40 },
      { k: 'guardiano', label: 'Guardiano', color: '#b26bff', hp: 120 },
      { k: 'golem', label: 'Golem', color: '#ffb43a', hp: 180 },
      { k: 'ratto', label: 'Ratto', color: '#cd9663', hp: 20 },
      { k: 'turret', label: 'Torretta', color: '#ff3355', hp: 80 },
      { k: 'boss', label: 'BOSS', color: '#ff2bd6', hp: 300 },
    ]
    for (const ek of enemyKinds) {
      items.push({
        key: `en_${ek.k}`,
        label: ek.label,
        icon: ek.k === 'boss' ? '💀' : '👹',
        group: 'Nemici',
        build: (x, y) => ({ id: eid(), type: 'enemy', x, y, props: { kind: ek.k, hp: ek.hp, dmg: ek.k === 'boss' ? 26 : 12, speed: ek.k === 'drone' ? 3.4 : 2.2, color: ek.color } }),
      })
    }
    // PNG
    items.push({
      key: 'npc',
      label: 'PNG (parla)',
      icon: '🧑',
      group: 'PNG & Personaggi',
      build: (x, y) => ({ id: eid(), type: 'npc', x, y, props: { name: 'Nuovo PNG', color: '#fcee0a', pages: ['Ciao, viandante!'] } }),
    })
    // oggetti di gioco
    const itemKinds: { k: EntityKind; label: string; icon: string }[] = [
      { k: 'moneta', label: 'Moneta', icon: '🪙' },
      { k: 'pozione', label: 'Pozione', icon: '🧪' },
      { k: 'chiave', label: 'Chiave', icon: '🔑' },
      { k: 'cassa', label: 'Cassa', icon: '🎁' },
    ]
    for (const ik of itemKinds) {
      items.push({
        key: `it_${ik.k}`,
        label: ik.label,
        icon: ik.icon,
        group: 'Oggetti di gioco',
        build: (x, y) => ({ id: eid(), type: 'item', x, y, props: { kind: ik.k, amount: ik.k === 'cassa' ? 5 : 1 } }),
      })
    }
    // speciali
    items.push({
      key: 'start',
      label: 'Partenza eroe',
      icon: '★',
      group: 'Speciali',
      build: (x, y) => ({ id: eid(), type: 'player', x, y, props: { name: 'Eroe', color: '#00f0ff' } }),
    })
    items.push({
      key: 'goal',
      label: 'Portale obiettivo',
      icon: '🌀',
      group: 'Speciali',
      build: (x, y) => ({ id: eid(), type: 'goal', x, y, props: {} }),
    })
    items.push({
      key: 'door',
      label: 'Porta → interno',
      icon: '🚪',
      group: 'Speciali',
      build: (x, y) => ({ id: eid(), type: 'door', x, y, props: { locked: false } }),
    })
    return items
  }, [customAssets])

  const groupsOrder = ['Strutture & Modelli', 'Nemici', 'PNG & Personaggi', 'Oggetti di gioco', 'Speciali']
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>()
    for (const it of palette) {
      if (!map.has(it.group)) map.set(it.group, [])
      map.get(it.group)!.push(it)
    }
    return map
  }, [palette])

  // ---------- azioni ispettore ----------
  const updateSel = (fn: (e: GameEntity) => void) => {
    if (!selectedId) return
    mutate(p => {
      const ent = p.scenes[0]?.entities.find(e => e.id === selectedId)
      if (ent) fn(ent)
    })
  }
  const deleteSel = () => {
    if (!selectedId) return
    mutate(p => {
      const sc0 = p.scenes[0]
      if (sc0) sc0.entities = sc0.entities.filter(e => e.id !== selectedId)
    })
    setSelectedId(null)
  }
  const duplicateSel = () => {
    if (!selected) return
    const copy: GameEntity = JSON.parse(JSON.stringify(selected))
    copy.id = eid()
    copy.x = Math.min(W - 1, copy.x + 1)
    mutate(p => p.scenes[0]?.entities.push(copy))
  }

  // PG: modelli con url (per scegliere il personaggio principale)
  const glbAssets = customAssets.filter(a => a.url)
  const selClips = selectedId ? clips[selectedId] ?? null : null

  if (!glOK) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[var(--site-bg)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2">
          <span className="neon-text text-sm font-bold uppercase">Scena 3D</span>
          <Button size="sm" variant="outline" onClick={onClose}>✕ Chiudi</Button>
        </div>
        <div className="flex flex-1 items-center justify-center"><NoGLCard /></div>
      </div>
    )
  }

  const theme = getTheme('realistico')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--site-bg)]">
      {/* barra superiore */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2">
        <Button size="sm" variant="outline" className="cp-btn" onClick={onClose}>← Editor</Button>
        <span className="neon-text truncate font-[family-name:var(--font-display)] text-sm font-bold tracking-widest uppercase">
          🛠 Scena 3D — {project.title}
        </span>
        <span className="cp-chip hidden md:inline-block">clicca un oggetto → frecce rosse/verdi/blu</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant={mode === 'translate' ? 'default' : 'outline'}
            className="cp-btn"
            title="Sposta con le frecce X (rossa) Y (verde) Z (blu)"
            onClick={() => setMode('translate')}
          >
            <Move3d className="mr-1 h-3.5 w-3.5" /> Sposta
          </Button>
          <Button
            size="sm"
            variant={mode === 'rotate' ? 'default' : 'outline'}
            className="cp-btn"
            onClick={() => setMode('rotate')}
          >
            <RotateCw className="mr-1 h-3.5 w-3.5" /> Ruota
          </Button>
          <Button
            size="sm"
            variant={mode === 'scale' ? 'default' : 'outline'}
            className="cp-btn"
            title="Allarga o riduci con i cubetti"
            onClick={() => setMode('scale')}
          >
            <Scaling className="mr-1 h-3.5 w-3.5" /> Scala
          </Button>
          <Button
            size="sm"
            variant={cameraMode ? 'default' : 'outline'}
            className="cp-btn"
            title="Ruota la visuale anche col tasto sinistro"
            onClick={() => setCameraMode(c => !c)}
          >
            <Camera className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--neon)]" />
          <p className="text-sm text-[var(--tx-dim)]">Preparo la scena 3D…</p>
        </div>
      ) : errMsg ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="cp-panel cp-panel-neon max-w-md p-6 text-center">
            <p className="neon-text-2 mb-2 text-lg font-bold">Mondo non pronto</p>
            <p className="text-sm text-[var(--tx-dim)]">{errMsg}</p>
            <Button className="cp-btn mt-4" onClick={onClose}>← Torna all'editor</Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* ----- colonna sinistra: aggiungi alla scena ----- */}
          <div className="flex w-56 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-3 py-2">
              <p className="neon-text text-[11px] font-bold tracking-[0.18em] uppercase">Aggiungi alla scena</p>
              <p className="mt-0.5 text-[10px] leading-tight text-[var(--tx-faint)]">
                Scegli un elemento, poi clicca il terreno per piazzarlo.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {placing && (
                <div className="mb-2 rounded-lg border border-[var(--neon)] bg-[var(--primary-soft)] px-2 py-1.5 text-[11px] text-[var(--tx)]">
                  👆 Clicca il terreno per piazzare <b>{placing.label}</b>
                  <button className="ml-1 underline" onClick={() => setPlacing(null)}>annulla</button>
                </div>
              )}
              {groupsOrder.map(gname => {
                const items = grouped.get(gname)
                if (!items?.length) return null
                return (
                  <div key={gname} className="mb-2">
                    <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--tx-faint)]">{gname}</p>
                    <div className="flex flex-col gap-0.5">
                      {items.map(it => (
                        <button
                          key={it.key}
                          onClick={() => setPlacing(it)}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                            placing?.key === it.key
                              ? 'bg-[var(--primary-soft)] font-bold text-[var(--tx)] ring-1 ring-[var(--neon)]'
                              : 'text-[var(--tx-dim)] hover:bg-[var(--panel-hover)]'
                          }`}
                        >
                          <span className="w-4 text-center text-sm leading-none">{it.icon}</span>
                          <span className="truncate">{it.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ----- canvas 3D ----- */}
          <div className="relative min-w-0 flex-1">
            <Canvas
              shadows
              dpr={[1, 2]}
              camera={{ fov: 50, near: 0.1, far: 600, position: [14, 13, 18] }}
              onContextMenu={e => e.preventDefault()}
              onPointerMissed={() => setSelectedId(null)}
            >
              <Suspense fallback={null}>
                {useWorld.getState().vast ? null : <color attach="background" args={[theme.sky]} />}
                {useWorld.getState().vast ? null : <fog attach="fog" args={[theme.fogColor, theme.fogNear, theme.fogFar]} />}
                {useWorld.getState().vast ? null : useWorld.getState().skyboxUrl ? <SkyDome /> : <Sky sunPosition={theme.sunPosition} turbidity={theme.turbidity} rayleigh={theme.rayleigh} />}
                {useWorld.getState().vast ? null : <SunLight />}
                {useWorld.getState().vast ? null : <IslandEnvironment />}
                <EditorWorld />
                <SpinLoop spin={spin} />
                {entities.map(e => (
                  <EntityMarker
                    key={e.id}
                    ent={e}
                    selected={e.id === selectedId}
                    onSelect={setSelectedId}
                    groups={groups}
                    spin={spin}
                    onClips={(id, names) => setClips(prev => (prev[id]?.length === names.length ? prev : { ...prev, [id]: names }))}
                  />
                ))}
                <PlacePlane enabled={!!placing} onPlace={placeAt} />
                <Gizmo id={selectedId} groups={groups} mode={mode} onCommit={commitGizmo} />
                <OrbitControls
                  makeDefault
                  enablePan
                  minDistance={3}
                  maxDistance={110}
                  maxPolarAngle={Math.PI / 2.06}
                  target={[0, 0, 0]}
                  mouseButtons={{
                    LEFT: (cameraMode && !placing ? THREE.MOUSE.ROTATE : -1) as unknown as THREE.MOUSE,
                    MIDDLE: THREE.MOUSE.ROTATE,
                    RIGHT: THREE.MOUSE.ROTATE,
                  }}
                  touches={{
                    ONE: (cameraMode && !placing ? THREE.TOUCH.ROTATE : -1) as unknown as THREE.TOUCH,
                    TWO: THREE.TOUCH.DOLLY_ROTATE,
                  }}
                />
              </Suspense>
            </Canvas>

            {/* suggerimento controlli */}
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
              <div className="rounded-full bg-black/55 px-4 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur">
                {placing
                  ? `👆 clicca il terreno per piazzare: ${placing.label}`
                  : 'trascina col DESTRO per ruotare · rotella = zoom · clicca un oggetto e usalo con le frecce'}
              </div>
            </div>
          </div>

          {/* ----- colonna destra: ispettore ----- */}
          <div className="flex w-72 shrink-0 flex-col border-l border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] px-3 py-2">
              <p className="neon-text text-[11px] font-bold tracking-[0.18em] uppercase">Ispettore</p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 text-xs">
              {selected ? (
                <div className="flex flex-col gap-3">
                  <div className="cp-chip cp-chip-active w-fit">{selected.type.toUpperCase()}</div>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)]">Nome</span>
                    <Input
                      className="h-7 bg-[var(--panel-soft)] text-xs"
                      value={selected.props.name ?? ''}
                      onChange={e => updateSel(en => { en.props.name = e.target.value })}
                    />
                  </label>
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)]">Strumento</span>
                    <div className="mt-1 grid grid-cols-3 gap-1">
                      {(
                        [
                          { m: 'translate' as GizmoMode, l: 'Sposta' },
                          { m: 'rotate' as GizmoMode, l: 'Ruota' },
                          { m: 'scale' as GizmoMode, l: 'Scala' },
                        ]
                      ).map(x => (
                        <button
                          key={x.m}
                          onClick={() => setMode(x.m)}
                          className={`rounded-lg px-1 py-1.5 text-[11px] font-bold ring-1 transition-colors ${
                            mode === x.m
                              ? 'bg-[var(--primary)] text-white ring-[var(--primary)]'
                              : 'text-[var(--tx-dim)] ring-[var(--line)] hover:bg-[var(--panel-hover)]'
                          }`}
                        >
                          {x.l}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] leading-tight text-[var(--tx-faint)]">
                      Sposta: <b className="text-red-400">rossa</b> = destra/sinistra, <b className="text-green-400">verde</b> = su/giù, <b className="text-blue-400">blu</b> = avanti/indietro.
                    </p>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)]">
                      Dimensione: {(selected.props.scale ?? 1).toFixed(2)}×
                    </span>
                    <input
                      type="range"
                      min={0.2}
                      max={4}
                      step={0.05}
                      value={selected.props.scale ?? 1}
                      onChange={e => updateSel(en => { en.props.scale = Number(e.target.value) })}
                      className="accent-[var(--neon)]"
                    />
                  </label>
                  {selClips && selClips.length > 0 && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)]">
                        🎬 Animazione ({selClips.length} disponibili)
                      </span>
                      <select
                        className="h-7 w-full bg-[var(--panel-soft)] px-1 ring-1 ring-[var(--line)]"
                        value={selected.props.animIndex ?? 0}
                        onChange={e => updateSel(en => { en.props.animIndex = Number(e.target.value) })}
                      >
                        {selClips.map((c, i) => (
                          <option key={i} value={i}>{c || `movimento ${i + 1}`}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {selected.type === 'npc' && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)]">Dialoghi (una frase per riga)</span>
                      <textarea
                        className="min-h-20 w-full bg-[var(--panel-soft)] p-2 text-xs text-[var(--tx)] ring-1 ring-[var(--line)]"
                        value={(selected.props.pages ?? []).join('\n')}
                        onChange={e => updateSel(en => { en.props.pages = e.target.value.split('\n').filter(Boolean) })}
                      />
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button size="sm" variant="outline" className="cp-btn" onClick={duplicateSel}>
                      <Copy className="mr-1 h-3 w-3" /> Duplica
                    </Button>
                    <Button size="sm" variant="outline" className="cp-btn text-red-400" onClick={deleteSel}>
                      <Trash2 className="mr-1 h-3 w-3" /> Elimina
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-[var(--tx-dim)]">
                  <p>Nessun oggetto selezionato.</p>
                  <p className="leading-relaxed text-[var(--tx-faint)]">
                    • Scegli un elemento a <b className="text-[var(--neon)]">sinistra</b> e clicca il terreno per piazzarlo.<br />
                    • Clicca un oggetto nella scena: lo <b className="text-[var(--neon)]">sposti</b> con le frecce rosse/verdi/blu, lo <b className="text-[var(--neon)]">ruoti</b> e lo <b className="text-[var(--neon)]">allarghi</b>.<br />
                    • ESC per annullare o uscire.
                  </p>
                </div>
              )}

              {/* PERSONAGGIO PRINCIPALE */}
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--tx-faint)]">🧍 Personaggio principale</p>
                <p className="mt-1 text-[10px] leading-tight text-[var(--tx-faint)]">
                  Chi interpreti in ▶ GIOCA. Scegli tra i tuoi modelli (anche animati!).
                </p>
                <select
                  className="mt-1.5 h-7 w-full bg-[var(--panel-soft)] px-1 ring-1 ring-[var(--line)]"
                  value={project.settings.playerModelUrl ?? ''}
                  onChange={e => {
                    const m = glbAssets.find(x => x.url === e.target.value)
                    mutate(p => {
                      p.settings.playerModelUrl = m?.url ?? null
                      p.settings.playerModelName = m?.name ?? null
                      if (!m) p.settings.playerAnimIndex = null
                    })
                  }}
                >
                  <option value="">Eroe classico</option>
                  {glbAssets.map(m => (
                    <option key={m.id} value={m.url!}>🧊 {m.name.replace(/\.glb$/i, '')}</option>
                  ))}
                </select>
                {project.settings.playerModelUrl && (
                  <PlayerAnimPicker
                    url={project.settings.playerModelUrl}
                    value={project.settings.playerAnimIndex ?? null}
                    onChange={i => mutate(p => { p.settings.playerAnimIndex = i })}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- scegli l'animazione del PG ----------
function PlayerAnimPicker({
  url,
  value,
  onChange,
}: {
  url: string
  value: number | null
  onChange: (i: number | null) => void
}) {
  const [names, setNames] = useState<string[] | null>(null)
  if (!names) {
    return (
      <Suspense fallback={<p className="mt-1 text-[10px] text-[var(--tx-faint)]">leggo le animazioni…</p>}>
        <ClipProbe url={url} onNames={setNames} value={value} onChange={onChange} />
      </Suspense>
    )
  }
  if (names.length === 0) {
    return <p className="mt-1 text-[10px] text-[var(--tx-faint)]">Questo modello non ha animazioni: si muoverà con il movimento classico.</p>
  }
  return (
    <label className="mt-1.5 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--tx-dim)]">🎬 Movimento del PG ({names.length} scelte)</span>
      <select
        className="h-7 w-full bg-[var(--panel-soft)] px-1 ring-1 ring-[var(--line)]"
        value={value ?? 0}
        onChange={e => onChange(Number(e.target.value))}
      >
        {names.map((n, i) => (
          <option key={i} value={i}>{n || `movimento ${i + 1}`}</option>
        ))}
      </select>
      <span className="text-[10px] text-[var(--tx-faint)]">
        In gioco il modello userà sempre questo movimento (in loop).
      </span>
    </label>
  )
}

function ClipProbe({
  url,
  onNames,
  value,
  onChange,
}: {
  url: string
  onNames: (n: string[]) => void
  value: number | null
  onChange: (i: number | null) => void
}) {
  const { animations } = useGLTF(url)
  const names = useMemo(() => animations.map(a => a.name), [animations])
  useEffect(() => {
    onNames(names)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  void value
  void onChange
  return null
}
