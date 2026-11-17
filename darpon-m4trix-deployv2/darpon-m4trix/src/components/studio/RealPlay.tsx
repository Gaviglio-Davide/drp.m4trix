'use client'

// ============================================================
// DARPX ENGINE — REAL PLAY (v19)
// Il player fullscreen del gioco realistico, ispirato al
// trailer horror: schermo intero senza chrome, HUD da gioco
// vero (stamina e salute in basso a sinistra, orario della
// notte in alto a destra, prompt [E] con barra di avanzamento),
// creature con occhi bianchi luminosi e nametag, audio di
// ambientamento (vento, battito, crepitio), morte e ripristino.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Button } from '@/components/ui/button'
import { sfx, unlockAudio } from '@/lib/game2d/sfx'
import { NoGLCard, webglSupported } from '@/components/game/GLGuard'
import type { RCreature, RSpot, RWorld } from '@/lib/engine3d/types'
import { worldColliders, collideAndGround, safeSpawn } from '@/lib/engine3d/builder'
import { PostFXView, RealEnv, WorldObjects } from './RealisticViews'

// ============================================================
// AUDIO D'ATMOSFERA (WebAudio puro, nessun asset)
// ============================================================

type Ctx = AudioContext & { __wind?: { src: AudioBufferSourceNode; gain: GainNode } }

function ctx(): Ctx | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  return new AC() as Ctx
}

/** thump: colpo sordo (battito, danno, passo profondo) */
function thump(vol = 0.2, freq = 55, dur = 0.14) {
  const c = ctx()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq, c.currentTime)
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.55), c.currentTime + dur)
  g.gain.setValueAtTime(vol, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  o.connect(g).connect(c.destination)
  o.start()
  o.stop(c.currentTime + dur + 0.02)
}

/** crackle: scoppio breve per il crepitio del fuoco */
function crackle(vol = 0.05) {
  const c = ctx()
  if (!c) return
  const len = Math.floor(c.sampleRate * 0.05)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.value = vol
  const f = c.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 900
  src.connect(f).connect(g).connect(c.destination)
  src.start()
}

/** vento continuo in sottofondo (loop di rumore filtrato) */
function startWind(): { stop: () => void } | null {
  const c = ctx()
  if (!c) return null
  const len = c.sampleRate * 3
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    last = last * 0.96 + w * 0.04 // rumore marrone, molto morbido
    d[i] = last * 6
  }
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 420
  const g = c.createGain()
  g.gain.value = 0.055
  const lfo = c.createOscillator()
  const lg = c.createGain()
  lfo.frequency.value = 0.13 // la brezza sale e scende
  lg.gain.value = 0.02
  lfo.connect(lg).connect(g.gain)
  src.connect(f).connect(g).connect(c.destination)
  src.start()
  lfo.start()
  return {
    stop: () => {
      try {
        src.stop()
        lfo.stop()
      } catch { /* già fermato */ }
    },
  }
}

// ============================================================
// RUNTIME condiviso (ref, niente re-render per frame)
// ============================================================

export type PlayRt = {
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  clockMin: number // minuti di gioco (partono da 23:50)
  prompt: string | null
  progress: number // 0..1 della barra [E]
  dmgT: number // ultimo colpo subito (per il flash rosso)
  threat: number // 0..1 vicinanza della creatura più pericolosa
  msg: { text: string; t: number } | null
  savedOnce: boolean
}

const WALK_SPEED = 4.2
const RUN_SPEED = 7.6
const JUMP_VEL = 7.4
const GRAVITY = 24

// ============================================================
// PLAYER RIG — prima persona con stamina, salute, interazioni
// ============================================================

