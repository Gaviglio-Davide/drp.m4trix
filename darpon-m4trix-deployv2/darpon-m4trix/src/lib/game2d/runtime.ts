// ============================================================
// Runtime del Game Studio: far girare il gioco direttamente nel
// browser. Motore 2D top-down con:
//  - movimento WASD/frecce + attacco (Spazio) melee o blaster
//  - nemici con IA (pattuglia → inseguimento → attacco), torrette
//  - oggetti (monete, pozioni, chiavi, casse), porte e transizioni
//  - obiettivi: portale / boss / collezione chiavi
//  - HUD live, dialoghi in pausa, particelle, screen-shake, sfx
// ============================================================

import {
  DIFFICULTY_MULT,
  PALETTES,
  PLAYER_BASE,
  type GameEntity,
  type GameProject,
  type GameScene,
  type Palette,
} from './types'
import { DOOR_TILE, SOLID_TILE, TILE_DAMAGE } from './tiles'
import { drawKind } from './sprites'
import { sfx, unlockAudio } from './sfx'

export type HudState = {
  hp: number
  maxHp: number
  coins: number
  keys: number
  sceneName: string
  objective: string
  msg?: string
}

export type RuntimeCallbacks = {
  onHud: (h: HudState) => void
  onEnd: (result: 'win' | 'lose') => void
  onDialogue: (d: { name: string; pages: string[] } | null) => void
}

type LiveEnemy = {
  e: GameEntity
  x: number
  y: number
  hp: number
  maxHp: number
  dmg: number
  speed: number
  aggro: number
  cd: number
  kbx: number
  kby: number
  wx: number // direzione wander
  wy: number
  wanderT: number
  hurtT: number
  angle: number
  boss: boolean
}

type Projectile = {
  x: number
  y: number
  vx: number
  vy: number
  dmg: number
  from: 'player' | 'enemy'
  ttl: number
  color: string
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  ttl: number
  maxTtl: number
  color: string
  size: number
}

type FloatText = {
  x: number
  y: number
  txt: string
  ttl: number
  color: string
}

export class GameRuntime {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private project: GameProject
  private pal: Palette
  private cbs: RuntimeCallbacks

  private scene: GameScene | null = null
  private items: GameEntity[] = []
  private doors: GameEntity[] = []
  private goal: GameEntity | null = null
  private enemies: LiveEnemy[] = []

  private player = {
    x: 2,
    y: 2,
    hp: 100,
    maxHp: 100,
    coins: 0,
    keys: 0,
    fx: 1,
    fy: 0,
    atkCd: 0,
    invT: 0,
  }

  private projectiles: Projectile[] = []
  private particles: Particle[] = []
  private texts: FloatText[] = []

  private keysDown = new Set<string>()
  private time = 0
  private raf = 0
  private last = 0
  private running = false
  paused = false
  ended = false

  private camX = 0
  private camY = 0
  private shakeT = 0
  private fadeT = 0 // 0→1 dissolvenza a nero
  private fadeCb: (() => void) | null = null
  private msg = ''
  private msgT = 0
  private lastHud = ''
  private hudT = 0
  private stepT = 0
  private lavaTick = 0

  T = 40 // lato tile in px (CSS)

