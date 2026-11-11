'use client'

// ============================================================
// DARPX ENGINE — STUDIO REALISTICO (v17)
// L'ambiente "serio" del Game Studio: editor 3D stile Blender
// (palette, gizmo, ispettore PBR, ambiente, post-processing)
// e player in prima persona con mouse catturato (pointer lock),
// ESC per liberarlo, gravità, salto e collisioni vere.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls } from '@react-three/drei'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { fetchAuth } from '@/lib/http'
import { saveGame, type GameMeta } from '@/lib/game2d/persist'
import type { GameProject } from '@/lib/game2d/types'
import { sfx, unlockAudio } from '@/lib/game2d/sfx'
import { NoGLCard, webglSupported } from '@/components/game/GLGuard'
import {
  REAL_TEMPLATES,
  ENV_PRESETS,
  newRealWorld,
  rid,
  type RLightObj,
  type RObject,
  type RSkyPreset,
  type RWorld,
} from '@/lib/engine3d/types'
import { PREFABS, PREFAB_DEFS, type PrefabCat } from '@/lib/engine3d/prefabs'
import { collideAndGround, safeSpawn, worldColliders } from '@/lib/engine3d/builder'
import { GlbView, LightView, PostFXView, PrefabView, RealEnv, WorldObjects } from './RealisticViews'

type Props = {
  meta: GameMeta
  onBack: () => void
  onSaved: (m: GameMeta) => void
  initialMode?: 'edit' | 'play'
}

type GizmoMode = 'translate' | 'rotate' | 'scale'

const CAT_LABEL: Record<PrefabCat | 'luce' | 'glb', string> = {
  ambiente: 'Ambienti',
  struttura: 'Strutture',
  prop: 'Arredi',
  luce: 'Luci',
  glb: 'Personaggi',
}

// ============================================================
// piccoli controlli UI
// ============================================================

function NumField({
  label, value, onChange, step = 0.1, min, max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="w-4 shrink-0 text-[10px] font-bold uppercase text-[var(--tx-faint)]">{label}</span>
      <input
        type="number"
        value={Math.round(value * 1000) / 1000}
        step={step}
        min={min}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
        className="h-7 w-full min-w-0 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-1.5 font-mono text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]"
      />
    </label>
  )
}

function Slider({
  label, value, onChange, min = 0, max = 1, step = 0.01, fmt,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  fmt?: (v: number) => string
}) {
  return (
    <label className="block">
      <span className="mb-0.5 flex justify-between text-[11px] text-[var(--tx-dim)]">
        {label}
        <span className="font-mono text-[var(--tx)]">{fmt ? fmt(value) : value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--neon)]"
      />
    </label>
  )
}

// ============================================================
// EDITOR: piano di piazzamento con ghost
// ============================================================

function PlacePlane({
  placing,
  rotDeg,
  snap = true,
  onPlace,
}: {
  placing: PlacingDef | null
  rotDeg: number
  snap?: boolean
  onPlace: (p: THREE.Vector3) => void
}) {
  const [ghost, setGhost] = useState<THREE.Vector3 | null>(null)
  useEffect(() => {
    if (!placing) setGhost(null)
  }, [placing])
  if (!placing) return null
  const quantize = (p: THREE.Vector3) => {
    if (snap) {
      p.x = Math.round(p.x * 2) / 2
      p.z = Math.round(p.z * 2) / 2
    }
    p.y = 0
    return p
  }
  const size: [number, number, number] =
    placing.kind === 'light'
      ? [0.3, 0.3, 0.3]
      : placing.kind === 'prefab'
        ? (PREFABS[placing.prefab]?.size ?? [1, 1, 1])
        : [0.6, 1.7, 0.6] // personaggio GLB
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        onPointerMove={e => {
          e.stopPropagation()
          setGhost(quantize(e.point.clone()))
        }}
        onPointerOut={() => setGhost(null)}
        onPointerDown={e => {
          e.stopPropagation()
          onPlace(quantize(e.point.clone()))
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {ghost && (
        <group position={ghost}>
          <lineSegments position={[0, size[1] / 2, 0]} rotation={[0, THREE.MathUtils.degToRad(rotDeg), 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(size[0], size[1], size[2])]} />
            <lineBasicMaterial color="#19e0ff" transparent opacity={0.65} depthTest={false} />
          </lineSegments>
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.22, 0.3, 24]} />
            <meshBasicMaterial color="#19e0ff" transparent opacity={0.8} />
          </mesh>
        </group>
      )}
    </>
  )
}

// ============================================================
// EDITOR: gizmo su l'oggetto selezionato
// ============================================================

function Gizmo({
  target,
  mode,
  onCommit,
}: {
  target: THREE.Object3D | null
  mode: GizmoMode
  onCommit: () => void
}) {
  if (!target) return null
  return (
    <TransformControls
      object={target}
      mode={mode}
      size={0.85}
      onMouseUp={onCommit}
    />
  )
}

/** spia la camera e, all'apertura (o a cambio template), la porta
 *  dietro lo spawn guardando nella direzione di gioco */
