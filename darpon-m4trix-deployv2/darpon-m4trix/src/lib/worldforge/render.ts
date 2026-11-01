// ============================================================
// WORLD FORGE — pittura su canvas: mappa del mondo, città in
// stile Watabou (edifici, piazza, mura, fiume), dungeon e
// caverne.
// ============================================================

import { B, type CityMap, type Site, type Settlement, type World } from './world'

export const BIOME_STYLE: Record<number, { base: string; deep?: string }> = {
  [B.DEEP]: { base: '#2c5a86', deep: '#254e77' },
  [B.WATER]: { base: '#4a7fa8', deep: '#41749b' },
  [B.SAND]: { base: '#d8c48e', deep: '#cfba82' },
  [B.GRASS]: { base: '#a8c08a', deep: '#9db47f' },
  [B.FOREST]: { base: '#6f9463', deep: '#65895a' },
  [B.HILL]: { base: '#b3a67e', deep: '#a99c74' },
  [B.MOUNTAIN]: { base: '#8f8a80', deep: '#847f75' },
  [B.SNOW]: { base: '#e8eef2', deep: '#dde5ea' },
  [B.ROAD]: { base: '#cbb98f', deep: '#c2b086' },
}

function hash2s(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const INK = '#2b2620'

/** Disegna l'intera mappa del mondo. cell = px per tile. */
export function paintWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  cell: number,
  opts?: { selectedId?: string | null; hover?: { x: number; y: number } | null; brush?: number }
) {
  const { w, h } = world.params
  ctx.fillStyle = BIOME_STYLE[B.DEEP].base
  ctx.fillRect(0, 0, w * cell, h * cell)

  // tile biomi con variazione
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const b = world.biome[y * w + x]
      const st = BIOME_STYLE[b] ?? BIOME_STYLE[B.GRASS]
      ctx.fillStyle = hash2s(world.params.seed, x, y) < 0.5 ? st.base : (st.deep ?? st.base)
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }

  // contorni costa
  ctx.strokeStyle = 'rgba(20,40,60,0.35)'
  ctx.lineWidth = 1
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const b = world.biome[y * w + x]
      if (b !== B.WATER && b !== B.DEEP) continue
      const up = world.biome[(y - 1) * w + x]
      const down = world.biome[(y + 1) * w + x]
      const left = world.biome[y * w + x - 1]
      const right = world.biome[y * w + x + 1]
      const land = (v: number) => v !== B.WATER && v !== B.DEEP
      ctx.beginPath()
      if (land(up)) {
        ctx.moveTo(x * cell, y * cell + 0.5)
        ctx.lineTo((x + 1) * cell, y * cell + 0.5)
      }
      if (land(down)) {
        ctx.moveTo(x * cell, (y + 1) * cell - 0.5)
        ctx.lineTo((x + 1) * cell, (y + 1) * cell - 0.5)
      }
      if (land(left)) {
        ctx.moveTo(x * cell + 0.5, y * cell)
        ctx.lineTo(x * cell + 0.5, (y + 1) * cell)
      }
      if (land(right)) {
        ctx.moveTo((x + 1) * cell - 0.5, y * cell)
        ctx.lineTo((x + 1) * cell - 0.5, (y + 1) * cell)
      }
      ctx.stroke()
    }

  // ombra montagne
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const b = world.biome[y * w + x]
      if (b === B.MOUNTAIN || b === B.SNOW) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.beginPath()
        ctx.moveTo(x * cell + cell * 0.15, (y + 1) * cell - cell * 0.15)
        ctx.lineTo(x * cell + cell * 0.5, y * cell + cell * 0.2)
        ctx.lineTo(x * cell + cell * 0.85, (y + 1) * cell - cell * 0.15)
        ctx.closePath()
        ctx.fill()
        if (b === B.SNOW) {
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.moveTo(x * cell + cell * 0.38, y * cell + cell * 0.42)
          ctx.lineTo(x * cell + cell * 0.5, y * cell + cell * 0.2)
          ctx.lineTo(x * cell + cell * 0.62, y * cell + cell * 0.42)
          ctx.closePath()
          ctx.fill()
        }
      }
      if (b === B.FOREST) {
        ctx.fillStyle = 'rgba(30,50,25,0.5)'
        const n = 2
        for (let i = 0; i < n; i++) {
          const px = x * cell + ((i * 37 + 13) % cell)
          const py = y * cell + ((i * 53 + 7) % cell)
          ctx.fillRect(px, py, Math.max(1.5, cell * 0.18), Math.max(1.5, cell * 0.18))
        }
      }
    }

  // insediamenti
  ctx.textAlign = 'center'
  for (const s of world.settlements) {
    const px = s.x * cell + cell / 2
    const py = s.y * cell + cell / 2
    const R = (s.kind === 'city' ? 7 + s.size * 2.4 : 6) * Math.max(0.7, cell / 8)
    // mura
    if (s.kind === 'city') {
      ctx.fillStyle = '#c9b790'
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.roundRect(px - R, py - R * 0.8, R * 2, R * 1.6, 4)
      ctx.fill()
      ctx.stroke()
    }
    // edifici (campionati dalla mappa della città)
    const bl = s.map.buildings
    const n = Math.min(bl.length, s.kind === 'city' ? 16 + s.size * 6 : 8)
    ctx.fillStyle = INK
    for (let i = 0; i < n; i++) {
      const b0 = bl[Math.floor((i * bl.length) / n)]
      const bx = px + (b0.x / s.map.extent) * R * 0.85
      const by = py + (b0.y / s.map.extent) * R * 0.7
      ctx.fillRect(bx, by, Math.max(1.4, (b0.w / s.map.extent) * R * 0.85), Math.max(1.4, (b0.h / s.map.extent) * R * 0.7))
    }
    // piazza
    ctx.fillStyle = s.kind === 'city' ? '#8f7a4e' : '#7c6a45'
    ctx.beginPath()
    ctx.arc(px, py, Math.max(1.6, R * 0.14), 0, Math.PI * 2)
    ctx.fill()

    // selezione
    if (opts?.selectedId === s.id) {
      ctx.strokeStyle = '#00f0ff'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.strokeRect(px - R - 3, py - R * 0.8 - 3, R * 2 + 6, R * 1.6 + 6)
      ctx.setLineDash([])
    }

    // etichetta
    ctx.font = `bold ${Math.max(8, cell * 1.15)}px monospace`
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(240,234,214,0.9)'
    ctx.strokeText(s.name, px, py + R * 0.8 + 10)
    ctx.fillStyle = INK
    ctx.fillText(s.name, px, py + R * 0.8 + 10)
  }

  // siti (dungeon / caverne)
  for (const site of world.sites) {
    const px = site.x * cell + cell / 2
    const py = site.y * cell + cell / 2
    ctx.font = `${Math.max(9, cell * 1.5)}px sans-serif`
    ctx.fillText(site.kind === 'dungeon' ? '🚪' : '🕳', px, py + cell * 0.4)
    if (opts?.selectedId === site.id) {
      ctx.strokeStyle = '#ff2bd6'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.strokeRect(px - cell, py - cell, cell * 2, cell * 2)
      ctx.setLineDash([])
    }
    ctx.font = `bold ${Math.max(7, cell * 0.95)}px monospace`
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(240,234,214,0.9)'
    ctx.strokeText(site.name, px, py + cell * 1.6)
    ctx.fillStyle = INK
    ctx.fillText(site.name, px, py + cell * 1.6)
  }

  // brush hover
  if (opts?.hover && opts.brush) {
    ctx.strokeStyle = '#00f0ff'
    ctx.lineWidth = 1.5
    ctx.strokeRect(
      opts.hover.x * cell - (opts.brush - 1) * cell * 0.5,
      opts.hover.y * cell - (opts.brush - 1) * cell * 0.5,
      cell * opts.brush,
      cell * opts.brush
    )
  }
}