  constructor(
    canvas: HTMLCanvasElement,
    project: GameProject,
    cbs: RuntimeCallbacks
  ) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.project = project
    this.pal = PALETTES[project.settings.paletteId] ?? PALETTES.cyber
    this.cbs = cbs
    this.player.maxHp = project.settings.playerHp
    this.player.hp = project.settings.playerHp
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    canvas.addEventListener('pointerdown', this.onPointer)
  }

  destroy() {
    this.stop()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.canvas.removeEventListener('pointerdown', this.onPointer)
  }

  // ---------- input ----------

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (this.paused || this.ended) return
    this.keysDown.add(e.code)
    if (['Space', 'KeyJ'].includes(e.code)) {
      e.preventDefault()
      this.attack()
    }
    if (e.code === 'KeyE' || e.code === 'Enter') this.interact()
    unlockAudio()
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code)
  }
  private onPointer = () => {
    if (this.paused || this.ended) return
    unlockAudio()
    this.attack()
  }

  /** forza il movimento (usato dal dpad touch) */
  setVirtualKey(code: string, down: boolean) {
    if (down) this.keysDown.add(code)
    else this.keysDown.delete(code)
  }

  // ---------- ciclo di vita ----------

  fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = this.canvas.clientWidth || 800
    const h = this.canvas.clientHeight || 500
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.T = this.scene && this.scene.w > 52 ? 32 : 40
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      if (!this.paused && !this.ended) this.update(dt)
      this.draw()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  restart() {
    this.player.maxHp = this.project.settings.playerHp
    this.player.hp = this.player.maxHp
    this.player.coins = 0
    this.player.keys = 0
    this.ended = false
    this.paused = false
    this.projectiles = []
    this.particles = []
    this.texts = []
    this.loadScene(this.project.startScene)
    const intro = this.project.settings.intro?.filter(Boolean) ?? []
    if (intro.length) {
      this.paused = true
      this.cbs.onDialogue({ name: 'SISTEMA', pages: intro })
    }
  }

  loadScene(id: string, tx?: number, ty?: number) {
    const sc =
      this.project.scenes.find(s => s.id === id) ?? this.project.scenes[0]
    if (!sc) return
    this.scene = sc
    const px = this.player.x
    const py = this.player.y
    // clona entità "live"
    this.enemies = sc.entities
      .filter(e => e.type === 'enemy')
      .map(e => this.makeEnemy(e))
    this.items = sc.entities.filter(e => e.type === 'item').map(e => ({ ...e }))
    this.doors = sc.entities.filter(e => e.type === 'door').map(e => ({ ...e }))
    this.goal = sc.entities.find(e => e.type === 'goal') ?? null
    const p = sc.entities.find(e => e.type === 'player')
    if (tx !== undefined && ty !== undefined) {
      this.player.x = tx + 0.5
      this.player.y = ty + 0.5
    } else if (p) {
      this.player.x = p.x + 0.5
      this.player.y = p.y + 0.5
    } else {
      this.player.x = 1.5
      this.player.y = 1.5
    }
    // spawn SEMPRE praticabile: se un npc/deco solido copre il punto
    // di arrivo, sposta l'eroe sul tile libero più vicino (spirale)
    if (this.decoBlocked(this.player.x, this.player.y)) {
      const sx = Math.floor(this.player.x)
      const sy = Math.floor(this.player.y)
      outer: for (let rad = 1; rad <= 6; rad++)
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
            const fx = sx + dx + 0.5
            const fy = sy + dy + 0.5
            if (!this.boxBlocked(fx, fy, PLAYER_BASE.radius) && !this.decoBlocked(fx, fy)) {
              this.player.x = fx
              this.player.y = fy
              break outer
            }
          }
    }
    void px
    void py
    this.fadeT = 1
    sfx.transition()
    this.fit()
  }

  private makeEnemy(e: GameEntity): LiveEnemy {
    const d = DIFFICULTY_MULT[this.project.settings.difficulty] ?? DIFFICULTY_MULT[2]
    const isBoss = e.props.kind === 'boss'
    const baseHp = e.props.hp ?? (isBoss ? 300 : 60)
    const hp = Math.round(baseHp * (isBoss ? 1 : d.enemyHp))
    return {
      e,
      x: e.x + 0.5,
      y: e.y + 0.5,
      hp,
      maxHp: hp,
      dmg: (e.props.dmg ?? (isBoss ? 26 : 12)) * (isBoss ? 1 : d.enemyDmg),
      speed:
        (e.props.speed ??
          (e.props.kind === 'drone'
            ? 3.2
            : e.props.kind === 'ratto'
              ? 3.6
              : e.props.kind === 'guardiano' || e.props.kind === 'golem'
                ? 1.4
                : 2.2)) * (this.project.settings.enemySpeed ?? 1),
      aggro: (e.props.aggro ?? 5.5) * (isBoss ? 1.4 : d.aggro / 5.5),
      cd: 0,
      kbx: 0,
      kby: 0,
      wx: 0,
      wy: 0,
      wanderT: 0,
      hurtT: 0,
      angle: 0,
      boss: isBoss,
    }
  }

  // ---------- azioni ----------

  attack() {
    if (this.player.atkCd > 0) return
    const s = this.project.settings
    this.player.atkCd = s.weapon === 'blaster' ? 0.42 : 0.3
    if (s.weapon === 'blaster') {
      sfx.shoot()
      const sp = 10
      this.projectiles.push({
        x: this.player.x,
        y: this.player.y,
        vx: this.player.fx * sp,
        vy: this.player.fy * sp,
        dmg: s.playerDmg,
        from: 'player',
        ttl: 1.2,
        color: this.pal.neon,
      })
      this.burst(this.player.x + this.player.fx * 0.4, this.player.y + this.player.fy * 0.4, this.pal.neon, 4, 3)
    } else {
      sfx.attack()
      // arco melee: colpisce entro 1.3 tile e ±65°
      for (const en of this.enemies) {
        const dx = en.x - this.player.x
        const dy = en.y - this.player.y
        const dist = Math.hypot(dx, dy)
        if (dist > 1.35) continue
        const dot = (dx * this.player.fx + dy * this.player.fy) / (dist || 1)
        if (dot < 0.42) continue
        this.hitEnemy(en, s.playerDmg, dx / (dist || 1), dy / (dist || 1))
      }
      // colpisce anche casse
      for (const it of this.items) {
        if (it.props.kind !== 'cassa') continue
        const dx = it.x + 0.5 - this.player.x
        const dy = it.y + 0.5 - this.player.y
        const dist = Math.hypot(dx, dy)
        if (dist > 1.35) continue
        const dot = (dx * this.player.fx + dy * this.player.fy) / (dist || 1)
        if (dot < 0.3) continue
        this.openChest(it)
      }
      // scia visiva
      for (let i = 0; i < 7; i++) {
        const a =
          Math.atan2(this.player.fy, this.player.fx) - 0.7 + (i / 6) * 1.4
        this.particles.push({
          x: this.player.x + Math.cos(a) * 0.8,
          y: this.player.y + Math.sin(a) * 0.8,
          vx: Math.cos(a) * 1.5,
          vy: Math.sin(a) * 1.5,
          ttl: 0.18,
          maxTtl: 0.18,
          color: '#ffffff',
          size: 3,
        })
      }
    }
  }

  interact() {
    // NPC più vicino
    const sc = this.scene
    if (!sc) return
    const npcs = sc.entities.filter(e => e.type === 'npc')
    let best: GameEntity | null = null
    let bd = 1.4
    for (const n of npcs) {
      const d = Math.hypot(n.x + 0.5 - this.player.x, n.y + 0.5 - this.player.y)
      if (d < bd) {
        bd = d
        best = n
      }
    }
    if (best && best.props.pages?.length) {
      this.paused = true
      this.cbs.onDialogue({ name: best.props.name ?? 'NPC', pages: best.props.pages })
    }
  }

  /** chiamato dalla UI quando il dialogo si chiude */
  closeDialogue() {
    this.paused = false
    this.cbs.onDialogue(null)
  }

  // ---------- update ----------

  private solidAt(x: number, y: number): boolean {
    const sc = this.scene
    if (!sc) return true
    const tx = Math.floor(x)
    const ty = Math.floor(y)
    if (tx < 0 || ty < 0 || tx >= sc.w || ty >= sc.h) return true
    const t = sc.tiles[ty * sc.w + tx]
    if (SOLID_TILE(t)) return true
    if (t === 6 && this.player.keys <= 0) return true // porta chiusa senza chiave
    return false
  }

  private boxBlocked(x: number, y: number, r: number): boolean {
    return (
      this.solidAt(x - r, y - r) ||
      this.solidAt(x + r, y - r) ||
      this.solidAt(x - r, y + r) ||
      this.solidAt(x + r, y + r)
    )
  }

  private decoBlocked(x: number, y: number): boolean {
    for (const e of this.scene?.entities ?? []) {
      if (e.type !== 'deco' && e.type !== 'npc') continue
      if (e.type === 'deco' && !e.props.solid) continue
      const d = Math.hypot(e.x + 0.5 - x, e.y + 0.5 - y)
      if (d < 0.55) return true
    }
    return false
  }

  private update(dt: number) {
    this.time += dt
    const s = this.project.settings
    const sc = this.scene
    if (!sc) return

    // ---- input movimento ----
    let mx = 0
    let my = 0
    const K = this.keysDown
    if (K.has('KeyA') || K.has('ArrowLeft')) mx -= 1
    if (K.has('KeyD') || K.has('ArrowRight')) mx += 1
    if (K.has('KeyW') || K.has('ArrowUp')) my -= 1
    if (K.has('KeyS') || K.has('ArrowDown')) my += 1
    const len = Math.hypot(mx, my)
    if (len > 0) {
      mx /= len
      my /= len
      this.player.fx = mx
      this.player.fy = my
      this.stepT -= dt
      if (this.stepT <= 0) {
        this.stepT = 0.26
        sfx.step()
      }
    }
    const spd = PLAYER_BASE.speed * (this.project.settings.playerSpeed ?? 1)
    const nx = this.player.x + mx * spd * dt
    const ny = this.player.y + my * spd * dt
    if (!this.boxBlocked(nx, this.player.y, PLAYER_BASE.radius) && !this.decoBlocked(nx, this.player.y))
      this.player.x = nx
    if (!this.boxBlocked(this.player.x, ny, PLAYER_BASE.radius) && !this.decoBlocked(this.player.x, ny))
      this.player.y = ny

    // ---- tile sotto i piedi ----
    const ct = sc.tiles[Math.floor(this.player.y) * sc.w + Math.floor(this.player.x)]
    const dmg = TILE_DAMAGE(ct)
    if (dmg > 0) {
      this.lavaTick -= dt
      if (this.lavaTick <= 0) {
        this.lavaTick = 0.5
        this.damagePlayer(dmg * 0.5)
        this.burst(this.player.x, this.player.y, this.pal.lavaGlow, 6, 4)
      }
    }
    // porta a chiave (tile 6): entra → consuma chiave e apre
    if (ct === 6 && this.player.keys > 0) {
      this.player.keys--
      sc.tiles[Math.floor(this.player.y) * sc.w + Math.floor(this.player.x)] = 0
      sfx.door()
      this.setMsg('Porta aperta!')
      this.burst(this.player.x, this.player.y, this.pal.doorLocked, 10, 5)
    }

    // ---- attacco cooldown, invulnerabilità ----
    this.player.atkCd = Math.max(0, this.player.atkCd - dt)
    this.player.invT = Math.max(0, this.player.invT - dt)

    // ---- nemici ----
    for (const en of this.enemies) {
      if (en.hp <= 0) continue
      en.hurtT = Math.max(0, en.hurtT - dt)
      en.cd = Math.max(0, en.cd - dt)
      // knockback in attenuazione
      en.x += en.kbx * dt
      en.y += en.kby * dt
      en.kbx *= 0.86
      en.kby *= 0.86

      const dx = this.player.x - en.x
      const dy = this.player.y - en.y
      const dist = Math.hypot(dx, dy)

      if (en.e.props.kind === 'turret') {
        // torretta ferma: punta e spara
        if (dist < en.aggro) {
          en.angle = Math.atan2(dy, dx)
          if (en.cd <= 0) {
            en.cd = 1.5
            const sp = 6.5
            this.projectiles.push({
              x: en.x,
              y: en.y,
              vx: (dx / dist) * sp,
              vy: (dy / dist) * sp,
              dmg: en.dmg,
              from: 'enemy',
              ttl: 2,
              color: '#ff5a5a',
            })
          }
        }
      } else if (dist < en.aggro) {
        // inseguimento
        if (dist > 0.75) {
          const step = (en.speed * dt) / (dist || 1)
          const ex = en.x + dx * step
          const ey = en.y + dy * step
          if (!this.boxBlocked(ex, en.y, 0.3)) en.x = ex
          if (!this.boxBlocked(en.x, ey, 0.3)) en.y = ey
        }
        // attacco a contatto
        if (dist < 0.85 && en.cd <= 0) {
          en.cd = 0.9
          this.damagePlayer(en.dmg)
          this.burst(this.player.x, this.player.y, '#ff5a5a', 6, 4)
        }
      } else {
        // pattuglia: vaga attorno alla casa
        en.wanderT -= dt
        if (en.wanderT <= 0) {
          en.wanderT = 1.5 + Math.random() * 2
          const a = Math.random() * Math.PI * 2
          en.wx = Math.cos(a)
          en.wy = Math.sin(a)
          if (Math.random() < 0.35) {
            en.wx = 0
            en.wy = 0
          }
        }
        const ex = en.x + en.wx * en.speed * 0.5 * dt
        const ey = en.y + en.wy * en.speed * 0.5 * dt
        const homeDx = ex - (en.e.x + 0.5)
        const homeDy = ey - (en.e.y + 0.5)
        if (Math.hypot(homeDx, homeDy) < 2.6 && !this.boxBlocked(ex, ey, 0.3)) {
          en.x = ex
          en.y = ey
        }
      }
    }

    // ---- proiettili ----
    this.projectiles = this.projectiles.filter(p => {
      p.ttl -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.ttl <= 0) return false
      if (this.solidAt(p.x, p.y)) {
        this.burst(p.x, p.y, p.color, 4, 3)
        return false
      }
      if (p.from === 'player') {
        for (const en of this.enemies) {
          if (en.hp <= 0) continue
          if (Math.hypot(en.x - p.x, en.y - p.y) < 0.45) {
            this.hitEnemy(en, p.dmg, Math.sign(p.vx), Math.sign(p.vy))
            return false
          }
        }
        for (const it of this.items) {
          if (it.props.kind !== 'cassa') continue
          if (Math.hypot(it.x + 0.5 - p.x, it.y + 0.5 - p.y) < 0.45) {
            this.openChest(it)
            return false
          }
        }
      } else {
        if (
          this.player.invT <= 0 &&
          Math.hypot(this.player.x - p.x, this.player.y - p.y) < 0.4
        ) {
          this.damagePlayer(p.dmg)
          return false
        }
      }
      return true
    })

    // ---- raccolta oggetti ----
    this.items = this.items.filter(it => {
      const d = Math.hypot(it.x + 0.5 - this.player.x, it.y + 0.5 - this.player.y)
      if (d > 0.5) return true
      switch (it.props.kind) {
        case 'moneta':
          this.player.coins += it.props.amount ?? 1
          sfx.pickup()
          this.float(it.x + 0.5, it.y, `+${it.props.amount ?? 1} ◈`, '#fcee0a')
          return false
        case 'pozione':
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + (it.props.amount ?? 30))
          sfx.heal()
          this.float(it.x + 0.5, it.y, '+HP', '#7cffb2')
          return false
        case 'chiave':
          this.player.keys++
          sfx.pickup()
          this.float(it.x + 0.5, it.y, 'CHIAVE!', '#00f0ff')
          return false
        default:
          return true
      }
    })

    // ---- porte (entità) ----
    for (const d of this.doors) {
      const dd = Math.hypot(d.x + 0.5 - this.player.x, d.y + 0.5 - this.player.y)
      if (dd < 0.55) {
        if (d.props.locked && this.player.keys <= 0) {
          this.setMsg('Serve una chiave!')
          sfx.locked()
          // spinge il player indietro per non re-triggerare
          this.player.x -= (d.x + 0.5 - this.player.x) * 0.6
          this.player.y -= (d.y + 0.5 - this.player.y) * 0.6
        } else {
          if (d.props.locked) this.player.keys--
          if (d.props.targetScene) {
            this.loadScene(d.props.targetScene, d.props.tx, d.props.ty)
          } else {
            this.setMsg('Porta senza destinazione: configurala nell\'editor')
          }
          return
        }
      }
    }

    // ---- obiettivo ----
    if (this.goal) {
      const gd = Math.hypot(this.goal.x + 0.5 - this.player.x, this.goal.y + 0.5 - this.player.y)
      if (gd < 0.6) {
        if (s.objective === 'collezione' && this.player.keys < s.objectiveCount) {
          this.setMsg(`Ti mancano ${s.objectiveCount - this.player.keys} chiavi!`)
          sfx.locked()
          this.player.x -= (this.goal.x + 0.5 - this.player.x) * 0.6
          this.player.y -= (this.goal.y + 0.5 - this.player.y) * 0.6
        } else {
          this.win()
          return
        }
      }
    }

    // ---- particelle / testi ----
    this.particles = this.particles.filter(p => {
      p.ttl -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 1.5 * dt
      return p.ttl > 0
    })
    this.texts = this.texts.filter(t => {
      t.ttl -= dt
      t.y -= dt * 0.8
      return t.ttl > 0
    })

    // ---- camera ----
    const vw = this.canvas.clientWidth
    const vh = this.canvas.clientHeight
    const mw = sc.w * this.T
    const mh = sc.h * this.T
    this.camX = Math.max(0, Math.min(mw - vw, this.player.x * this.T - vw / 2))
    this.camY = Math.max(0, Math.min(mh - vh, this.player.y * this.T - vh / 2))
    if (mw < vw) this.camX = -(vw - mw) / 2
    if (mh < vh) this.camY = -(vh - mh) / 2
    this.shakeT = Math.max(0, this.shakeT - dt)
    this.fadeT = Math.max(0, this.fadeT - dt * 1.6)

    // ---- HUD ----
    this.msgT = Math.max(0, this.msgT - dt)
    this.hudT -= dt
    const hud: HudState = {
      hp: Math.max(0, Math.round(this.player.hp)),
      maxHp: this.player.maxHp,
      coins: this.player.coins,
      keys: this.player.keys,
      sceneName: sc.name,
      objective: this.objectiveText(),
      msg: this.msgT > 0 ? this.msg : undefined,
    }
    const sig = JSON.stringify(hud)
    if (sig !== this.lastHud || this.hudT <= 0) {
      this.lastHud = sig
      this.hudT = 0.15
      this.cbs.onHud(hud)
    }
  }

  private objectiveText(): string {
    const s = this.project.settings
    switch (s.objective) {
      case 'boss':
        return 'Obiettivo: elimina il BOSS'
      case 'collezione':
        return `Obiettivo: trova ${s.objectiveCount} chiavi e torna al portale`
      default:
        return 'Obiettivo: raggiungi il portale'
    }
  }

  private hitEnemy(en: LiveEnemy, dmg: number, kx: number, ky: number) {
    en.hp -= dmg
    en.hurtT = 0.15
    en.kbx += kx * 4.5
    en.kby += ky * 4.5
    sfx.hit()
    this.float(en.x, en.y - 0.4, `${dmg}`, '#ffffff')
    this.burst(en.x, en.y, this.pal.neon, 8, 5)
    if (en.hp <= 0) this.killEnemy(en)
  }

  private killEnemy(en: LiveEnemy) {
    sfx.enemyDie()
    this.burst(en.x, en.y, en.e.props.color ?? '#ff5a5a', 18, 7)
    this.float(en.x, en.y - 0.5, en.boss ? 'BOSS ELIMINATO!' : 'Eliminato', '#ff2bd6')
    // drop
    if (en.boss || Math.random() < 0.45) {
      this.items.push({
        id: 'drop' + Math.random().toString(36).slice(2, 7),
        type: 'item',
        x: Math.floor(en.x),
        y: Math.floor(en.y),
        props: { kind: en.boss ? 'chiave' : Math.random() < 0.6 ? 'moneta' : 'pozione', amount: en.boss ? 5 : 2 },
      })
    }
    if (en.boss && this.project.settings.objective === 'boss') {
      this.win()
    }
  }

  private openChest(it: GameEntity) {
    const coins = it.props.amount ?? 5
    this.player.coins += coins
    sfx.pickup()
    this.float(it.x + 0.5, it.y, `+${coins} ◈`, '#fcee0a')
    this.burst(it.x + 0.5, it.y + 0.5, '#fcee0a', 12, 6)
    this.items = this.items.filter(x => x.id !== it.id)
  }

  private damagePlayer(dmg: number) {
    if (this.player.invT > 0 || this.ended) return
    this.player.hp -= dmg
    this.player.invT = 0.6
    this.shakeT = 0.25
    sfx.hurt()
    if (this.player.hp <= 0) {
      this.player.hp = 0
      this.lose()
    }
  }

  private win() {
    if (this.ended) return
    this.ended = true
    sfx.win()
    this.cbs.onEnd('win')
  }

  private lose() {
    if (this.ended) return
    this.ended = true
    sfx.lose()
    this.cbs.onEnd('lose')
  }

  setMsg(m: string) {
    this.msg = m
    this.msgT = 2.2
  }

  private burst(x: number, y: number, color: string, n: number, spd: number) {
    if (this.particles.length > 320) return
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const v = spd * (0.4 + Math.random())
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        ttl: 0.3 + Math.random() * 0.3,
        maxTtl: 0.6,
        color,
        size: 1.5 + Math.random() * 2.5,
      })
    }
  }

  private float(x: number, y: number, txt: string, color: string) {
    this.texts.push({ x, y, txt, ttl: 1, color })
  }

  // ---------- draw ----------

  private draw() {
    const ctx = this.ctx
    const sc = this.scene
    const vw = this.canvas.clientWidth
    const vh = this.canvas.clientHeight
    if (!sc) {
      ctx.fillStyle = this.pal.bg
      ctx.fillRect(0, 0, vw, vh)
      return
    }
    const T = this.T
    ctx.save()
    // sfarfallio camera-shake
    const sh = this.shakeT > 0 ? this.shakeT * 8 : 0
    const ox = -this.camX + (Math.random() - 0.5) * sh
    const oy = -this.camY + (Math.random() - 0.5) * sh
    ctx.translate(Math.round(ox), Math.round(oy))

    // ---- tile ----
    const x0 = Math.max(0, Math.floor(this.camX / T) - 1)
    const y0 = Math.max(0, Math.floor(this.camY / T) - 1)
    const x1 = Math.min(sc.w, Math.ceil((this.camX + vw) / T) + 1)
    const y1 = Math.min(sc.h, Math.ceil((this.camY + vh) / T) + 1)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const t = sc.tiles[y * sc.w + x]
        const px = x * T
        const py = y * T
        switch (t) {
          case 1: // muro: faccia + cima
            ctx.fillStyle = this.pal.wall
            ctx.fillRect(px, py, T, T)
            ctx.fillStyle = this.pal.wallTop
            ctx.fillRect(px, py, T, T * 0.32)
            break
          case 2: // acqua
            ctx.fillStyle = this.pal.water
            ctx.fillRect(px, py, T, T)
            ctx.strokeStyle = this.pal.waterGlow
            ctx.globalAlpha = 0.25 + Math.sin(this.time * 2 + x + y) * 0.12
            ctx.beginPath()
            ctx.moveTo(px, py + T * 0.5)
            ctx.quadraticCurveTo(px + T * 0.5, py + T * 0.3, px + T, py + T * 0.5)
            ctx.stroke()
            ctx.globalAlpha = 1
            break
          case 3: // lava
            ctx.fillStyle = this.pal.lava
            ctx.fillRect(px, py, T, T)
            ctx.globalAlpha = 0.5 + Math.sin(this.time * 5 + x * 3 + y) * 0.2
            ctx.fillStyle = this.pal.lavaGlow
            ctx.fillRect(px + 2, py + 2, T - 4, T - 4)
            ctx.globalAlpha = 1
            break
          case 4:
            ctx.fillStyle = this.pal.grass
            ctx.fillRect(px, py, T, T)
            break
          case 5:
            ctx.fillStyle = this.pal.road
            ctx.fillRect(px, py, T, T)
            break
          case 6: // porta chiusa
            ctx.fillStyle = this.pal.floor
            ctx.fillRect(px, py, T, T)
            ctx.fillStyle = this.pal.doorLocked
            ctx.fillRect(px + 3, py + 3, T - 6, T - 6)
            ctx.fillStyle = '#04060d'
            ctx.font = `bold ${T * 0.5}px sans-serif`
            ctx.textAlign = 'center'
            ctx.fillText('🔒', px + T / 2, py + T * 0.72)
            break
          case 7: // passaggio
            ctx.fillStyle = this.pal.road
            ctx.fillRect(px, py, T, T)
            ctx.strokeStyle = this.pal.door
            ctx.strokeRect(px + 2, py + 2, T - 4, T - 4)
            break
          case 8:
            ctx.fillStyle = '#000'
            ctx.fillRect(px, py, T, T)
            break
          default: {
            // pavimento a scacchi + dettaglio neon cyber
            ctx.fillStyle = (x + y) % 2 === 0 ? this.pal.floor : this.pal.floorAlt
            ctx.fillRect(px, py, T, T)
            if (this.pal.id === 'cyber' && (x * 7 + y * 13) % 23 === 0) {
              ctx.globalAlpha = 0.35
              ctx.fillStyle = this.pal.neon
              ctx.fillRect(px + T * 0.35, py + T * 0.35, T * 0.3, T * 0.06)
              ctx.globalAlpha = 1
            }
          }
        }
      }
    }

    // ---- griglia leggera ----
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1
    for (let x = x0; x <= x1; x++) {
      ctx.beginPath()
      ctx.moveTo(x * T, y0 * T)
      ctx.lineTo(x * T, y1 * T)
      ctx.stroke()
    }
    for (let y = y0; y <= y1; y++) {
      ctx.beginPath()
      ctx.moveTo(x0 * T, y * T)
      ctx.lineTo(x1 * T, y * T)
      ctx.stroke()
    }

    // ---- drawable con ordinamento per profondità (y) ----
    type D = { y: number; f: () => void }
    const list: D[] = []

    for (const e of sc.entities) {
      if (e.type === 'player') continue
      if (e.type === 'npc' || e.type === 'deco') {
        list.push({
          y: e.y,
          f: () => {
            ctx.save()
            ctx.translate(e.x * T + T / 2, e.y * T + T / 2)
            drawKind(ctx, e.props.kind, T * 0.8, e.props.color ?? this.pal.neon, this.time)
            ctx.restore()
          },
        })
      }
    }
    for (const it of this.items) {
      list.push({
        y: it.y,
        f: () => {
          ctx.save()
          ctx.translate(it.x * T + T / 2, it.y * T + T / 2)
          drawKind(ctx, it.props.kind, T * 0.7, it.props.color ?? '#fcee0a', this.time)
          ctx.restore()
        },
      })
    }
    for (const d of this.doors) {
      list.push({
        y: d.y,
        f: () => {
          const cx = d.x * T + T / 2
          const cy = d.y * T + T / 2
          const col = d.props.locked ? this.pal.doorLocked : this.pal.door
          ctx.save()
          ctx.globalAlpha = 0.25 + Math.sin(this.time * 3) * 0.1
          ctx.fillStyle = col
          ctx.beginPath()
          ctx.ellipse(cx, cy, T * 0.42, T * 0.5, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.strokeStyle = col
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.ellipse(cx, cy, T * 0.3, T * 0.42, 0, 0, Math.PI * 2)
          ctx.stroke()
          if (d.props.locked) {
            ctx.font = `${T * 0.4}px sans-serif`
            ctx.textAlign = 'center'
            ctx.fillText('🔒', cx, cy + T * 0.16)
          }
          ctx.restore()
        },
      })
    }
    if (this.goal) {
      const g = this.goal
      list.push({
        y: g.y,
        f: () => {
          const cx = g.x * T + T / 2
          const cy = g.y * T + T / 2
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(this.time * 1.5)
          ctx.strokeStyle = this.pal.goal
          ctx.shadowColor = this.pal.goal
          ctx.shadowBlur = 16
          ctx.lineWidth = 4
          for (let i = 0; i < 3; i++) {
            ctx.beginPath()
            ctx.ellipse(0, 0, T * (0.18 + i * 0.11), T * (0.34 + i * 0.08), 0, 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.restore()
        },
      })
    }
    for (const en of this.enemies) {
      if (en.hp <= 0) continue
      list.push({
        y: en.y,
        f: () => {
          ctx.save()
          ctx.translate(en.x * T, en.y * T)
          const scale = en.boss ? 1.6 : 1
          drawKind(ctx, en.e.props.kind, T * 0.8 * scale, en.e.props.color ?? '#ff5a5a', this.time, {
            hurt: en.hurtT,
            angle: en.angle,
          })
          ctx.restore()
          // barra vita (attivabile/disattivabile dalle impostazioni)
          if (en.hp < en.maxHp && this.project.settings.showEnemyHp !== false) {
            const bw = T * (en.boss ? 1.1 : 0.7)
            const bx = en.x * T - bw / 2
            const by = en.y * T - T * (en.boss ? 0.75 : 0.5)
            ctx.fillStyle = 'rgba(0,0,0,0.6)'
            ctx.fillRect(bx, by, bw, 4)
            ctx.fillStyle = en.boss ? '#ff2bd6' : '#ff5a5a'
            ctx.fillRect(bx, by, (bw * en.hp) / en.maxHp, 4)
          }
        },
      })
    }
    // player
    list.push({
      y: this.player.y,
      f: () => {
        if (this.player.invT > 0 && Math.floor(this.time * 14) % 2 === 0) return
        ctx.save()
        ctx.translate(this.player.x * T, this.player.y * T)
        const pl = this.project.scenes.find(s => s.id === this.project.startScene)
        const pEnt = pl?.entities.find(e => e.type === 'player')
        const pHere = this.scene?.entities.find(e => e.type === 'player')
        const color = pHere?.props.color ?? pEnt?.props.color ?? this.pal.neon
        const ang = Math.atan2(this.player.fy, this.player.fx)
        ctx.save()
        ctx.rotate(0)
        drawKind(ctx, 'player', T * 0.85, color, this.time, { facing: Math.cos(ang) >= 0 ? 1 : -1 })
        ctx.restore()
        // nome del personaggio principale scelto (v12)
        const nm = this.project.settings.playerModelName
        if (nm) {
          ctx.fillStyle = 'rgba(255,255,255,0.88)'
          ctx.font = `bold ${Math.max(9, Math.round(T * 0.3))}px sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(nm, 0, -T * 0.78)
        }
        // indicatore arma per blaster
        if (this.project.settings.weapon === 'blaster') {
          ctx.rotate(ang)
          ctx.fillStyle = color
          ctx.fillRect(T * 0.18, -2, T * 0.22, 4)
        }
        ctx.restore()
      },
    })
    list.sort((a, b) => a.y - b.y)
    for (const d of list) d.f()

    // proiettili
    for (const p of this.projectiles) {
      ctx.save()
      ctx.shadowColor = p.color
      ctx.shadowBlur = 10
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x * T, p.y * T, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    // particelle
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.ttl / p.maxTtl)
      ctx.fillStyle = p.color
      ctx.fillRect(p.x * T - p.size / 2, p.y * T - p.size / 2, p.size, p.size)
    }
    ctx.globalAlpha = 1
    // testi flottanti
    ctx.textAlign = 'center'
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.ttl * 2)
      ctx.fillStyle = t.color
      ctx.font = `bold ${Math.round(T * 0.32)}px sans-serif`
      ctx.fillText(t.txt, t.x * T, t.y * T)
    }
    ctx.globalAlpha = 1

    ctx.restore()

    // ---- vignetta atmosfera (attivabile dalle impostazioni) ----
    if (this.project.settings.fogOn !== false) {
      const grad = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vh * 0.85)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, this.pal.fog)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, vw, vh)
    }

    // ---- minimappa (se attivata dalle impostazioni) ----
    if (this.project.settings.minimapOn) {
      const s = Math.min(150 / sc.w, 100 / sc.h)
      const mx = vw - sc.w * s - 12
      const my = 12
      ctx.globalAlpha = 0.85
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(mx - 3, my - 3, sc.w * s + 6, sc.h * s + 6)
      for (let y = 0; y < sc.h; y++) {
        for (let x = 0; x < sc.w; x++) {
          const t = sc.tiles[y * sc.w + x]
          if (t === 1) ctx.fillStyle = this.pal.wallTop
          else if (t === 2) ctx.fillStyle = this.pal.waterGlow
          else if (t === 3) ctx.fillStyle = this.pal.lavaGlow
          else if (t === 8) ctx.fillStyle = '#000'
          else continue
          ctx.fillRect(mx + x * s, my + y * s, Math.ceil(s), Math.ceil(s))
        }
      }
      if (this.goal) {
        ctx.fillStyle = '#fcee0a'
        ctx.fillRect(mx + this.goal.x * s - 1, my + this.goal.y * s - 1, Math.max(3, s), Math.max(3, s))
      }
      for (const en of this.enemies) {
        if (en.hp <= 0) continue
        ctx.fillStyle = en.boss ? '#ff2bd6' : '#ff5a5a'
        ctx.fillRect(mx + en.x * s - 1, my + en.y * s - 1, Math.max(2.5, s * 0.8), Math.max(2.5, s * 0.8))
      }
      ctx.fillStyle = '#00f0ff'
      ctx.fillRect(
        mx + this.player.x * s - 1.5,
        my + this.player.y * s - 1.5,
        Math.max(3.5, s),
        Math.max(3.5, s)
      )
      ctx.globalAlpha = 1
    }

    // ---- dissolvenza transizione ----
    if (this.fadeT > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fadeT)})`
      ctx.fillRect(0, 0, vw, vh)
    }
  }
}

/** indicizza le entità porta di ogni scena con coordinate di arrivo di default */
export function doorTargetOrDefault(
  project: GameProject,
  sceneId: string
): GameScene | undefined {
  return project.scenes.find(s => s.id === sceneId)
}
