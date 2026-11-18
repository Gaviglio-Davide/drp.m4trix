'use client'

// ============================================================
// DARPX ENGINE — STUDIO REALISTICO (v17)
// L'ambiente "serio" del Game Studio: editor 3D stile Blender
// (palette, gizmo, ispettore PBR, ambiente, post-processing)
// e player in prima persona con mouse catturato (pointer lock),
// ESC per liberarlo, gravità, salto e collisioni vere.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  type RCreature,
  type RLightObj,
  type RObject,
  type RPlayerChar,
  type RSkyPreset,
  type RSpot,
  type RWorld,
} from '@/lib/engine3d/types'
import { PREFABS, PREFAB_DEFS, type PrefabCat } from '@/lib/engine3d/prefabs'
import { collideAndGround, safeSpawn, worldColliders } from '@/lib/engine3d/builder'
import { GlbView, LightView, PlayerCharView, PostFXView, PrefabView, RealEnv, WorldObjects } from './RealisticViews'
import RealPlay from './RealPlay'
import AiWorldConsole, { type AiCmd } from './AiWorldConsole'
import { GLB_CATALOG } from '@/lib/glb-catalog-data'
import StudioDetails from './StudioDetails'
import StudioOutliner from './StudioOutliner'

type Props = {
  meta: GameMeta
  onBack: () => void
  onSaved: (m: GameMeta) => void
  initialMode?: 'edit' | 'play'
}

type GizmoMode = 'translate' | 'rotate' | 'scale'