/** Città grande in stile Watabou. scale = px per unità. */
export function paintCity(ctx: CanvasRenderingContext2D, s: Settlement, scale: number) {
  const m: CityMap = s.map
  const half = m.extent + 6
  const W = Math.ceil(half * 2 * scale)
  ctx.fillStyle = '#d8cba8'
  ctx.fillRect(0, 0, W, W)
  const cx = W / 2
  const cy = W / 2
  const X = (u: number) => cx + u * scale
  const Y = (u: number) => cy + u * scale

  // fiume
  if (m.river) {
    ctx.strokeStyle = '#4a7fa8'
    ctx.lineWidth = 5 * scale * 0.35
    ctx.beginPath()
    ctx.moveTo(0, Y(Math.sin(1.2) * m.extent * 0.4))
    for (let u = -half; u <= half; u += 2) {
      ctx.lineTo(X(u), Y(Math.sin(u / (m.extent / 3) + s.seed % 7) * m.extent * 0.42))
    }
    ctx.stroke()
  }

  // mura
  if (m.wall) {
    ctx.strokeStyle = INK
    ctx.lineWidth = 2.6 * scale * 0.4
    ctx.beginPath()
    ctx.roundRect(X(m.wall.x), Y(m.wall.y), m.wall.w * scale, m.wall.h * scale, 6 * scale * 0.5)
    ctx.stroke()
    // porte N S E O
    ctx.clearRect?.(0, 0, 0, 0)
    ctx.fillStyle = '#d8cba8'
    const gt = 3.4 * scale * 0.5
    ctx.fillRect(cx - gt, Y(m.wall.y) - 1, gt * 2, 4)
    ctx.fillRect(cx - gt, Y(m.wall.y + m.wall.h) - 3, gt * 2, 4)
    ctx.fillRect(X(m.wall.x) - 1, cy - gt, 4, gt * 2)
    ctx.fillRect(X(m.wall.x + m.wall.w) - 3, cy - gt, 4, gt * 2)
  }

  // piazza con fonte
  ctx.fillStyle = '#c2b086'
  ctx.beginPath()
  ctx.roundRect(X(m.plaza.x), Y(m.plaza.y), m.plaza.w * scale, m.plaza.h * scale, 2)
  ctx.fill()
  ctx.fillStyle = '#4a7fa8'
  ctx.beginPath()
  ctx.arc(cx, cy, 1.6 * scale, 0, Math.PI * 2)
  ctx.fill()

  // edifici con tetto
  for (const b of m.buildings) {
    ctx.fillStyle = '#8a7a5c'
    ctx.fillRect(X(b.x), Y(b.y), Math.max(2, b.w * scale), Math.max(2, b.h * scale))
    ctx.fillStyle = INK
    ctx.fillRect(X(b.x), Y(b.y), Math.max(2, b.w * scale), Math.max(1, b.h * scale * 0.32))
  }
}

/** Anteprima dungeon / caverna. cell = px. */
export function paintSite(ctx: CanvasRenderingContext2D, site: Site, cell: number) {
  const W = site.w * cell
  const H = site.h * cell
  ctx.fillStyle = '#0e0c14'
  ctx.fillRect(0, 0, W, H)
  for (let y = 0; y < site.h; y++)
    for (let x = 0; x < site.w; x++) {
      const v = site.grid[y * site.w + x]
      if (v === 1) continue
      ctx.fillStyle = v === 3 ? '#3a6a8a' : site.kind === 'cave' ? '#9a8f78' : '#c9bb96'
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  // muri con contorno
  ctx.fillStyle = '#332e26'
  for (let y = 0; y < site.h; y++)
    for (let x = 0; x < site.w; x++) {
      if (site.grid[y * site.w + x] !== 1) continue
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
}