function PlayerRig({
  world,
  rt,
  lookRef,
  colliders,
}: {
  world: RWorld
  rt: React.MutableRefObject<PlayRt>
  lookRef: React.MutableRefObject<{ yaw: number; pitch: number }>
  colliders: THREE.Box3[]
}) {
  const { camera } = useThree()
  const pos = useRef(safeSpawn(world, colliders))
  const vel = useRef(new THREE.Vector3())
  const keys = useRef<Record<string, boolean>>({})
  const bob = useRef(0)
  const stepT = useRef(0)
  const fovRef = useRef(70)
  const holdT = useRef(0)
  const clockT = useRef(0)
  const crackleT = useRef(0)
  const staminaOut = useRef(false)

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

  // respawn sopra lo spawn se caduto sotto il pavimento
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const k = keys.current
    const R = rt.current

    // orologio di gioco: 1 minuto di gioco ogni 1.15 s reali
    clockT.current += dt
    while (clockT.current > 1.15) {
      clockT.current -= 1.15
      R.clockMin = (R.clockMin + 1) % (24 * 60)
    }

    // direzione input relativa alla camera
    const ix = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0)
    const iz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
    const yaw = lookRef.current.yaw
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
    const wantRun = !!(k.ShiftLeft || k.ShiftRight) && !staminaOut.current
    const speed = wantRun ? RUN_SPEED : WALK_SPEED
    const move = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix)
    const moving = move.lengthSq() > 0
    if (moving) move.normalize().multiplyScalar(speed)

    // STAMINA: correre consuma, il resto ricarica
    if (wantRun && moving) {
      R.stamina -= 13 * dt
      if (R.stamina <= 0) {
        R.stamina = 0
        staminaOut.current = true
        thump(0.1, 90, 0.2) // fiato corto
      }
    } else {
      R.stamina += 9.5 * dt
      if (R.stamina > R.maxStamina) R.stamina = R.maxStamina
      if (staminaOut.current && R.stamina > R.maxStamina * 0.3) staminaOut.current = false
    }

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
    if (pos.current.y < -6) {
      pos.current.copy(safeSpawn(world, colliders))
      vel.current.set(0, 0, 0)
    }

    // camera + head bob (respiro del movimento, come nei giochi veri)
    const speedF = moving ? move.length() / RUN_SPEED : 0
    bob.current += dt * (7 + speedF * 7)
    const bobY = Math.sin(bob.current * 1.15) * 0.045 * (0.35 + speedF)
    const breathe = Math.sin(state.clock.elapsedTime * 1.9) * 0.006
    camera.rotation.set(lookRef.current.pitch, lookRef.current.yaw, 0, 'YXZ')
    camera.position.set(pos.current.x, pos.current.y + 1.66 + bobY + breathe, pos.current.z)

    // fov kick in corsa
    const targetFov = wantRun && moving ? 77 : 70
    fovRef.current += (targetFov - fovRef.current) * Math.min(1, dt * 5)
    if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - fovRef.current) > 0.05) {
      camera.fov = fovRef.current
      camera.updateProjectionMatrix()
    }

    // passi
    if (moving && res.onGround) {
      stepT.current += dt
      const interval = wantRun ? 0.3 : 0.46
      if (stepT.current > interval) {
        stepT.current = 0
        sfx.step()
      }
    }

    // ---------- INTERAZIONI (spots): prompt + pressione prolungata di E ----------
    const spots = world.spots ?? []
    let prompt: string | null = null
    let nearest: RSpot | null = null
    let nd = Infinity
    for (const s of spots) {
      const d = Math.hypot(s.p[0] - pos.current.x, s.p[2] - pos.current.z)
      if (d < s.radius && d < nd) {
        nd = d
        nearest = s
        prompt = s.label
      }
    }
    R.prompt = prompt ? `[E] ${prompt}` : null
    if (nearest && k.KeyE) {
      holdT.current += dt * 1000
      R.progress = Math.min(1, holdT.current / (nearest.holdMs ?? 1200))
      if (R.progress >= 1) {
        holdT.current = 0
        R.progress = 0
        if (nearest.action === 'riposa') {
          R.hp = R.maxHp
          R.stamina = R.maxStamina
          sfx.heal()
          R.msg = { text: nearest.msg || 'Ti sei riposato: salute e energie tornate.', t: performance.now() }
          R.savedOnce = true
        } else if (nearest.action === 'salva') {
          sfx.win()
          R.msg = { text: nearest.msg || 'Gioco salvato.', t: performance.now() }
          R.savedOnce = true
        } else {
          sfx.pickup()
          R.msg = { text: nearest.msg || 'Fatto.', t: performance.now() }
        }
      }
    } else {
      holdT.current = 0
      R.progress = 0
    }

    // crepitio del fuoco vicino ai punti di riposo
    let fireD = Infinity
    for (const s of spots) {
      if (s.action !== 'riposa') continue
      fireD = Math.min(fireD, Math.hypot(s.p[0] - pos.current.x, s.p[2] - pos.current.z))
    }
    if (fireD < 6) {
      crackleT.current -= dt
      if (crackleT.current <= 0) {
        crackleT.current = 0.14 + Math.random() * 0.3
        crackle(Math.max(0.015, 0.075 * (1 - fireD / 6)))
      }
    }
    void state
  })
  return null
}