const CAT_LABEL: Record<PrefabCat | 'luce' | 'glb' | 'creature' | 'interazioni', string> = {
  ambiente: 'Ambienti',
  struttura: 'Strutture',
  prop: 'Arredi',
  luce: 'Luci',
  glb: 'Personaggi',
  creature: '👹 Creature',
  interazioni: '⛺ Interazioni',
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
// CHE COSA STIAMO PIAZZANDO
// ============================================================

type PlacingDef =
  | { kind: 'prefab'; prefab: string }
  | { kind: 'light'; lightKind: 'point' | 'spot' }
  | { kind: 'glb'; url: string; name: string }
  | { kind: 'creature' } // v19: piazza una creatura
  | { kind: 'spot' } // v19: piazza un punto di interazione

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
  const [paletteCat, setPaletteCat] = useState<PrefabCat | 'luce' | 'glb' | 'creature' | 'interazioni'>('ambiente')
  const [models, setModels] = useState<{ id: string; name: string; url: string }[]>([])
  const [tplOpen, setTplOpen] = useState(false)
  const [snapOn, setSnapOn] = useState(true)
  // v18: dock Details ridimensionabile + guida scorciatoie
  const [detailsW, setDetailsW] = useState(380)
  // v21: SCHERMO PIENO — i pannelli diventano estrattori sopra il
  // viewport e si richiudono: il 3D copre TUTTA la finestra
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)
  const [showHelp, setShowHelp] = useState(false)

  const groups = useRef<Map<string, THREE.Group>>(new Map())
  const controlsRef = useRef<unknown>(null)
  const camRef = useRef<THREE.PerspectiveCamera | null>(null)

  // ---------- v18: UNDO / REDO (cronologia del mondo, stile Unreal) ----------
  const projectRef = useRef(project)
  useEffect(() => {
    projectRef.current = project
  }, [project])
  const hist = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] })
  const lastPush = useRef(0)
  const pushHist = useCallback(() => {
    const cur = JSON.stringify(projectRef.current.settings.realWorld ?? null)
    const last = hist.current.undo[hist.current.undo.length - 1]
    if (cur === last) return // niente doppioni
    // assorbi le raffiche (drag dei numerici): 1 passo per 200 ms
    const now = Date.now()
    if (now - lastPush.current < 200) return
    lastPush.current = now
    hist.current.undo.push(cur)
    if (hist.current.undo.length > 60) hist.current.undo.shift()
    hist.current.redo = []
  }, [])
  const undo = useCallback(() => {
    const prev = hist.current.undo.pop()
    if (!prev) return
    hist.current.redo.push(JSON.stringify(projectRef.current.settings.realWorld ?? null))
    setProject(p => {
      const q = JSON.parse(JSON.stringify(p)) as GameProject
      q.settings.realWorld = JSON.parse(prev)
      return q
    })
    setDirty(true)
  }, [])
  const redo = useCallback(() => {
    const next = hist.current.redo.pop()
    if (!next) return
    hist.current.undo.push(JSON.stringify(projectRef.current.settings.realWorld ?? null))
    setProject(p => {
      const q = JSON.parse(JSON.stringify(p)) as GameProject
      q.settings.realWorld = JSON.parse(next)
      return q
    })
    setDirty(true)
  }, [])

  // v18: trascina il bordo del dock per allargare/_stringere il Details
  const dockDragX = useRef(0)
  const startDockResize = (e: React.PointerEvent) => {
    e.preventDefault()
    dockDragX.current = e.clientX
    const move = (ev: PointerEvent) => {
      const dx = dockDragX.current - ev.clientX // dock a destra: trascina a sinistra = allarga
      dockDragX.current = ev.clientX
      setDetailsW(w => Math.min(680, Math.max(300, w + dx)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

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
    pushHist() // v18: ogni cambiamento entra nella cronologia (CTRL+Z)
    setProject(prev => {
      const q = JSON.parse(JSON.stringify(prev)) as GameProject
      fn(q.settings.realWorld!)
      return q
    })
    setDirty(true)
  }, [pushHist])

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

  // ---------- v19: creature e punti di interazione ----------
  const patchCreature = (id: string, fn: (c: RCreature) => void) => {
    mutateWorld(w => {
      const c = (w.creatures ?? []).find(x => x.id === id)
      if (c) fn(c)
    })
  }
  const removeCreature = (id: string) => {
    mutateWorld(w => {
      w.creatures = (w.creatures ?? []).filter(x => x.id !== id)
    })
  }
  const patchSpot = (id: string, fn: (s: RSpot) => void) => {
    mutateWorld(w => {
      const s = (w.spots ?? []).find(x => x.id === id)
      if (s) fn(s)
    })
  }
  const removeSpot = (id: string) => {
    mutateWorld(w => {
      w.spots = (w.spots ?? []).filter(x => x.id !== id)
    })
  }

  // ---------- v20: AI DEL MONDO (Darpx Engine) ----------
  const aiAssets = useMemo(
    () => [
      ...PREFAB_DEFS.map(d => ({ label: d.name })),
      ...models.map(m => ({ label: m.name })),
    ],
    [models]
  )
  const aiExec = useCallback(
    (cmd: AiCmd): string => {
      if (cmd.op === 'help') {
        return 'Comandi: «inserisci un Abete in 10,5» · «inserisci 5 Cassa in 10,5» · «metti 8 Abete tra -30,-30 e 30,30» · «elimina in 4,2» · «elimina tutte le Cassa». Coordinate in METRI dal centro.'
      }
      if (cmd.op === 'resize') {
        return 'Nel mondo realistico (Darpx Engine) il terreno è già infinito: non serve allungare nulla. 🌲'
      }
      if (cmd.op === 'place') {
        // trova il prefab (o modello) per nome
        const def = PREFAB_DEFS.find(d => d.name === cmd.asset)
        const model = def ? null : models.find(m => m.name === cmd.asset)
        if (!def && !model) return `✖ Non trovo «${cmd.asset}» nella paletta.`
        const count = Math.max(1, Math.min(50, cmd.n || 1))
        mutateWorld(w => {
          for (let i = 0; i < count; i++) {
            const j = (v: number, amp = 2.5) => (count > 1 ? v + (Math.random() * 2 - 1) * amp : v)
            w.objects.push({
              id: rid(),
              prefab: def ? def.id : 'glb',
              p: [j(cmd.x), 0, j(cmd.z)],
              r: [0, Math.round(Math.random() * 4) * 90, 0],
              s: [1, 1, 1],
              ...(model ? { url: model.url, name: model.name, anim: null } : {}),
            })
          }
        })
        return `${def?.icon ?? '📦'} ${cmd.asset} piazzato in (${cmd.x}, ${cmd.z})${count > 1 ? ` ×${count}` : ''}.`
      }
      if (cmd.op === 'scatter') {
        const def = PREFAB_DEFS.find(d => d.name === cmd.asset)
        const model = def ? null : models.find(m => m.name === cmd.asset)
        if (!def && !model) return `✖ Non trovo «${cmd.asset}» nella paletta.`
        const x1 = Math.min(cmd.x, cmd.x2), x2 = Math.max(cmd.x, cmd.x2)
        const z1 = Math.min(cmd.z, cmd.z2), z2 = Math.max(cmd.z, cmd.z2)
        const n = Math.max(1, Math.min(200, cmd.n || 1))
        mutateWorld(w => {
          for (let i = 0; i < n; i++) {
            w.objects.push({
              id: rid(),
              prefab: def ? def.id : 'glb',
              p: [x1 + Math.random() * (x2 - x1), 0, z1 + Math.random() * (z2 - z1)],
              r: [0, Math.random() * 360, 0],
              s: [1, 1, 1],
              ...(model ? { url: model.url, name: model.name, anim: null } : {}),
            })
          }
        })
        return `🌳 ${n} × ${cmd.asset} sparsi nell'area (${x1},${z1}) → (${x2},${z2}).`
      }
      if (cmd.op === 'delete') {
        let removed = ''
        mutateWorld(w => {
          let best: { id: string; d: number } | null = null
          for (const o of w.objects) {
            if (o.prefab === 'bosco-notturno') continue // l'ambiente non si tocca per errore
            const d = Math.hypot(o.p[0] - cmd.x, o.p[2] - cmd.z)
            if (d <= 4 && (!best || d < best.d)) best = { id: o.id, d }
          }
          if (best) {
            removed = w.objects.find(o => o.id === best!.id)?.prefab ?? ''
            w.objects = w.objects.filter(o => o.id !== best!.id)
          }
        })
        return removed ? `🗑 Eliminato «${removed}» (il più vicino alle coordinate).` : '✖ Nessun oggetto entro 4 metri.'
      }
      if (cmd.op === 'deleteAll') {
        let n = 0
        mutateWorld(w => {
          const before = w.objects.length
          w.objects = w.objects.filter(o => {
            const name = PREFABS[o.prefab]?.name ?? o.name ?? ''
            return !(name && (name.includes(cmd.asset) || cmd.asset.includes(name)))
          })
          n = before - w.objects.length
        })
        return n ? `🗑 Eliminati ${n} oggetti «${cmd.asset}».` : `✖ Nessun oggetto «${cmd.asset}» nel mondo.`
      }
      return '✖ Comando non gestito.'
    },
    [models, mutateWorld]
  )

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
    } else if (placing.kind === 'creature') {
      // v19: creatura con default sensati (vaga, occhi bianchi)
      mutateWorld(w => {
        if (!w.creatures) w.creatures = []
        w.creatures.push({
          id: `C${rid()}`,
          name: `Creatura ${w.creatures.length + 1}`,
          p: [p.x, 0, p.z],
          kind: 'vaga',
          speed: 1.3,
          aggro: 9,
          dmg: 6,
          scale: 1,
          color: '#14161a',
        })
      })
      sfx.pickup()
    } else if (placing.kind === 'spot') {
      // v19: punto di interazione "[E] …"
      mutateWorld(w => {
        if (!w.spots) w.spots = []
        w.spots.push({
          id: `S${rid()}`,
          label: 'Interagisci',
          p: [p.x, 0, p.z],
          radius: 2.4,
          action: 'messaggio',
          msg: 'Fatto.',
          holdMs: 1200,
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

  // ---------- scorciatoie da tastiera (v18: stile Unreal/Godot) ----------
  useEffect(() => {
    if (mode !== 'edit') return
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // UNDO / REDO (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault()
        redo()
        return
      }
      if (e.code === 'Escape') {
        if (placing) setPlacing(null)
        else setSelectedId(null)
      }
      if (e.code === 'KeyR' && placing) setPlaceRot(r => (r + 45) % 360)
      // gizmo: 1/2/3 (classici) e W/E/R (come in Unreal Engine)
      if (e.code === 'Digit1' || e.code === 'KeyW') setGizmo('translate')
      if (e.code === 'Digit2' || e.code === 'KeyE') setGizmo('rotate')
      if (e.code === 'Digit3' || e.code === 'KeyR') setGizmo('scale')
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedId) deleteSelected()
      }
      if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey) && selectedId) {
        e.preventDefault()
        duplicateSelected()
      }
      // F: inquadra la selezione (come Unreal/Godot)
      if (e.code === 'KeyF' && selectedId) {
        const controls = controlsRef.current as { target: THREE.Vector3; update: () => void } | null
        const g = groups.current.get(selectedId)
        if (controls && g) {
          const p = new THREE.Vector3()
          g.getWorldPosition(p)
          controls.target.copy(p)
          controls.update()
        }
      }
      // H: nascondi/mostra la selezione in gioco
      if (e.code === 'KeyH' && selectedObj) {
        mutateWorld(w => {
          const o = w.objects.find(x => x.id === selectedId)
          if (o) o.hidden = !o.hidden
        })
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, placing, selectedId, world, selectedObj, undo, redo])

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

  // v18: inquadra la selezione con la camera (bottone 🎯 nel Details)
  const focusSelected = () => {
    const controls = controlsRef.current as { target: THREE.Vector3; update: () => void } | null
    const g = selectedId ? groups.current.get(selectedId) : null
    if (!controls || !g) return
    const p = new THREE.Vector3()
    g.getWorldPosition(p)
    controls.target.copy(p)
    controls.update()
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
  // v17: nel tab Personaggi ci sono anche i modelli del CATALOGO
  // (i Cyber Samurai e tutti gli altri personaggi animati)
  const paletteItems =
    paletteCat === 'luce'
      ? []
      : paletteCat === 'glb'
        ? [
            ...GLB_CATALOG.filter(e => e.category === 'personaggi').map(e => ({
              id: `glb:${e.url}`,
              name: e.name,
              icon: '🧍',
              desc: 'Catalogo · pronto',
            })),
            ...models.map(m => ({ id: `glb:${m.url}`, name: m.name, icon: '🧍', desc: 'Modello GLB tuo' })),
          ]
        : PREFAB_DEFS.filter(d => d.cat === paletteCat)

  // ============================================================
  // RENDER
  // ============================================================

  if (!glOK) return <NoGLCard />

  // ---------- PLAY ----------
  // v19: gioco a SCHIERO INTERO (fixed inset-0, zero chrome attorno):
  // la stessa esperienza del trailer, con HUD, creature e audio
  if (mode === 'play') {
    return (
      <RealPlay
        world={world}
        title={project.title}
        onEditor={() => setMode('edit')}
        onExit={onBack}
      />
    )
  }

  // ---------- EDIT ----------
  const env = world.env
  return (
    // v21: EDITOR A SCHERMO PIENO — copre tutto il browser (header e
    // barra del sito compresi): il viewport 3D è ORIZZONTALE e arriva
    // bordo a bordo, i pannelli sono estrattori stretti sopra di esso
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--site-bg)]">
      {/* barra superiore */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-1.5">
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
        <button
          className={`cp-chip ${showLeft ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
          onClick={() => setShowLeft(v => !v)}
          title="Mostra/nascondi il pannello MATERIALI (sinistro)"
        >
          ◧ Materiali
        </button>
        <button
          className={`cp-chip ${showRight ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
          onClick={() => setShowRight(v => !v)}
          title="Mostra/nascondi il pannello DETAILS + AI (destro)"
        >
          Details ◨
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* v18: undo/redo + guida scorciatoie, stile editor seri */}
          <button className="cp-chip hover:text-[var(--neon)]" onClick={undo} title="Annulla (CTRL+Z)" disabled={hist.current.undo.length === 0}>
            ↶
          </button>
          <button className="cp-chip hover:text-[var(--neon)]" onClick={redo} title="Ripeti (CTRL+Y)">
            ↷
          </button>
          <button className="cp-chip hover:text-[var(--neon)]" onClick={() => setShowHelp(v => !v)} title="Tutti i comandi dell'editor">
            ⌨ ?
          </button>
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

      {/* menu template a tendina (finestra flottante sopra il viewport) */}
      {tplOpen && (
        <div className="cp-panel absolute left-1/2 top-14 z-40 w-[min(940px,94vw)] -translate-x-1/2 p-3 shadow-2xl">
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

      {/* v18: GUIDA — finestra flottante sopra il viewport */}
      {showHelp && (
        <div className="cp-panel absolute left-1/2 top-14 z-40 w-[min(880px,94vw)] -translate-x-1/2 p-4 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-[var(--tx)]">⌨ Comandi dell&apos;editor</p>
            <button className="cp-chip" onClick={() => setShowHelp(false)}>✕ chiudi</button>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] leading-relaxed text-[var(--tx-dim)] sm:grid-cols-2 lg:grid-cols-3">
            <p><b>W / 1</b> — gizmo Sposta (Translate)</p>
            <p><b>E / 2</b> — gizmo Ruota (Rotate)</p>
            <p><b>R / 3</b> — gizmo Scala (Scale)</p>
            <p><b>CANC</b> — elimina la selezione</p>
            <p><b>CTRL+D</b> — duplica la selezione</p>
            <p><b>CTRL+Z</b> — annulla (undo)</p>
            <p><b>CTRL+Y / CTRL+SHIFT+Z</b> — ripeti (redo)</p>
            <p><b>F</b> — inquadra la selezione</p>
            <p><b>H</b> — nascondi/mostra la selezione in gioco</p>
            <p><b>R</b> (piazzando) — ruota di 45°</p>
            <p><b>ESC</b> — deseleziona / annulla piazzamento</p>
            <p><b>Click sx</b> — ruota la vista · <b>rotella</b> zoom</p>
            <p><b>Trascina bordo Details</b> — allarga/stringe l&apos;ispettore</p>
            <p><b>Click destro</b> — pan della mappa</p>
            <p><b>▶ PROVA</b> — WASD muovi · SHIFT corri · SPAZIO salta</p>
          </div>
        </div>
      )}

      {/* corpo: il viewport 3D occupa TUTTO lo schermo (sfondo pieno,
          orizzontale, senza bordi neri); i pannelli di controllo sono
          estrattori stretti che galleggiano sopra e si richiudono */}
      <div className="relative min-h-0 flex-1">
        {/* PALETTA — estrattore sinistro */}
        <div
          className={`cp-panel absolute bottom-0 left-0 top-0 z-20 flex w-64 flex-col overflow-y-auto p-3 transition-transform duration-200 ${showLeft ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ background: 'color-mix(in srgb, var(--panel) 88%, transparent)', backdropFilter: 'blur(8px)' }}
        >
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
          ) : paletteCat === 'creature' ? (
            /* ---------- v19: CREATURE (mostri con IA, come nel trailer) ---------- */
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
              <button
                className={`rounded-lg border p-3 text-left transition-colors ${placing?.kind === 'creature' ? 'border-[var(--neon)] bg-[var(--primary-soft)]' : 'border-[var(--line)] hover:border-[var(--neon)]'}`}
                onClick={() => setPlacing(placing?.kind === 'creature' ? null : { kind: 'creature' })}
              >
                <span className="text-2xl">👹</span>
                <p className="mt-1 text-sm font-bold text-[var(--tx)]">Piazza una creatura</p>
                <p className="text-[11px] text-[var(--tx-dim)]">
                  Corpo scuro, occhi bianchi luminosi, nametag. Clicca il terreno per piazzarla, poi regola l&apos;IA qui sotto.
                </p>
              </button>
              {(world.creatures ?? []).map(c => (
                <div key={c.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span>👹</span>
                    <input
                      value={c.name}
                      onChange={e => patchCreature(c.id, cr => { cr.name = e.target.value })}
                      className="h-7 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 text-xs font-semibold text-[var(--tx)] outline-none focus:border-[var(--neon)]"
                      placeholder="Nome sopra la testa"
                    />
                    <button className="cp-chip text-red-400" title="Elimina" onClick={() => removeCreature(c.id)}>✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <label className="col-span-2">
                      <span className="text-[var(--tx-dim)]">Comportamento</span>
                      <select
                        value={c.kind}
                        onChange={e => patchCreature(c.id, cr => { cr.kind = e.target.value as RCreature['kind'] })}
                        className="mt-0.5 h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]"
                      >
                        <option value="vaga">🚶 Vaga tra gli alberi</option>
                        <option value="insegue">🏃 Ti insegue se ti vede</option>
                        <option value="ferma">🗿 Ferma (statua, fantasma)</option>
                      </select>
                    </label>
                    <NumFld label="Velocità" v={c.speed} min={0.3} max={6} step={0.1} on={v => patchCreature(c.id, cr => { cr.speed = v })} />
                    {c.kind === 'insegue' && (
                      <NumFld label="Vista (m)" v={c.aggro} min={2} max={40} step={1} on={v => patchCreature(c.id, cr => { cr.aggro = v })} />
                    )}
                    <NumFld label="Danni/s" v={c.dmg} min={0} max={40} step={1} on={v => patchCreature(c.id, cr => { cr.dmg = v })} />
                    <NumFld label="Scala" v={c.scale} min={0.4} max={3} step={0.1} on={v => patchCreature(c.id, cr => { cr.scale = v })} />
                    <label className="col-span-2">
                      <span className="text-[var(--tx-dim)]">Posizione X/Z</span>
                      <div className="mt-0.5 flex gap-1.5">
                        <input type="number" value={Math.round(c.p[0])} onChange={e => patchCreature(c.id, cr => { cr.p[0] = parseFloat(e.target.value) || 0 })} className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 font-mono text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]" />
                        <input type="number" value={Math.round(c.p[2])} onChange={e => patchCreature(c.id, cr => { cr.p[2] = parseFloat(e.target.value) || 0 })} className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 font-mono text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]" />
                      </div>
                    </label>
                  </div>
                </div>
              ))}
              {(world.creatures?.length ?? 0) === 0 && (
                <p className="text-[11px] leading-relaxed text-[var(--tx-dim)]">
                  Nessuna creatura. Il Bosco Notturno ne include già una: passala a «Ti insegue» per la modalità horror.
                </p>
              )}
            </div>
          ) : paletteCat === 'interazioni' ? (
            /* ---------- v19: INTERAZIONI (prompt [E] come nel trailer) ---------- */
            <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
              <button
                className={`rounded-lg border p-3 text-left transition-colors ${placing?.kind === 'spot' ? 'border-[var(--neon)] bg-[var(--primary-soft)]' : 'border-[var(--line)] hover:border-[var(--neon)]'}`}
                onClick={() => setPlacing(placing?.kind === 'spot' ? null : { kind: 'spot' })}
              >
                <span className="text-2xl">⛺</span>
                <p className="mt-1 text-sm font-bold text-[var(--tx)]">Piazza un&apos;interazione</p>
                <p className="text-[11px] text-[var(--tx-dim)]">
                  Il prompt «[E] …» con barra di avanzamento: riposare al falò, salvare, leggere un messaggio.
                </p>
              </button>
              {(world.spots ?? []).map(s => (
                <div key={s.id} className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span>⛺</span>
                    <input
                      value={s.label}
                      onChange={e => patchSpot(s.id, sp => { sp.label = e.target.value })}
                      className="h-7 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 text-xs font-semibold text-[var(--tx)] outline-none focus:border-[var(--neon)]"
                      placeholder="Es. Riposa al falò"
                    />
                    <button className="cp-chip text-red-400" title="Elimina" onClick={() => removeSpot(s.id)}>✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <label className="col-span-2">
                      <span className="text-[var(--tx-dim)]">Azione premendo E</span>
                      <select
                        value={s.action}
                        onChange={e => patchSpot(s.id, sp => { sp.action = e.target.value as RSpot['action'] })}
                        className="mt-0.5 h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]"
                      >
                        <option value="riposa">♨ Riposa (cura + salva)</option>
                        <option value="salva">💾 Salva il gioco</option>
                        <option value="messaggio">💬 Mostra un messaggio</option>
                      </select>
                    </label>
                    <NumFld label="Raggio (m)" v={s.radius} min={0.8} max={12} step={0.2} on={v => patchSpot(s.id, sp => { sp.radius = v })} />
                    <NumFld label="Secondi di E" v={(s.holdMs ?? 1200) / 1000} min={0.2} max={5} step={0.1} on={v => patchSpot(s.id, sp => { sp.holdMs = Math.round(v * 1000) })} fmt={v => `${v.toFixed(1)}s`} />
                    <label className="col-span-2">
                      <span className="text-[var(--tx-dim)]">Messaggio</span>
                      <input
                        value={s.msg ?? ''}
                        onChange={e => patchSpot(s.id, sp => { sp.msg = e.target.value })}
                        className="mt-0.5 h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]"
                        placeholder="Mostrato al termine"
                      />
                    </label>
                    <label className="col-span-2">
                      <span className="text-[var(--tx-dim)]">Posizione X/Z</span>
                      <div className="mt-0.5 flex gap-1.5">
                        <input type="number" value={Math.round(s.p[0])} onChange={e => patchSpot(s.id, sp => { sp.p[0] = parseFloat(e.target.value) || 0 })} className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 font-mono text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]" />
                        <input type="number" value={Math.round(s.p[2])} onChange={e => patchSpot(s.id, sp => { sp.p[2] = parseFloat(e.target.value) || 0 })} className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 font-mono text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]" />
                      </div>
                    </label>
                  </div>
                </div>
              ))}
              {(world.spots?.length ?? 0) === 0 && (
                <p className="text-[11px] leading-relaxed text-[var(--tx-dim)]">
                  Nessuna interazione. Il Bosco Notturno ha già il falò «Riposa al falò» al centro della radura.
                </p>
              )}
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

          {/* v18: OUTLINER — la lista gerarchica del mondo, stile Unreal */}
          <div className="mt-3">
            <StudioOutliner
              world={world}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPatchObj={(id, fn) => patchObject(id, fn)}
            />
          </div>

          <div className="mt-auto border-t border-[var(--line)] pt-2 text-[10px] leading-relaxed text-[var(--tx-faint)]">
            <b className="text-[var(--tx-dim)]">Comandi:</b> <b className="text-[var(--tx-dim)]">1/2/3</b> o{' '}
            <b className="text-[var(--tx-dim)]">W/E/R</b> sposta/ruota/scala · <b className="text-[var(--tx-dim)]">CANC</b> elimina ·{' '}
            <b className="text-[var(--tx-dim)]">CTRL+D</b> duplica · <b className="text-[var(--tx-dim)]">F</b> inquadra ·{' '}
            <b className="text-[var(--tx-dim)]">H</b> nasconde · <b className="text-[var(--tx-dim)]">CTRL+Z</b> undo
          </div>
        </div>

        {/* VIEWPORT — a tutto schermo, bordo a bordo (v21) */}
        <div className="absolute inset-0 overflow-hidden">
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
            <EditMarkers world={world} onPickC={id => setSelectedId(id)} />
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

          {/* barra modalità gizmo (si sposta accanto al pannello sinistro) */}
          <div className={`absolute top-3 flex gap-1 rounded-xl bg-black/55 p-1 backdrop-blur transition-[left] duration-200 ${showLeft ? 'left-[17.5rem]' : 'left-3'}`}>
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
                  : placing.kind === 'glb'
                    ? `Piazzando: ${placing.name}`
                    : placing.kind === 'creature'
                      ? 'Piazzando: 👹 creatura — clicca il terreno'
                      : 'Piazzando: ⛺ interazione [E] — clicca il terreno'}
              {' '}· click sulla scena per posare · R ruota ({placeRot}°) · ESC fine
            </div>
          )}

          {/* statistiche */}
          <div className={`absolute bottom-3 rounded-lg bg-black/50 px-2.5 py-1 font-mono text-[10px] text-white/60 backdrop-blur transition-[left] duration-200 ${showLeft ? 'left-[17.5rem]' : 'left-3'}`}>
            {world.objects.length} oggetti · {world.lights.length} luci · spawn {world.spawn.map(v => v.toFixed(0)).join(', ')}
          </div>
        </div>

        {/* v18+v21: DOCK DESTRO — estrattore flottante Details + AI */}
        <div
          className={`absolute bottom-0 right-0 top-0 z-20 flex w-[var(--dock-w)] max-w-full flex-col transition-transform duration-200 ${showRight ? 'translate-x-0' : 'translate-x-full'}`}
          style={{ '--dock-w': `${detailsW}px` } as React.CSSProperties}
        >
          <div
            className="absolute left-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize bg-[var(--line)] transition-colors hover:bg-[var(--neon)] lg:block"
            title="Trascina per allargare o stringere il Details"
            onPointerDown={startDockResize}
          />
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto border-l border-[var(--line)] pl-2"
            style={{ background: 'color-mix(in srgb, var(--panel) 88%, transparent)', backdropFilter: 'blur(8px)' }}
          >
            {/* v18: DETAILS PANEL in scala 1:1 su Unreal/Godot */}
            <StudioDetails
              obj={selectedObj}
              light={selectedLight}
              onPatchObj={fn => { if (selectedObj) patchObject(selectedObj.id, fn) }}
              onPatchLight={fn => { if (selectedLight) patchLight(selectedLight.id, fn) }}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
              onFocus={focusSelected}
            />

            {/* v20: AI DEL MONDO — il piccolo reparto AI dentro i mondi */}
            <div className="mt-3 px-3">
              <AiWorldConsole
                assets={aiAssets}
                exec={aiExec}
                title="🤖 AI del Mondo"
                hint="Scrivi cosa piazzare e dove (metri): «inserisci un Abete in 10,5», «metti 8 Abete tra -30,-30 e 30,30», «elimina tutte le Cassa»."
              />
            </div>

            {/* WORLD SETTINGS — ambiente e personaggio, sempre visibili */}
            <div className="mt-2 border-t border-[var(--line)] px-3 pb-3">
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--tx-faint)]">▶</span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[var(--tx-dim)]">World Settings</span>
              </div>
              <p className="mb-2 text-[10px] leading-relaxed text-[var(--tx-faint)]">
                Cielo, nebbia, bloom e personaggio del giocatore valgono per TUTTO il mondo (come il World Settings di Unreal).
              </p>
            </div>

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

          {/* v17: PERSONAGGIO DEL GIOCATORE */}
          <div className="mt-4 border-t border-[var(--line)] pt-3">
            <p className="mb-2 text-[10px] font-bold tracking-wider text-[var(--tx-faint)]">PERSONAGGIO DEL GIOCATORE</p>
            <label className="block text-[11px] text-[var(--tx-dim)]">
              Eroe controllato in gioco
              <select
                value={world.player?.url ?? ''}
                onChange={e => {
                  const url = e.target.value
                  if (!url) {
                    mutateWorld(w => { w.player = undefined })
                    return
                  }
                  const cat = GLB_CATALOG.find(x => x.url === url)
                  const usr = models.find(x => x.url === url)
                  mutateWorld(w => {
                    w.player = {
                      url,
                      name: cat?.name ?? usr?.name,
                      anim: w.player?.anim ?? null,
                      cam: 'terza',
                      yawOff: w.player?.yawOff ?? 0,
                    }
                  })
                }}
                className="mt-1 h-8 w-full rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)]"
              >
                <option value="">Nessuno — solo camera (prima persona)</option>
                {GLB_CATALOG.filter(x => x.category === 'personaggi').map(e => (
                  <option key={e.id} value={e.url}>🎬 {e.name} (catalogo)</option>
                ))}
                {models.map(m => (
                  <option key={m.id} value={m.url}>🧊 {m.name} (tuo)</option>
                ))}
              </select>
            </label>
            {world.player?.url && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex gap-1">
                  {(['prima', 'terza'] as const).map(cm => (
                    <button
                      key={cm}
                      onClick={() => mutateWorld(w => { if (w.player) w.player.cam = cm })}
                      className={`cp-chip flex-1 text-center text-[11px] ${world.player?.cam === cm ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
                      title={cm === 'prima' ? 'Vedi dal punto di vista del personaggio' : 'Vedi il personaggio dietro le spalle'}
                    >
                      {cm === 'prima' ? '👁 camera in testa' : '🎥 camera dietro'}
                    </button>
                  ))}
                </div>
                <NumField
                  label="clip"
                  value={world.player.anim ?? 0}
                  step={1}
                  min={0}
                  onChange={v => mutateWorld(w => { if (w.player) w.player.anim = Math.max(0, Math.round(v)) })}
                />
                <NumField
                  label="yaw"
                  value={world.player.yawOff ?? 0}
                  step={15}
                  onChange={v => mutateWorld(w => { if (w.player) w.player.yawOff = v })}
                />
                <p className="text-[10px] leading-relaxed text-[var(--tx-faint)]">
                  <b>clip</b>: numero dell&apos;animazione del modello (0 = la prima, per i Cyber Samurai è
                  sempre la giusta). <b>yaw</b>: metti 90° o 180° solo se il modello corre al contrario.
                </p>
              </div>
            )}
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

// ============================================================
// v19: MARKER EDITOR delle creature e delle interazioni
// nell'editor si vedono come anelli sulla mappa (con occhi
// per le creature); in gioco spariscono (gestiti da RealPlay)
// ============================================================

function EditMarkers({
  world,
  onPickC,
}: {
  world: RWorld
  onPickC: (id: string) => void
}) {
  const ring = (color: string, r: number) => (
    <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r * 0.78, r, 28]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
    </mesh>
  )
  return (
    <>
      {(world.creatures ?? []).map(c => (
        <group
          key={c.id}
          position={[c.p[0], 0, c.p[2]]}
          onPointerDown={e => {
            e.stopPropagation()
            onPickC(c.id)
          }}
        >
          {ring('#ff4d4d', 0.9 * c.scale)}
          {/* occhi bianchi flosci, il segnale del trailer */}
          <mesh position={[-0.09, 1.62 * c.scale, 0.3]}>
            <sphereGeometry args={[0.05 * c.scale, 8, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0.09, 1.62 * c.scale, 0.3]}>
            <sphereGeometry args={[0.05 * c.scale, 8, 8]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {/* sagoma scura stilizzata */}
          <mesh position={[0, 0.95 * c.scale, 0]}>
            <capsuleGeometry args={[0.3 * c.scale, 0.75 * c.scale, 4, 8]} />
            <meshStandardMaterial color={c.color} roughness={1} />
          </mesh>
        </group>
      ))}
      {(world.spots ?? []).map(s => (
        <group key={s.id} position={[s.p[0], 0, s.p[2]]}>
          {ring(s.action === 'riposa' ? '#ffb347' : s.action === 'salva' ? '#4dc3ff' : '#b8ff4d', s.radius)}
          {/* icona dell'azione che galleggia */}
          <Billboard y={1.1}>
            <mesh>
              <planeGeometry args={[0.7, 0.7]} />
              <meshBasicMaterial transparent opacity={0.001} />
            </mesh>
          </Billboard>
        </group>
      ))}
    </>
  )
}

/** insegua minimale: sempre girata verso la camera */
function Billboard({ y, children }: { y: number; children?: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion)
  })
  return (
    <group ref={ref} position={[0, y, 0]}>
      {children}
    </group>
  )
}

/** campo numerico compatto usato dai pannelli Creature/Interazioni */
export function NumFld({
  label,
  v,
  min,
  max,
  step,
  on,
  fmt,
}: {
  label: string
  v: number
  min: number
  max: number
  step: number
  on: (v: number) => void
  fmt?: (v: number) => string
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-[10px] text-[var(--tx-dim)]">
        {label}
        <span className="font-mono text-[var(--tx)]">{fmt ? fmt(v) : v.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={e => on(parseFloat(e.target.value))}
        className="mt-0.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--neon)]"
      />
    </label>
  )
}