function EditorSpy({
  controlsRef,
  camRef,
  spawn,
  spawnYaw,
  spawnSig,
}: {
  controlsRef: React.MutableRefObject<unknown>
  camRef: React.MutableRefObject<THREE.PerspectiveCamera | null>
  spawn: [number, number, number]
  spawnYaw: number
  spawnSig: string
}) {
  const controls = useThree(s => s.controls)
  const camera = useThree(s => s.camera)
  useEffect(() => {
    controlsRef.current = controls
  }, [controls, controlsRef])
  useEffect(() => {
    camRef.current = camera as THREE.PerspectiveCamera
  }, [camera, camRef])
  // inquadratura iniziale: poco dietro lo spawn, DENTRO l'ambiente,
  // spostata un po' a sinistra: si vede la scena come la vedrà il giocatore
  useEffect(() => {
    if (!controls) return
    const c = controls as unknown as { target: THREE.Vector3; update: () => void }
    const key = spawnSig
    if ((c.target as THREE.Vector3 & { __sig?: string }).__sig === key) return
    ;(c.target as THREE.Vector3 & { __sig?: string }).__sig = key
    const fwd = new THREE.Vector3(-Math.sin(spawnYaw), 0, -Math.cos(spawnYaw))
    const right = new THREE.Vector3(Math.cos(spawnYaw), 0, -Math.sin(spawnYaw))
    const sp = new THREE.Vector3(spawn[0], spawn[1], spawn[2])
    camera.position.copy(
      sp.clone().addScaledVector(fwd, 1.2).addScaledVector(right, -1.1).add(new THREE.Vector3(0, 1.9, 0))
    )
    c.target.copy(sp.clone().addScaledVector(fwd, 7).add(new THREE.Vector3(0, 1.2, 0)))
    c.update()
  }, [controls, camera, spawn, spawnYaw, spawnSig])
  return null
}

// ============================================================
// PLAY: controller in prima persona
// ============================================================

const WALK_SPEED = 4.4
const RUN_SPEED = 8.2
const JUMP_VEL = 7.6
const GRAVITY = 24

function PlayRig({
  world,
  lookRef,
}: {
  world: RWorld
  lookRef: React.MutableRefObject<{ yaw: number; pitch: number }>
}) {
  const { camera } = useThree()
  const colliders = useMemo(() => worldColliders(world), [world])
  const pos = useRef(safeSpawn(world, colliders))
  const vel = useRef(new THREE.Vector3())
  const keys = useRef<Record<string, boolean>>({})
  const bob = useRef(0)
  const stepT = useRef(0)
  const fovRef = useRef(70)

  useEffect(() => {
    const set = (code: string, down: boolean) => {
      keys.current[code] = down
    }
    const dn = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault()
      set(e.code, true)
    }
    const up = (e: KeyboardEvent) => set(e.code, false)
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', dn)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const k = keys.current
    // direzione input relativa alla camera
    const ix = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    const iz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
    const yaw = lookRef.current.yaw
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    const running = !!(k.ShiftLeft || k.ShiftRight)
    const speed = running ? RUN_SPEED : WALK_SPEED
    const move = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix)
    const moving = move.lengthSq() > 0
    if (moving) move.normalize().multiplyScalar(speed)

    pos.current.x += move.x * dt
    pos.current.z += move.z * dt
    vel.current.y -= GRAVITY * dt
    pos.current.y += vel.current.y * dt

    const res = collideAndGround(pos.current, 0.35, 1.72, 0.55, colliders)
    if (res.onGround) {
      pos.current.y = res.groundY
      vel.current.y = 0
      if (k.Space) vel.current.y = JUMP_VEL
    }
    if (res.hitCeiling && vel.current.y > 0) vel.current.y = 0

    // camera + head bob
    const speedF = moving ? move.length() / RUN_SPEED : 0
    bob.current += dt * (7 + speedF * 7)
    const bobY = Math.sin(bob.current * 1.15) * 0.04 * (0.35 + speedF)
    camera.rotation.set(lookRef.current.pitch, lookRef.current.yaw, 0, 'YXZ')
    camera.position.set(pos.current.x, pos.current.y + 1.66 + bobY, pos.current.z)

    // fov kick in corsa
    const targetFov = running && moving ? 77 : 70
    fovRef.current += (targetFov - fovRef.current) * Math.min(1, dt * 5)
    if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - fovRef.current) > 0.05) {
      camera.fov = fovRef.current
      camera.updateProjectionMatrix()
    }

    // passi
    if (moving && res.onGround) {
      stepT.current += dt
      const interval = running ? 0.3 : 0.44
      if (stepT.current > interval) {
        stepT.current = 0
        sfx.step()
      }
    }
    void state
  })
  return null
}

// ============================================================
// PLAY VIEW (schermo intero + overlay pointer lock)
// ============================================================