// ============================================================
// CREATURE — mostri con occhi bianchi, nametag e IA
// ============================================================

type CreatureRT = {
  cfg: RCreature
  g: THREE.Group
  home: THREE.Vector3
  wp: THREE.Vector3
  waitT: number
  chasing: boolean
}

function buildCreatureMesh(cfg: RCreature): THREE.Group {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.96, metalness: 0.02 })
  const S = cfg.scale
  // busto allungato e incurvato in avanti (minaccia silenziosa)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3 * S, 0.72 * S, 5, 10), bodyMat)
  body.position.y = 1.02 * S
  body.rotation.x = 0.22
  body.castShadow = true
  g.add(body)
  // testa
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23 * S, 12, 10), bodyMat)
  head.position.set(0, 1.58 * S, 0.12 * S)
  head.castShadow = true
  g.add(head)
  // bracchia lunghe e sottili
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075 * S, 0.62 * S, 4, 8), bodyMat)
    arm.position.set(side * 0.34 * S, 1.0 * S, 0.1 * S)
    arm.rotation.x = 0.24
    arm.rotation.z = side * 0.14
    arm.castShadow = true
    g.add(arm)
  }
  // OCCHI BIANCHI LUMINOSI (il marchio del trailer)
  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 5.5,
    roughness: 0.3,
  })
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042 * S, 8, 8), eyeMat)
    eye.position.set(side * 0.085 * S, 1.62 * S, 0.32 * S)
    g.add(eye)
  }
  return g
}

function Creatures({
  creatures,
  rt,
  onTags,
}: {
  creatures: RCreature[]
  rt: React.MutableRefObject<PlayRt>
  onTags: (tags: { id: string; name: string; x: number; y: number; d: number }[]) => void
}) {
  const { camera, scene } = useThree()
  const list = useMemo<CreatureRT[]>(() => {
    const out: CreatureRT[] = []
    for (const cfg of creatures.slice(0, 16)) {
      const g = buildCreatureMesh(cfg)
      g.position.set(cfg.p[0], 0, cfg.p[2])
      scene.add(g)
      out.push({
        cfg,
        g,
        home: new THREE.Vector3(cfg.p[0], 0, cfg.p[2]),
        wp: new THREE.Vector3(cfg.p[0], 0, cfg.p[2]),
        waitT: 1 + Math.random() * 2,
        chasing: false,
      })
    }
    return out
    // costruite una sola volta per lista creature
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatures])
  useEffect(() => {
    return () => {
      for (const c of list) scene.remove(c.g)
    }
  }, [list, scene])

  const tagT = useRef(0)
  const beatT = useRef(0)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const R = rt.current
    const t = state.clock.elapsedTime
    const player = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
    let maxThreat = 0

    for (const c of list) {
      const cfg = c.cfg
      const pos = c.g.position
      const dist = Math.hypot(player.x - pos.x, player.z - pos.z)
      // ---------- IA ----------
      if (cfg.kind === 'insegue') {
        if (!c.chasing && dist < cfg.aggro) c.chasing = true
        if (c.chasing && dist > cfg.aggro * 1.9) c.chasing = false
      }
      const chasing = c.chasing && cfg.kind === 'insegue'
      const spd = chasing ? cfg.speed : cfg.kind === 'vaga' ? Math.max(0.7, cfg.speed * 0.55) : 0
      if (cfg.kind !== 'ferma' && spd > 0) {
        const tx = chasing ? player.x : c.wp.x
        const tz = chasing ? player.z : c.wp.z
        const dx = tx - pos.x
        const dz = tz - pos.z
        const d = Math.hypot(dx, dz)
        if (d > 0.5) {
          pos.x += (dx / d) * spd * dt
          pos.z += (dz / d) * spd * dt
          c.g.rotation.y = Math.atan2(dx, dz)
          // dondolio minaccioso mentre cammina
          c.g.position.y = Math.abs(Math.sin(t * spd * 2.6)) * 0.05
        } else if (!chasing) {
          c.waitT -= dt
          if (c.waitT <= 0) {
            c.waitT = 4 + Math.random() * 5
            const a = Math.random() * Math.PI * 2
            const rr = 4 + Math.random() * 9
            c.wp.set(
              THREE.MathUtils.clamp(c.home.x + Math.cos(a) * rr, -70, 70),
              0,
              THREE.MathUtils.clamp(c.home.z + Math.sin(a) * rr, -70, 70)
            )
          }
        }
      }
      // ---------- DANNO AL CONTATTO ----------
      if (dist < 1.25 && cfg.dmg > 0) {
        R.hp = Math.max(0, R.hp - cfg.dmg * dt)
        R.dmgT = performance.now()
        maxThreat = Math.max(maxThreat, 1)
      }
      // minaccia per il battito: quanto è vicina la creatura più pericolosa
      if (cfg.dmg > 0 && cfg.kind !== 'ferma') {
        const th = THREE.MathUtils.clamp(1 - dist / 14, 0, 1)
        if (th > maxThreat) maxThreat = th
      }
      // i fari-bianchi tremano leggermente (intensità che respira)
      void pos
    }

    // ---------- BATTITO ----------
    R.threat = maxThreat
    if (maxThreat > 0.12) {
      beatT.current -= dt
      if (beatT.current <= 0) {
        beatT.current = 1.05 - maxThreat * 0.5 // più è vicina, più batte forte
        const v = 0.07 + maxThreat * 0.16
        thump(v, 52, 0.16)
        setTimeout(() => thump(v * 0.75, 48, 0.13), 210) // lub-dub
      }
    }

    // ---------- NAMETAG (proiezione a schermo, 10 volte al secondo) ----------
    tagT.current -= dt
    if (tagT.current <= 0) {
      tagT.current = 0.1
      const tags: { id: string; name: string; x: number; y: number; d: number }[] = []
      const v = new THREE.Vector3()
      const canvas = document.querySelector('canvas[data-engine]')
      const cw = canvas?.clientWidth ?? window.innerWidth
      const ch = canvas?.clientHeight ?? window.innerHeight
      for (const c of list) {
        v.set(c.g.position.x, 2.15 * c.cfg.scale, c.g.position.z)
        v.project(camera as THREE.PerspectiveCamera)
        const dist = Math.hypot(player.x - c.g.position.x, player.z - c.g.position.z)
        if (v.z > 1 || dist > 42) continue
        tags.push({
          id: c.cfg.id,
          name: c.cfg.name,
          x: (v.x * 0.5 + 0.5) * cw,
          y: (-v.y * 0.5 + 0.5) * ch,
          d: dist,
        })
      }
      onTags(tags)
    }
    void state
  })
  return null
}

// ============================================================
// HUD ORRORE + overlay stile trailer
// ============================================================