function PlayView({
  world,
  title,
  onEditor,
  onExit,
}: {
  world: RWorld
  title: string
  onEditor: () => void
  onExit: () => void
}) {
  const canvasEl = useRef<HTMLCanvasElement | null>(null)
  const look = useRef({ yaw: world.spawnYaw, pitch: 0 })
  const [lockState, setLockState] = useState<'start' | 'playing' | 'paused'>('start')
  const [hud, setHud] = useState({ fps: 0, pos: '' })
  const fpsCount = useRef({ n: 0, t: 0 })

  const requestLock = useCallback(() => {
    const el = canvasEl.current
    if (!el) return
    unlockAudio()
    try {
      const req = el.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | void
      const p = req({ unadjustedMovement: true })
      if (p && typeof (p as Promise<void>).catch === 'function') {
        ;(p as Promise<void>).catch(() => {
          try {
            ;(el.requestPointerLock as () => void)()
          } catch {
            /* browser senza pointer lock */
          }
        })
      }
    } catch {
      try {
        ;(el.requestPointerLock as () => void)()
      } catch {
        /* browser senza pointer lock */
      }
    }
  }, [])

  useEffect(() => {
    const onLockChange = () => {
      if (document.pointerLockElement) {
        setLockState('playing')
      } else {
        setLockState(s => (s === 'start' ? 'start' : 'paused'))
      }
    }
    const onMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return
      look.current.yaw -= e.movementX * 0.0022
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - e.movementY * 0.0022, -1.35, 1.35)
    }
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('mousemove', onMove)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [])

  // clicca sul canvas quando in pausa → riaggancia il mouse
  useEffect(() => {
    if (lockState !== 'paused') return
    const el = canvasEl.current
    if (!el) return
    const h = () => requestLock()
    el.addEventListener('click', h)
    return () => el.removeEventListener('click', h)
  }, [lockState, requestLock])

  const env = world.env
  return (
    <div className="relative h-[calc(100vh-140px)] min-h-[480px] w-full overflow-hidden rounded-xl ring-1 ring-[var(--line)]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 70, near: 0.08, far: 420, position: [world.spawn[0], world.spawn[1] + 1.66, world.spawn[2]] }}
        onCreated={({ gl }) => {
          canvasEl.current = gl.domElement
        }}
        onContextMenu={e => e.preventDefault()}
      >
        <Suspense fallback={null}>
          <RealEnv env={env} />
          <WorldObjects world={world} playMode />
        </Suspense>
        <PlayRig world={world} lookRef={look} />
        <PostFXView params={{ bloom: env.bloom, vignette: env.vignette, exposure: env.exposure }} />
        <HudSpy onHud={setHud} fpsCount={fpsCount} />
      </Canvas>

      {/* mirino */}
      {lockState === 'playing' && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-1 w-1 rounded-full bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
        </div>
      )}

      {/* chip info */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5 text-[11px]">
        <span className="rounded-md bg-black/55 px-2 py-1 font-bold tracking-widest text-white/90 backdrop-blur">
          {title}
        </span>
        <span className="rounded-md bg-black/45 px-2 py-0.5 font-mono text-white/60 backdrop-blur">
          {hud.fps} fps · {hud.pos}
        </span>
      </div>
      {lockState === 'playing' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/55 backdrop-blur">
          WASD muovi · SHIFT corri · SPAZIO salta · ESC libera il mouse
        </div>
      )}

      {/* overlay START */}
      {lockState === 'start' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="cp-panel cp-panel-neon w-full max-w-md p-6 text-center">
            <p className="text-[10px] font-bold tracking-[0.3em] text-[var(--neon)]">DARPX ENGINE · PROVA</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--tx)]">{title}</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs text-[var(--tx-dim)]">
              <span className="rounded-md bg-[var(--panel-soft)] px-2 py-1.5"><b className="text-[var(--tx)]">WASD</b> · cammina</span>
              <span className="rounded-md bg-[var(--panel-soft)] px-2 py-1.5"><b className="text-[var(--tx)]">SHIFT</b> · corri</span>
              <span className="rounded-md bg-[var(--panel-soft)] px-2 py-1.5"><b className="text-[var(--tx)]">SPAZIO</b> · salta</span>
              <span className="rounded-md bg-[var(--panel-soft)] px-2 py-1.5"><b className="text-[var(--tx)]">ESC</b> · libera il mouse</span>
            </div>
            <Button
              className="cp-btn mt-5 w-full bg-[var(--neon)] text-base font-black text-[#04060d]"
              onClick={requestLock}
            >
              🖱 CLICCA PER GIOCARE
            </Button>
            <p className="mt-2 text-[10px] text-[var(--tx-faint)]">
              Il mouse viene catturato dallo schermo, come nei giochi veri. ESC lo libera subito.
            </p>
          </div>
        </div>
      )}

      {/* overlay PAUSA */}
      {lockState === 'paused' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="cp-panel w-full max-w-sm p-5 text-center">
            <p className="text-sm font-bold text-[var(--tx)]">⏸ In pausa — mouse libero</p>
            <div className="mt-4 flex flex-col gap-2">
              <Button className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={requestLock}>
                ▶ Riprendi
              </Button>
              <Button variant="outline" className="cp-btn" onClick={onEditor}>
                ✎ Torna all&apos;editor
              </Button>
              <Button variant="outline" className="cp-btn" onClick={onExit}>
                ✕ Esci dal gioco
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** aggiorna il chip FPS/posizione nel play mode */
function HudSpy({
  onHud,
  fpsCount,
}: {
  onHud: (h: { fps: number; pos: string }) => void
  fpsCount: React.MutableRefObject<{ n: number; t: number }>
}) {
  const camera = useThree(s => s.camera)
  useFrame(() => {
    const c = fpsCount.current
    c.n++
    const now = performance.now()
    if (now - c.t > 500) {
      const fps = Math.round((c.n * 1000) / (now - c.t))
      c.t = now
      c.n = 0
      onHud({ fps, pos: `${camera.position.x.toFixed(1)}, ${camera.position.z.toFixed(1)}` })
    }
  })
  return null
}

// ============================================================
// CHE COSA STIAMO PIAZZANDO
// ============================================================

type PlacingDef =
  | { kind: 'prefab'; prefab: string }
  | { kind: 'light'; lightKind: 'point' | 'spot' }
  | { kind: 'glb'; url: string; name: string }

// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================

export default function RealisticStudio({ meta, onBack, onSaved, initialMode = 'edit' }: Props) {
  const [glOK] = useState(() => webglSupported())
  const [project, setProject] = useState<GameProject>(() => {
    const p = JSON.parse(JSON.stringify(meta.game)) as GameProject
    if (!p.settings.realWorld) p.settings.realWorld = newRealWorld('vuoto')
    return p
  })
  const world = project.settings.realWorld!
  const [mode, setMode] = useState<'edit' | 'play'>(initialMode)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'ok' | 'saving'>('ok')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [placing, setPlacing] = useState<PlacingDef | null>(null)
  const [placeRot, setPlaceRot] = useState(0)
  const [gizmo, setGizmo] = useState<GizmoMode>('translate')
  const [paletteCat, setPaletteCat] = useState<PrefabCat | 'luce' | 'glb'>('ambiente')
  const [models, setModels] = useState<{ id: string; name: string; url: string }[]>([])
  const [tplOpen, setTplOpen] = useState(false)
  const [uniformScale, setUniformScale] = useState(true)
  const [snapOn, setSnapOn] = useState(true)

  const groups = useRef<Map<string, THREE.Group>>(new Map())
  const controlsRef = useRef<unknown>(null)
  const camRef = useRef<THREE.PerspectiveCamera | null>(null)

  // ---------- salvataggio ----------
  useEffect(() => {
    if (!dirty) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        const m = await saveGame(meta.id, project)
        onSaved(m)
        setDirty(false)
        setSaveState('ok')
      } catch {
        toast.error('Salvataggio fallito: riprovo al prossimo cambiamento')
      }
    }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, dirty])

  // ---------- modelli dell'utente (personaggi) ----------
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetchAuth('/api/models')
        if (!res.ok) return
        const data = await res.json()
        setModels((data.models ?? []).filter((m: { url?: string }) => m.url))
      } catch {
        /* facoltativo */
      }
    })()
  }, [])

  // ---------- mutazioni ----------
  const mutateWorld = useCallback((fn: (w: RWorld) => void) => {
    setProject(prev => {
      const q = JSON.parse(JSON.stringify(prev)) as GameProject
      fn(q.settings.realWorld!)
      return q
    })
    setDirty(true)
  }, [])

  const mutateProject = useCallback((fn: (p: GameProject) => void) => {
    setProject(prev => {
      const q = JSON.parse(JSON.stringify(prev)) as GameProject
      fn(q)
      return q
    })
    setDirty(true)
  }, [])

  // ---------- selezione ----------
  const selectedObj = world.objects.find(o => o.id === selectedId) ?? null
  const selectedLight = world.lights.find(l => l.id === selectedId) ?? null

  const patchObject = (id: string, fn: (o: RObject) => void) => {
    mutateWorld(w => {
      const o = w.objects.find(x => x.id === id)
      if (o) fn(o)
    })
  }
  const patchLight = (id: string, fn: (l: RLightObj) => void) => {
    mutateWorld(w => {
      const l = w.lights.find(x => x.id === id)
      if (l) fn(l)
    })
  }

  // ---------- piazzamento ----------
  const placeAt = (p: THREE.Vector3) => {
    if (!placing) return
    if (placing.kind === 'prefab') {
      mutateWorld(w => {
        w.objects.push({
          id: rid(),
          prefab: placing.prefab,
          p: [p.x, 0, p.z],
          r: [0, placeRot, 0],
          s: [1, 1, 1],
        })
      })
      sfx.pickup()
    } else if (placing.kind === 'light') {
      mutateWorld(w => {
        w.lights.push({
          id: `L${rid()}`,
          kind: placing.lightKind,
          p: [p.x, placing.lightKind === 'spot' ? 4 : 2.2, p.z],
          color: '#ffd9a0',
          intensity: placing.lightKind === 'spot' ? 24 : 7,
          distance: 14,
          angle: 0.7,
        })
      })
      sfx.pickup()
    } else {
      mutateWorld(w => {
        w.objects.push({
          id: rid(),
          prefab: 'glb',
          p: [p.x, 0, p.z],
          r: [0, placeRot, 0],
          s: [1, 1, 1],
          url: placing.url,
          name: placing.name,
          anim: null,
        })
      })
      sfx.pickup()
    }
    // resta in modalità piazzamento (come i editor veri): ESC per uscire
  }

  // ---------- gizmo commit ----------
  const commitGizmo = () => {
    if (!selectedId) return
    const g = groups.current.get(selectedId)
    if (!g) return
    if (selectedObj) {
      const p = [g.position.x, g.position.y, g.position.z] as [number, number, number]
      const r = [
        THREE.MathUtils.radToDeg(g.rotation.x),
        THREE.MathUtils.radToDeg(g.rotation.y),
        THREE.MathUtils.radToDeg(g.rotation.z),
      ] as [number, number, number]
      const s = [g.scale.x, g.scale.y, g.scale.z] as [number, number, number]
      mutateWorld(w => {
        const o = w.objects.find(x => x.id === selectedId)
        if (o) {
          o.p = p
          o.r = r
          o.s = s
        }
      })
    } else if (selectedLight) {
      mutateWorld(w => {
        const l = w.lights.find(x => x.id === selectedId)
        if (l) l.p = [g.position.x, g.position.y, g.position.z]
      })
    }
  }

  // ---------- scorciatoie da tastiera ----------
  useEffect(() => {
    if (mode !== 'edit') return
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Escape') {
        if (placing) setPlacing(null)
        else setSelectedId(null)
      }
      if (e.code === 'KeyR' && placing) setPlaceRot(r => (r + 45) % 360)
      if (e.code === 'Digit1') setGizmo('translate')
      if (e.code === 'Digit2') setGizmo('rotate')
      if (e.code === 'Digit3') setGizmo('scale')
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedId) deleteSelected()
      }
      if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey) && selectedId) {
        e.preventDefault()
        duplicateSelected()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, placing, selectedId, world])

  const deleteSelected = () => {
    if (!selectedId) return
    mutateWorld(w => {
      w.objects = w.objects.filter(o => o.id !== selectedId)
      w.lights = w.lights.filter(l => l.id !== selectedId)
    })
    groups.current.delete(selectedId)
    setSelectedId(null)
    sfx.hit()
  }

  const duplicateSelected = () => {
    const o = world.objects.find(x => x.id === selectedId)
    if (!o) return
    mutateWorld(w => {
      const c = JSON.parse(JSON.stringify(o)) as RObject
      c.id = rid()
      c.p = [c.p[0] + 1.5, c.p[1], c.p[2] + 1.5]
      w.objects.push(c)
    })
    toast.success('Duplicato (+1.5 m in avanti)')
  }

  // ---------- spawn dalla vista ----------
  const setSpawnFromView = () => {
    const controls = controlsRef.current as { target: THREE.Vector3 } | null
    const cam = camRef.current
    if (!controls || !cam) return
    const t = controls.target
    const dir = new THREE.Vector3().subVectors(t, cam.position)
    dir.y = 0
    dir.normalize()
    const yaw = Math.atan2(-dir.x, -dir.z)
    mutateWorld(w => {
      w.spawn = [t.x, Math.max(0, t.y), t.z]
      w.spawnYaw = yaw
    })
    toast.success('📍 Spawn impostato dove stai guardando')
  }

  // ---------- nuovo da template ----------
  const applyTemplate = (tplId: string) => {
    mutateProject(p => {
      p.settings.realWorld = newRealWorld(tplId)
    })
    setTplOpen(false)
    setSelectedId(null)
    toast.success(`Ambiente "${REAL_TEMPLATES.find(t => t.id === tplId)?.name ?? tplId}" caricato`)
  }

  // ---------- palette ----------
  const paletteItems =
    paletteCat === 'luce'
      ? []
      : paletteCat === 'glb'
        ? models.map(m => ({ id: `glb:${m.url}`, name: m.name, icon: '🧍', desc: 'Modello GLB tuo' }))
        : PREFAB_DEFS.filter(d => d.cat === paletteCat)

  // ============================================================
  // RENDER
  // ============================================================

  if (!glOK) return <NoGLCard />

  // ---------- PLAY ----------
  if (mode === 'play') {
    return (
      <div className="flex flex-col gap-3">
        <div className="cp-panel flex flex-wrap items-center gap-2 p-2.5">
          <Button size="sm" variant="outline" className="cp-btn" onClick={() => setMode('edit')}>
            ← Editor
          </Button>
          <span className="neon-text truncate font-[family-name:var(--font-display)] text-sm font-bold tracking-widest uppercase">
            {project.title}
          </span>
          <span className="cp-chip">DARPX ENGINE · REALISTICO</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" className="cp-btn" onClick={onBack}>
              ✕ Chiudi
            </Button>
          </div>
        </div>
        <PlayView
          world={world}
          title={project.title}
          onEditor={() => setMode('edit')}
          onExit={onBack}
        />
      </div>
    )
  }

  // ---------- EDIT ----------
  const env = world.env
  return (
    <div className="flex min-h-[calc(100vh-140px)] flex-col gap-3">
      {/* barra superiore */}
      <div className="cp-panel flex flex-wrap items-center gap-2 p-2.5">
        <Button size="sm" variant="outline" className="cp-btn" onClick={onBack}>
          ← Giochi
        </Button>
        <Input
          value={project.title}
          onChange={e => mutateProject(p => { p.title = e.target.value })}
          className="h-8 w-52 border-[var(--line)] bg-[var(--panel-soft)] font-semibold"
        />
        <span className="cp-chip">{saveState === 'ok' ? '● salvato' : '◌ salvo…'}</span>
        <span className="cp-chip hidden text-[10px] md:inline-flex">DARPX ENGINE · PBR + BLOOM</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button className="cp-chip hover:text-[var(--neon)]" onClick={() => setTplOpen(v => !v)} title="Carica un ambiente completo">
            🏗 Template
          </button>
          <button className="cp-chip hover:text-[var(--neon)]" onClick={setSpawnFromView} title="Lo spawn del giocatore va dove stai guardando">
            📍 Spawn qui
          </button>
          <Button size="sm" className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={() => { setSelectedId(null); setPlacing(null); setMode('play') }}>
            ▶ PROVA
          </Button>
        </div>
      </div>

      {/* menu template a tendina */}
      {tplOpen && (
        <div className="cp-panel p-3">
          <p className="mb-2 text-xs font-bold text-[var(--tx-dim)]">
            Carica un ambiente completo (sostituisce gli oggetti del mondo)
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {REAL_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t.id)}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-left transition-colors hover:border-[var(--neon)]"
              >
                <span className="text-2xl">{t.icon}</span>
                <p className="mt-1 text-sm font-bold text-[var(--tx)]">{t.name}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--tx-dim)]">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* corpo: palette | viewport | ispettore */}
      <div className="flex min-h-[540px] flex-1 flex-col gap-3 lg:flex-row">
        {/* PALETTA */}
        <div className="cp-panel flex w-full flex-col p-3 lg:w-64 lg:shrink-0">
          <div className="mb-2 flex flex-wrap gap-1">
            {(Object.keys(CAT_LABEL) as (PrefabCat | 'luce' | 'glb')[]).map(c => (
              <button
                key={c}
                onClick={() => setPaletteCat(c)}
                className={`cp-chip text-[11px] ${paletteCat === c ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
              >
                {CAT_LABEL[c]}
              </button>
            ))}
          </div>

          {paletteCat === 'luce' ? (
            <div className="flex flex-col gap-2">
              <button
                className={`rounded-lg border p-3 text-left transition-colors ${placing?.kind === 'light' && placing.lightKind === 'point' ? 'border-[var(--neon)] bg-[var(--primary-soft)]' : 'border-[var(--line)] hover:border-[var(--neon)]'}`}
                onClick={() => setPlacing(placing?.kind === 'light' ? null : { kind: 'light', lightKind: 'point' })}
              >
                <span className="text-2xl">💡</span>
                <p className="mt-1 text-sm font-bold text-[var(--tx)]">Luce di punto</p>
                <p className="text-[11px] text-[var(--tx-dim)]">Illumina attorno (candele, lampade…)</p>
              </button>
              <button
                className={`rounded-lg border p-3 text-left transition-colors ${placing?.kind === 'light' && placing.lightKind === 'spot' ? 'border-[var(--neon)] bg-[var(--primary-soft)]' : 'border-[var(--line)] hover:border-[var(--neon)]'}`}
                onClick={() => setPlacing(placing?.kind === 'light' ? null : { kind: 'light', lightKind: 'spot' })}
              >
                <span className="text-2xl">🔦</span>
                <p className="mt-1 text-sm font-bold text-[var(--tx)]">Riflettore</p>
                <p className="text-[11px] text-[var(--tx-dim)]">Cono di luce dall&apos;alto</p>
              </button>
            </div>
          ) : paletteCat === 'glb' ? (
            <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
              {paletteItems.length === 0 && (
                <p className="p-2 text-xs text-[var(--tx-dim)]">
                  Nessun modello: carica i tuoi GLB nel reparto «Progetti importati» e tornano qui.
                </p>
              )}
              {paletteItems.map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    const url = m.id.slice(4)
                    setPlacing(placing?.kind === 'glb' && placing.url === url ? null : { kind: 'glb', url, name: m.name })
                  }}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${placing?.kind === 'glb' && placing.url === m.id.slice(4) ? 'border-[var(--neon)] bg-[var(--primary-soft)]' : 'border-[var(--line)] hover:border-[var(--neon)]'}`}
                >
                  <span className="text-lg">🧍</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[var(--tx)]">{m.name}</span>
                    <span className="block text-[10px] text-[var(--tx-faint)]">personaggio animato</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
              {paletteItems.map(d => (
                <button
                  key={d.id}
                  onClick={() => setPlacing(placing?.kind === 'prefab' && placing.prefab === d.id ? null : { kind: 'prefab', prefab: d.id })}
                  title={d.desc}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${placing?.kind === 'prefab' && placing.prefab === d.id ? 'border-[var(--neon)] bg-[var(--primary-soft)]' : 'border-[var(--line)] hover:border-[var(--neon)]'}`}
                >
                  <span className="text-lg leading-none">{d.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[var(--tx)]">{d.name}</span>
                    <span className="block text-[10px] leading-snug text-[var(--tx-faint)]">{d.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-auto border-t border-[var(--line)] pt-2 text-[10px] leading-relaxed text-[var(--tx-faint)]">
            <b className="text-[var(--tx-dim)]">Comandi:</b> click sx ruota la vista · tasto dx trascina la mappa ·
            rotella zoom · <b className="text-[var(--tx-dim)]">1/2/3</b> sposta/ruota/scala · <b className="text-[var(--tx-dim)]">CANC</b> elimina · <b className="text-[var(--tx-dim)]">CTRL+D</b> duplica
          </div>
        </div>

        {/* VIEWPORT */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl ring-1 ring-[var(--line)]">
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ fov: 50, near: 0.1, far: 500, position: [10, 9, 14] }}
            onContextMenu={e => e.preventDefault()}
            onPointerMissed={() => setSelectedId(null)}
          >
            <RealEnv env={env} />
            <gridHelper args={[80, 80, '#33415e', '#1a2334']} position={[0, 0.005, 0]} />
            {/* segnapunto spawn */}
            <group position={world.spawn}>
              <mesh position={[0, 0.9, 0]}>
                <capsuleGeometry args={[0.22, 1.1, 4, 10]} />
                <meshBasicMaterial color="#19e0ff" transparent opacity={0.28} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[0.5, 0.62, 28]} />
                <meshBasicMaterial color="#19e0ff" transparent opacity={0.75} />
              </mesh>
            </group>
            {/* wrapper per registrare i gruppi (gizmo + selezione) */}
            {world.objects.map(o =>
              o.prefab === 'glb' && o.url ? null : (
                <PrefabView
                  key={o.id}
                  o={o}
                  selected={o.id === selectedId}
                  onSelect={setSelectedId}
                  reg={g => {
                    if (g) groups.current.set(o.id, g)
                    else groups.current.delete(o.id)
                  }}
                />
              )
            )}
            {world.objects
              .filter(o => o.prefab === 'glb' && o.url)
              .map(o => (
                <GlbPlaceholder key={o.id} o={o} />
              ))}
            {world.lights.map(l => (
              <LightView
                key={l.id}
                l={l}
                selected={l.id === selectedId}
                onSelect={setSelectedId}
                reg={g => {
                  if (g) groups.current.set(l.id, g)
                  else groups.current.delete(l.id)
                }}
              />
            ))}
            <PlacePlane placing={placing} rotDeg={placeRot} snap={snapOn} onPlace={placeAt} />
            <Gizmo
              target={selectedId ? groups.current.get(selectedId) ?? null : null}
              mode={gizmo}
              onCommit={commitGizmo}
            />
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.09}
              screenSpacePanning
              panSpeed={1.15}
              rotateSpeed={0.85}
              zoomSpeed={1.1}
              minDistance={1.5}
              maxDistance={220}
              maxPolarAngle={Math.PI / 2.05}
              target={[0, 1, 0]}
              mouseButtons={{
                LEFT: (placing ? -1 : THREE.MOUSE.ROTATE) as unknown as THREE.MOUSE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.PAN,
              }}
              touches={{
                ONE: (placing ? -1 : THREE.TOUCH.ROTATE) as unknown as THREE.TOUCH,
                TWO: THREE.TOUCH.DOLLY_PAN,
              }}
            />
            <EditorSpy
              controlsRef={controlsRef}
              camRef={camRef}
              spawn={world.spawn}
              spawnYaw={world.spawnYaw}
              spawnSig={`${world.spawn.map(v => v.toFixed(1)).join(',')}|${world.spawnYaw.toFixed(2)}`}
            />
            <PostFXView params={{ bloom: env.bloom, vignette: env.vignette, exposure: env.exposure }} />
          </Canvas>

          {/* barra modalità gizmo */}
          <div className="absolute left-3 top-3 flex gap-1 rounded-xl bg-black/55 p-1 backdrop-blur">
            {(
              [
                ['translate', '✥ Sposta', '1'],
                ['rotate', '⟳ Ruota', '2'],
                ['scale', '⤢ Scala', '3'],
              ] as const
            ).map(([m, label, key]) => (
              <button
                key={m}
                onClick={() => setGizmo(m)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${gizmo === m ? 'bg-[var(--neon)] text-[#04060d]' : 'text-white/75 hover:bg-white/10'}`}
                title={`${label} (${key})`}
              >
                {label.split(' ')[0]}
              </button>
            ))}
            <button
              onClick={() => setSnapOn(v => !v)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${snapOn ? 'bg-[var(--neon)] text-[#04060d]' : 'text-white/75 hover:bg-white/10'}`}
              title="Snap a griglia 0.5 m"
            >
              ⌗
            </button>
          </div>

          {/* banner piazzamento */}
          {placing && (
            <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-[var(--neon)] px-4 py-1.5 text-xs font-bold text-[#04060d] shadow-lg">
              {placing.kind === 'prefab'
                ? `Piazzando: ${PREFABS[placing.prefab]?.name ?? placing.prefab}`
                : placing.kind === 'light'
                  ? `Piazzando: ${placing.lightKind === 'point' ? 'luce di punto' : 'riflettore'}`
                  : `Piazzando: ${placing.name}`}
              {' '}· click sulla scena per posare · R ruota ({placeRot}°) · ESC fine
            </div>
          )}

          {/* statistiche */}
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/50 px-2.5 py-1 font-mono text-[10px] text-white/60 backdrop-blur">
            {world.objects.length} oggetti · {world.lights.length} luci · spawn {world.spawn.map(v => v.toFixed(0)).join(', ')}
          </div>
        </div>

        {/* ISPETTORE */}
        <div className="cp-panel w-full shrink-0 overflow-y-auto p-3 lg:w-72">
          {selectedObj || selectedLight ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="truncate text-sm font-bold text-[var(--tx)]">
                  {selectedObj
                    ? `${PREFABS[selectedObj.prefab]?.icon ?? '📦'} ${PREFABS[selectedObj.prefab]?.name ?? selectedObj.prefab}`
                    : selectedLight.kind === 'point'
                      ? '💡 Luce di punto'
                      : '🔦 Riflettore'}
                </p>
                <div className="flex gap-1">
                  {selectedObj && (
                    <button className="cp-chip" title="Duplica (CTRL+D)" onClick={duplicateSelected}>⧉</button>
                  )}
                  <button className="cp-chip text-red-400" title="Elimina (CANC)" onClick={deleteSelected}>🗑</button>
                </div>
              </div>

              {selectedObj ? (
                <>
                  <div>
                    <p className="mb-1 text-[10px] font-bold tracking-wider text-[var(--tx-faint)]">POSIZIONE (m)</p>
                    <div className="grid grid-cols-3 gap-1">
                      {(['X', 'Y', 'Z'] as const).map((ax, i) => (
                        <NumField
                          key={ax}
                          label={ax}
                          value={selectedObj.p[i]}
                          step={0.25}
                          onChange={v => patchObject(selectedObj.id, o => { o.p[i] = snapOn ? Math.round(v * 4) / 4 : v })}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-bold tracking-wider text-[var(--tx-faint)]">ROTAZIONE (gradi)</p>
                    <div className="grid grid-cols-3 gap-1">
                      {(['X', 'Y', 'Z'] as const).map((ax, i) => (
                        <NumField
                          key={ax}
                          label={ax}
                          value={selectedObj.r[i]}
                          step={15}
                          onChange={v => patchObject(selectedObj.id, o => { o.r[i] = v })}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[10px] font-bold tracking-wider text-[var(--tx-faint)]">SCALA</p>
                      <button
                        className={`cp-chip text-[10px] ${uniformScale ? 'border-[var(--neon)] text-[var(--neon)]' : ''}`}
                        onClick={() => setUniformScale(v => !v)}
                        title="Scala uniforme"
                      >
                        🔗 uniforme
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['X', 'Y', 'Z'] as const).map((ax, i) => (
                        <NumField
                          key={ax}
                          label={ax}
                          value={selectedObj.s[i]}
                          step={0.1}
                          min={0.05}
                          onChange={v => patchObject(selectedObj.id, o => {
                            if (uniformScale) o.s = [v, v, v]
                            else o.s[i] = v
                          })}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[var(--line)] pt-2">
                    <p className="mb-1.5 text-[10px] font-bold tracking-wider text-[var(--tx-faint)]">MATERIALE PBR</p>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center justify-between text-[11px] text-[var(--tx-dim)]">
                        Colore
                        <input
                          type="color"
                          value={selectedObj.mat?.color ?? '#ffffff'}
                          onChange={e => patchObject(selectedObj.id, o => { o.mat = { ...o.mat, color: e.target.value } })}
                          className="h-7 w-14 cursor-pointer rounded border border-[var(--line)] bg-transparent"
                        />
                      </label>
                      <Slider
                        label="Rugosità"
                        value={selectedObj.mat?.rough ?? 0.5}
                        onChange={v => patchObject(selectedObj.id, o => { o.mat = { ...o.mat, rough: v } })}
                      />
                      <Slider
                        label="Metallicità"
                        value={selectedObj.mat?.metal ?? 0.1}
                        onChange={v => patchObject(selectedObj.id, o => { o.mat = { ...o.mat, metal: v } })}
                      />
                      <label className="flex items-center justify-between text-[11px] text-[var(--tx-dim)]">
                        Emissivo (glow)
                        <input
                          type="color"
                          value={selectedObj.mat?.emissive ?? '#000000'}
                          onChange={e => patchObject(selectedObj.id, o => { o.mat = { ...o.mat, emissive: e.target.value } })}
                          className="h-7 w-14 cursor-pointer rounded border border-[var(--line)] bg-transparent"
                        />
                      </label>
                      {(selectedObj.mat?.emissive && selectedObj.mat.emissive !== '#000000') ? (
                        <Slider
                          label="Intensità glow"
                          value={selectedObj.mat?.eInt ?? 1}
                          min={0}
                          max={4}
                          step={0.05}
                          onChange={v => patchObject(selectedObj.id, o => { o.mat = { ...o.mat, eInt: v } })}
                        />
                      ) : null}
                      {selectedObj.mat && (
                        <button
                          className="cp-chip w-fit text-[10px] hover:text-[var(--neon)]"
                          onClick={() => patchObject(selectedObj.id, o => { o.mat = undefined })}
                        >
                          ↺ materiale originale
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* ispettore LUCE */
                selectedLight && (
                  <>
                    <div>
                      <p className="mb-1 text-[10px] font-bold tracking-wider text-[var(--tx-faint)]">POSIZIONE (m)</p>
                      <div className="grid grid-cols-3 gap-1">
                        {(['X', 'Y', 'Z'] as const).map((ax, i) => (
                          <NumField
                            key={ax}
                            label={ax}
                            value={selectedLight.p[i]}
                            step={0.25}
                            onChange={v => patchLight(selectedLight.id, l => { l.p[i] = v })}
                          />
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center justify-between text-[11px] text-[var(--tx-dim)]">
                      Colore
                      <input
                        type="color"
                        value={selectedLight.color}
                        onChange={e => patchLight(selectedLight.id, l => { l.color = e.target.value })}
                        className="h-7 w-14 cursor-pointer rounded border border-[var(--line)] bg-transparent"
                      />
                    </label>
                    <Slider
                      label="Intensità"
                      value={selectedLight.intensity}
                      min={0}
                      max={60}
                      step={0.5}
                      onChange={v => patchLight(selectedLight.id, l => { l.intensity = v })}
                    />
                    <Slider
                      label="Portata"
                      value={selectedLight.distance}
                      min={1}
                      max={40}
                      step={0.5}
                      onChange={v => patchLight(selectedLight.id, l => { l.distance = v })}
                    />
                    {selectedLight.kind === 'spot' && (
                      <Slider
                        label="Apertura cono"
                        value={selectedLight.angle ?? 0.7}
                        min={0.15}
                        max={1.4}
                        onChange={v => patchLight(selectedLight.id, l => { l.angle = v })}
                      />
                    )}
                  </>
                )
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-[var(--tx-dim)]">
              Seleziona un oggetto nella scena per modificarlo,
              oppure scegline uno dalla palette a sinistra e
              clicca nel mondo per piazzarlo.
            </p>
          )}

          {/* AMBIENTE */}
          <div className="mt-4 border-t border-[var(--line)] pt-3">
            <p className="mb-2 text-[10px] font-bold tracking-wider text-[var(--tx-faint)]">AMBIENTE &amp; RENDERING</p>
            <label className="mb-2 block text-[11px] text-[var(--tx-dim)]">
              Cielo
              <select
                value={env.sky}
                onChange={e => mutateWorld(w => { w.env.sky = e.target.value as RSkyPreset })}
                className="mt-1 h-8 w-full rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)]"
              >
                {(Object.keys(ENV_PRESETS) as RSkyPreset[]).map(k => (
                  <option key={k} value={k}>{ENV_PRESETS[k].label}</option>
                ))}
              </select>
            </label>
            <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--tx-dim)]">
              Colore nebbia
              <input
                type="color"
                value={env.fog}
                onChange={e => mutateWorld(w => { w.env.fog = e.target.value })}
                className="h-7 w-14 cursor-pointer rounded border border-[var(--line)] bg-transparent"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Slider
                label="Densità nebbia"
                value={env.fogDensity}
                min={0}
                max={0.08}
                step={0.002}
                fmt={v => (v * 100).toFixed(1) + '%'}
                onChange={v => mutateWorld(w => { w.env.fogDensity = v })}
              />
              <Slider
                label="Esposizione"
                value={env.exposure}
                min={0.4}
                max={2}
                step={0.05}
                onChange={v => mutateWorld(w => { w.env.exposure = v })}
              />
              <Slider
                label="Bloom (glow)"
                value={env.bloom}
                min={0}
                max={2.5}
                step={0.05}
                onChange={v => mutateWorld(w => { w.env.bloom = v })}
              />
              <Slider
                label="Vignettatura"
                value={env.vignette}
                min={0}
                max={1}
                step={0.02}
                onChange={v => mutateWorld(w => { w.env.vignette = v })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// supporto all'editor: GLB con Suspense (il gizmo si aggancia
// direttamente al gruppo del GlbView tramite reg)
// ============================================================

function GlbPlaceholder({ o }: { o: RObject }) {
  return (
    <Suspense fallback={null}>
      <GlbView o={o} reg={() => { /* gizmo non collegato ai GLB */ }} />
    </Suspense>
  )
}