function fmtClock(min: number): string {
  const hh = String(Math.floor(min / 60) % 24).padStart(2, '0')
  const mm = String(min % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export default function RealPlay({
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
  const [glOK] = useState(() => webglSupported())
  const canvasEl = useRef<HTMLCanvasElement | null>(null)
  const look = useRef({ yaw: world.spawnYaw, pitch: 0 })
  const [lockState, setLockState] = useState<'start' | 'playing' | 'paused'>('start')
  const [dead, setDead] = useState(false)
  const [runId, setRunId] = useState(0)
  const [tags, setTags] = useState<{ id: string; name: string; x: number; y: number; d: number }[]>([])
  const [hud, setHud] = useState({
    hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
    prompt: null as string | null,
    progress: 0,
    clock: '23:50',
    threat: 0,
    dmgA: 0,
    msg: null as string | null,
    fps: 0,
  })
  const fpsCount = useRef({ n: 0, t: 0 })
  const windRef = useRef<{ stop: () => void } | null>(null)
  const [fsOn, setFsOn] = useState(false)

  // runtime del giocatore: salute/stamina/orologio/interazioni
  const rt = useRef<PlayRt>({
    hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
    clockMin: 23 * 60 + 50,
    prompt: null, progress: 0, dmgT: 0, threat: 0,
    msg: null, savedOnce: false,
  })

  const colliders = useMemo(() => worldColliders(world), [world])

  const requestLock = useCallback(() => {
    unlockAudio()
    if (!windRef.current) windRef.current = startWind()
    const el = canvasEl.current
    if (!el) return
    try {
      const req = el.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | void
      const p = req({ unadjustedMovement: true })
      if (p && typeof (p as Promise<void>).catch === 'function') {
        ;(p as Promise<void>).catch(() => {
          try {
            ;(el.requestPointerLock as () => void)()
          } catch { /* browser senza pointer lock */ }
        })
      }
    } catch {
      try {
        ;(el.requestPointerLock as () => void)()
      } catch { /* browser senza pointer lock */ }
    }
  }, [])

  useEffect(() => {
    const onLockChange = () => {
      if (document.pointerLockElement) setLockState('playing')
      else setLockState(s => (s === 'start' ? 'start' : 'paused'))
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

  // riaggancia il mouse cliccando dopo la pausa
  useEffect(() => {
    if (lockState !== 'paused') return
    const el = canvasEl.current
    if (!el) return
    const h = () => requestLock()
    el.addEventListener('click', h)
    return () => el.removeEventListener('click', h)
  }, [lockState, requestLock])

  // fullscreen reale (come i giochi veri)
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      setFsOn(false)
    } else {
      void document.documentElement.requestFullscreen().then(() => setFsOn(true)).catch(() => {})
    }
  }, [])

  // legge il runtime a 10 Hz e aggiorna l'HUD (più il flash rosso)
  useEffect(() => {
    const iv = setInterval(() => {
      const R = rt.current
      if (R.hp <= 0 && !dead) {
        setDead(true)
        if (document.pointerLockElement) document.exitPointerLock()
      }
      const now = performance.now()
      setHud({
        hp: R.hp, maxHp: R.maxHp, stamina: R.stamina, maxStamina: R.maxStamina,
        prompt: R.prompt, progress: R.progress,
        clock: fmtClock(R.clockMin),
        threat: R.threat,
        dmgA: Math.max(0, 1 - (now - R.dmgT) / 650),
        msg: R.msg && now - R.msg.t < 3400 ? R.msg.text : null,
        fps: hud.fps,
      })
    }, 100)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dead])

  // il battito violento quando la creatura ti sta addosso tinge lo schermo
  useEffect(() => () => windRef.current?.stop(), [])

  const restart = () => {
    rt.current = {
      hp: 100, maxHp: 100, stamina: 100, maxStamina: 100,
      clockMin: 23 * 60 + 50,
      prompt: null, progress: 0, dmgT: 0, threat: 0,
      msg: null, savedOnce: false,
    }
    look.current = { yaw: world.spawnYaw, pitch: 0 }
    setDead(false)
    setRunId(n => n + 1)
    setTimeout(() => requestLock(), 50)
  }

  if (!glOK) return <NoGLCard />

  const hpPct = Math.max(0, (hud.hp / hud.maxHp) * 100)
  const stPct = Math.max(0, (hud.stamina / hud.maxStamina) * 100)
  const night = Math.floor(rt.current.clockMin / (24 * 60)) + 1

  return (
    <div className="fixed inset-0 z-[70] bg-black">
      <Canvas
        key={runId}
        shadows
        dpr={[1, 2]}
        camera={{ fov: 70, near: 0.08, far: 420, position: [world.spawn[0], world.spawn[1] + 1.66, world.spawn[2]] }}
        onCreated={({ gl }) => {
          canvasEl.current = gl.domElement
        }}
        onContextMenu={e => e.preventDefault()}
        className="h-full w-full"
      >
        <Suspense fallback={null}>
          <RealEnv env={world.env} />
          <WorldObjects world={world} playMode />
        </Suspense>
        <PlayerRig world={world} rt={rt} lookRef={look} colliders={colliders} />
        {(world.creatures?.length ?? 0) > 0 && (
          <Creatures creatures={world.creatures!} rt={rt} onTags={setTags} />
        )}
        <PostFXView params={{ bloom: world.env.bloom, vignette: world.env.vignette, exposure: world.env.exposure }} />
        <HudSpy onFps={f => setHud(h => ({ ...h, fps: f }))} fpsCount={fpsCount} />
      </Canvas>

      {/* ============ HUD ORRORE ============ */}
      {lockState === 'playing' && !dead && (
        <div className="pointer-events-none absolute inset-0 select-none">
          {/* flash rosso quando vieni colpito */}
          <div
            className="absolute inset-0 transition-opacity duration-150"
            style={{
              opacity: hud.dmgA * 0.55,
              background: 'radial-gradient(ellipse at center, rgba(120,0,0,0) 42%, rgba(150,4,4,0.9) 100%)',
            }}
          />
          {/* oscuramento ai lati quando una creatura ti cerca */}
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{
              opacity: hud.threat * 0.8,
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.75) 100%)',
            }}
          />

          {/* mirino */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-1 w-1 rounded-full bg-white/70 shadow-[0_0_5px_rgba(255,255,255,0.8)]" />
          </div>

          {/* stamina + salute: in basso a sinistra, stile trailer */}
          <div className="absolute bottom-6 left-7 w-56 flex flex-col gap-[5px]">
            <div className="h-[7px] w-full overflow-hidden rounded-sm bg-black/55 ring-1 ring-white/15 backdrop-blur-sm">
              <div
                className="h-full transition-[width] duration-150"
                style={{
                  width: `${stPct}%`,
                  background: 'linear-gradient(90deg, #9aa39c, #e8ede9)',
                }}
              />
            </div>
            <div className="h-[6px] w-full overflow-hidden rounded-sm bg-black/55 ring-1 ring-white/10 backdrop-blur-sm">
              <div
                className="h-full transition-[width] duration-150"
                style={{ width: `${hpPct}%`, background: 'linear-gradient(90deg, #7c1111, #e33)' }}
              />
            </div>
          </div>

          {/* orario della notte: alto a destra */}
          <div className="absolute right-7 top-6 text-right">
            <p className="font-[family-name:var(--font-display)] text-lg font-bold tracking-wide text-white/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
              Notte {night}
            </p>
            <p className="font-mono text-xs text-white/45">{hud.clock} · {hud.fps} fps</p>
          </div>

          {/* prompt [E] + barra di avanzamento: in basso al centro */}
          {hud.prompt && (
            <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
              <p className="rounded-md bg-black/60 px-3 py-1.5 text-sm font-bold tracking-wide text-white/95 backdrop-blur-sm">
                {hud.prompt}
              </p>
              <div className="h-[5px] w-44 overflow-hidden rounded-full bg-black/55 ring-1 ring-white/15">
                <div
                  className="h-full bg-white/90 transition-[width] duration-75"
                  style={{ width: `${hud.progress * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* messaggio (riposo, salvataggio, ecc.) */}
          {hud.msg && (
            <p className="absolute left-1/2 top-16 max-w-md -translate-x-1/2 rounded-md bg-black/65 px-4 py-2 text-center text-sm text-white/90 backdrop-blur-sm">
              {hud.msg}
            </p>
          )}

          {/* NAMETAG delle creature (proiettati dal 3D) */}
          {tags.map(tg => (
            <div
              key={tg.id}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{
                left: tg.x,
                top: tg.y,
                opacity: Math.max(0.25, 1 - tg.d / 42),
              }}
            >
              <span className="rounded bg-black/45 px-1.5 py-0.5 text-xs font-semibold text-white/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {tg.name}
              </span>
            </div>
          ))}

          {/* salvataggio rapido: quasi sempre ci sono */}
          {!rt.current.savedOnce && (
            <p className="absolute bottom-6 right-7 text-[11px] text-white/30">
              Trova il falò per riposarti e salvare
            </p>
          )}
        </div>
      )}

      {/* ============ SCHERMATA DI MORTE ============ */}
      {dead && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85">
          <div className="w-full max-w-sm p-6 text-center">
            <h2 className="text-4xl font-black tracking-[0.25em] text-red-700 drop-shadow-[0_0_24px_rgba(200,0,0,0.55)]">
              SEI MORTO
            </h2>
            <p className="mt-2 text-sm text-white/50">Il bosco non perdona.</p>
            <Button className="mt-6 w-full bg-red-800 font-black text-white hover:bg-red-700" onClick={restart}>
              ↻ Ricomincia la notte
            </Button>
            <Button variant="outline" className="mt-2 w-full border-white/20 bg-transparent text-white/80 hover:bg-white/10" onClick={onExit}>
              ✕ Esci
            </Button>
          </div>
        </div>
      )}

      {/* ============ OVERLAY START ============ */}
      {lockState === 'start' && !dead && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0b0e12]/90 p-6 text-center shadow-2xl">
            <p className="text-[10px] font-bold tracking-[0.3em] text-[var(--neon)]">DARPX ENGINE · GIOCA</p>
            <h2 className="mt-1 text-2xl font-black text-white">{title}</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-left text-xs text-white/60">
              <span className="rounded-md bg-white/5 px-2 py-1.5"><b className="text-white">WASD</b> · muoviti</span>
              <span className="rounded-md bg-white/5 px-2 py-1.5"><b className="text-white">SHIFT</b> · corri (stamina)</span>
              <span className="rounded-md bg-white/5 px-2 py-1.5"><b className="text-white">SPAZIO</b> · salta</span>
              <span className="rounded-md bg-white/5 px-2 py-1.5"><b className="text-white">E</b> · interagisci</span>
              <span className="rounded-md bg-white/5 px-2 py-1.5"><b className="text-white">ESC</b> · pausa</span>
              <button type="button" className="cursor-pointer rounded-md bg-white/5 px-2 py-1.5 text-left hover:bg-white/10" onClick={toggleFs}>
                <b className="text-white">⛶ {fsOn ? 'Riduci' : 'Schermo intero'}</b>
              </button>
            </div>
            <Button
              className="mt-5 w-full bg-[var(--neon)] text-base font-black text-[#04060d]"
              onClick={requestLock}
            >
              🖱 CLICCA PER ENTRARE NEL BOSCO
            </Button>
            <p className="mt-2 text-[10px] text-white/35">
              Il mouse viene catturato come nei giochi veri. ESC lo libera.
              Occhio alle creature: gli occhi bianchi si vedono nella nebbia.
            </p>
          </div>
        </div>
      )}

      {/* ============ PAUSA ============ */}
      {lockState === 'paused' && !dead && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0b0e12]/95 p-5 text-center">
            <p className="text-sm font-bold text-white">⏸ In pausa — mouse libero</p>
            <p className="mt-1 text-xs text-white/40">Notte {night} · {hud.clock}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Button className="bg-[var(--neon)] font-bold text-[#04060d]" onClick={requestLock}>
                ▶ Riprendi
              </Button>
              <Button variant="outline" className="border-white/20 bg-transparent text-white/80 hover:bg-white/10" onClick={onEditor}>
                ✎ Torna all&apos;editor
              </Button>
              <Button variant="outline" className="border-white/20 bg-transparent text-white/80 hover:bg-white/10" onClick={onExit}>
                ✕ Esci dal gioco
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** conta gli FPS per l'HUD */
function HudSpy({
  onFps,
  fpsCount,
}: {
  onFps: (fps: number) => void
  fpsCount: React.MutableRefObject<{ n: number; t: number }>
}) {
  useFrame(() => {
    const c = fpsCount.current
    c.n++
    const now = performance.now()
    if (now - c.t > 1000) {
      onFps(Math.round((c.n * 1000) / (now - c.t)))
      c.t = now
      c.n = 0
    }
  })
  return null
}
