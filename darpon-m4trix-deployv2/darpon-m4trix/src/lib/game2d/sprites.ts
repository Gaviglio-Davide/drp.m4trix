// ============================================================
// Sprite procedurali del Game Studio: ogni entità è disegnata
// su canvas con primitive (niente asset esterni), con piccole
// animazioni (bob, rotazione, pulsazione neon).
// ============================================================

import type { EntityKind } from './types'

type Ctx = CanvasRenderingContext2D

function glow(ctx: Ctx, color: string, blur = 12) {
  ctx.shadowColor = color
  ctx.shadowBlur = blur
}
function noGlow(ctx: Ctx) {
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

function rrect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

/** ombra a terra comune */
function shadow(ctx: Ctx, s: number) {
  ctx.globalAlpha = 0.35
  circle(ctx, 0, s * 0.42, s * 0.34, '#000')
  ctx.globalAlpha = 1
}

/**
 * Disegna un'entità centrata in (0,0). s = lato approssimativo in px.
 * t = tempo in secondi per le animazioni.
 */
export function drawKind(
  ctx: Ctx,
  kind: EntityKind | undefined,
  s: number,
  color: string,
  t: number,
  opts?: { facing?: number; hurt?: number; angle?: number; name?: string }
) {
  const bob = Math.sin(t * 4) * s * 0.04
  const hurt = opts?.hurt && opts.hurt > 0
  if (hurt) ctx.globalAlpha = 0.55
  ctx.save()
  shadow(ctx, s)
  switch (kind) {
    case 'player': {
      ctx.translate(0, bob)
      // corpo
      glow(ctx, color, 10)
      rrect(ctx, -s * 0.24, -s * 0.3, s * 0.48, s * 0.62, s * 0.16, '#12182a')
      noGlow(ctx)
      // visiera neon
      const f = opts?.facing ?? 1
      rrect(ctx, f === 1 ? -s * 0.16 : -s * 0.3, -s * 0.22, s * 0.46, s * 0.14, s * 0.07, color)
      // pettorale
      rrect(ctx, -s * 0.16, 0, s * 0.32, s * 0.22, s * 0.05, color)
      ctx.globalAlpha = 0.35
      rrect(ctx, -s * 0.16, 0, s * 0.32, s * 0.22, s * 0.05, '#000')
      ctx.globalAlpha = 1
      // gambe
      rrect(ctx, -s * 0.18, s * 0.26, s * 0.13, s * 0.16, 2, '#0a0e1a')
      rrect(ctx, s * 0.05, s * 0.26, s * 0.13, s * 0.16, 2, '#0a0e1a')
      break
    }
    case 'npc': {
      ctx.translate(0, bob)
      rrect(ctx, -s * 0.22, -s * 0.3, s * 0.44, s * 0.6, s * 0.14, '#182036')
      noGlow(ctx)
      circle(ctx, 0, -s * 0.32, s * 0.16, color) // testa
      rrect(ctx, -s * 0.2, -s * 0.12, s * 0.4, s * 0.1, 3, color) // fascia
      // punti interrogativi di aiuto
      ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.3
      ctx.fillStyle = color
      ctx.font = `bold ${Math.round(s * 0.4)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('!', 0, -s * 0.55)
      ctx.globalAlpha = 1
      break
    }
    case 'drone': {
      ctx.translate(0, Math.sin(t * 6) * s * 0.08)
      ctx.rotate(Math.sin(t * 2) * 0.08)
      glow(ctx, color, 12)
      // rombo
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.34)
      ctx.lineTo(s * 0.28, 0)
      ctx.lineTo(0, s * 0.34)
      ctx.lineTo(-s * 0.28, 0)
      ctx.closePath()
      ctx.fillStyle = '#141c30'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
      circle(ctx, 0, 0, s * 0.1, color)
      noGlow(ctx)
      // eliche
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.beginPath()
      ctx.moveTo(-s * 0.38, -s * 0.18)
      ctx.lineTo(-s * 0.18, -s * 0.18)
      ctx.moveTo(s * 0.18, -s * 0.18)
      ctx.lineTo(s * 0.38, -s * 0.18)
      ctx.stroke()
      break
    }
    case 'soldato': {
      ctx.translate(0, bob)
      rrect(ctx, -s * 0.24, -s * 0.28, s * 0.48, s * 0.56, s * 0.1, '#26202c')
      circle(ctx, 0, -s * 0.34, s * 0.15, color)
      rrect(ctx, -s * 0.3, -s * 0.2, s * 0.12, s * 0.3, 3, '#1a1622') // scudo braccio
      // spada
      const sw = Math.sin(t * 3) * 0.3
      ctx.save()
      ctx.rotate(sw)
      rrect(ctx, s * 0.22, -s * 0.4, s * 0.07, s * 0.5, 2, '#cfd6e6')
      ctx.restore()
      break
    }
    case 'zombie': {
      ctx.translate(0, bob * 1.4)
      ctx.rotate(Math.sin(t * 2.4) * 0.12)
      rrect(ctx, -s * 0.22, -s * 0.24, s * 0.44, s * 0.52, s * 0.12, '#22301f')
      circle(ctx, -s * 0.05, -s * 0.32, s * 0.15, color)
      circle(ctx, -s * 0.1, -s * 0.34, s * 0.03, '#ff3355')
      circle(ctx, s * 0.02, -s * 0.34, s * 0.03, '#ff3355')
      // braccia in avanti
      rrect(ctx, s * 0.1, -s * 0.12, s * 0.32, s * 0.09, 4, '#22301f')
      break
    }
    case 'slime': {
      const wob = 1 + Math.sin(t * 7) * 0.12
      glow(ctx, color, 8)
      ctx.save()
      ctx.scale(wob, 2 - wob)
      circle(ctx, 0, s * 0.12, s * 0.3, color)
      ctx.restore()
      noGlow(ctx)
      circle(ctx, -s * 0.09, s * 0.04, s * 0.035, '#04060d')
      circle(ctx, s * 0.09, s * 0.04, s * 0.035, '#04060d')
      break
    }
    case 'guardiano': {
      ctx.translate(0, bob * 0.5)
      rrect(ctx, -s * 0.3, -s * 0.34, s * 0.6, s * 0.66, s * 0.12, '#2a2438')
      glow(ctx, color, 8)
      rrect(ctx, -s * 0.3, -s * 0.34, s * 0.6, s * 0.1, 4, color)
      noGlow(ctx)
      circle(ctx, 0, -s * 0.38, s * 0.13, '#141020')
      circle(ctx, 0, -s * 0.38, s * 0.06, color)
      rrect(ctx, -s * 0.36, -s * 0.1, s * 0.14, s * 0.42, 4, '#1a1626') // torre scudo
      break
    }
    case 'golem': {
      ctx.translate(0, bob * 0.4)
      ctx.fillStyle = '#3a3230'
      rrect(ctx, -s * 0.34, -s * 0.3, s * 0.68, s * 0.6, s * 0.14, '#3a3230')
      rrect(ctx, -s * 0.4, -s * 0.16, s * 0.16, s * 0.34, 4, '#2e2826')
      rrect(ctx, s * 0.24, -s * 0.16, s * 0.16, s * 0.34, 4, '#2e2826')
      glow(ctx, color, 8)
      circle(ctx, -s * 0.12, -s * 0.14, s * 0.05, color)
      circle(ctx, s * 0.12, -s * 0.14, s * 0.05, color)
      rrect(ctx, -s * 0.14, s * 0.02, s * 0.28, s * 0.07, 3, color)
      noGlow(ctx)
      break
    }
    case 'turret': {
      circle(ctx, 0, s * 0.1, s * 0.3, '#1c2234')
      ctx.save()
      ctx.rotate(opts?.angle ?? 0)
      glow(ctx, color, 8)
      rrect(ctx, -s * 0.06, -s * 0.42, s * 0.12, s * 0.4, 3, color)
      noGlow(ctx)
      circle(ctx, 0, -s * 0.06, s * 0.16, '#26304a')
      circle(ctx, 0, -s * 0.06, s * 0.07, color)
      ctx.restore()
      break
    }
    case 'ratto': {
      ctx.translate(0, bob)
      circle(ctx, 0, s * 0.08, s * 0.2, '#3c3040')
      circle(ctx, s * 0.16, s * 0.04, s * 0.12, '#3c3040')
      circle(ctx, s * 0.2, s * 0.02, s * 0.025, '#ff5a5a')
      ctx.strokeStyle = '#3c3040'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-s * 0.18, s * 0.1)
      ctx.quadraticCurveTo(-s * 0.34, s * 0.05 + Math.sin(t * 9) * s * 0.06, -s * 0.4, s * 0.16)
      ctx.stroke()
      break
    }
    case 'boss': {
      ctx.translate(0, bob * 0.6)
      const pulse = 1 + Math.sin(t * 3) * 0.04
      ctx.save()
      ctx.scale(pulse, pulse)
      rrect(ctx, -s * 0.36, -s * 0.36, s * 0.72, s * 0.7, s * 0.16, '#1c1026')
      glow(ctx, color, 16)
      rrect(ctx, -s * 0.36, -s * 0.36, s * 0.72, s * 0.12, 5, color)
      noGlow(ctx)
      // corona spunte
      ctx.fillStyle = color
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath()
        ctx.moveTo(i * s * 0.2 - s * 0.06, -s * 0.36)
        ctx.lineTo(i * s * 0.2, -s * 0.52)
        ctx.lineTo(i * s * 0.2 + s * 0.06, -s * 0.36)
        ctx.closePath()
        ctx.fill()
      }
      circle(ctx, -s * 0.13, -s * 0.12, s * 0.06, '#ff3355')
      circle(ctx, s * 0.13, -s * 0.12, s * 0.06, '#ff3355')
      ctx.restore()
      break
    }
    case 'moneta': {
      const w = Math.abs(Math.cos(t * 4)) * s * 0.24 + s * 0.04
      glow(ctx, '#fcee0a', 8)
      ctx.beginPath()
      ctx.ellipse(0, 0, w, s * 0.24, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#fcee0a'
      ctx.fill()
      noGlow(ctx)
      break
    }
    case 'pozione': {
      rrect(ctx, -s * 0.1, -s * 0.34, s * 0.2, s * 0.12, 2, '#8892a8') // tappo
      glow(ctx, color, 10)
      ctx.beginPath()
      ctx.moveTo(-s * 0.14, -s * 0.22)
      ctx.lineTo(s * 0.14, -s * 0.22)
      ctx.lineTo(s * 0.2, s * 0.18)
      ctx.arc(0, s * 0.18, s * 0.2, 0, Math.PI, false)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
      noGlow(ctx)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      circle(ctx, -s * 0.06, s * 0.12, s * 0.035, 'rgba(255,255,255,0.6)')
      break
    }
    case 'chiave': {
      ctx.rotate(Math.sin(t * 2) * 0.2)
      glow(ctx, color, 10)
      ctx.strokeStyle = color
      ctx.lineWidth = s * 0.08
      ctx.beginPath()
      ctx.arc(-s * 0.12, 0, s * 0.12, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(s * 0.3, 0)
      ctx.moveTo(s * 0.2, 0)
      ctx.lineTo(s * 0.2, s * 0.12)
      ctx.moveTo(s * 0.3, 0)
      ctx.lineTo(s * 0.3, s * 0.14)
      ctx.stroke()
      noGlow(ctx)
      break
    }
    case 'cassa': {
      rrect(ctx, -s * 0.28, -s * 0.2, s * 0.56, s * 0.4, 3, '#4e3a1e')
      rrect(ctx, -s * 0.28, -s * 0.2, s * 0.56, s * 0.12, 3, '#6e542c')
      rrect(ctx, -s * 0.05, -s * 0.08, s * 0.1, s * 0.16, 2, '#fcee0a')
      break
    }
    case 'albero': {
      rrect(ctx, -s * 0.06, s * 0.05, s * 0.12, s * 0.36, 2, '#3a2a1a')
      circle(ctx, 0, -s * 0.12, s * 0.3, '#14301c')
      circle(ctx, -s * 0.14, -s * 0.02, s * 0.2, '#163822')
      circle(ctx, s * 0.14, -s * 0.02, s * 0.2, '#163822')
      circle(ctx, 0, -s * 0.3, s * 0.18, '#1a4028')
      break
    }
    case 'barile': {
      rrect(ctx, -s * 0.2, -s * 0.28, s * 0.4, s * 0.56, 5, '#35404e')
      rrect(ctx, -s * 0.2, -s * 0.14, s * 0.4, s * 0.06, 1, '#202833')
      rrect(ctx, -s * 0.2, s * 0.08, s * 0.4, s * 0.06, 1, '#202833')
      break
    }
    case 'neon': {
      glow(ctx, color, 14)
      rrect(ctx, -s * 0.3, -s * 0.3, s * 0.6, s * 0.5, 4, '#0a0e1a')
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(-s * 0.22, -s * 0.22, s * 0.44, s * 0.34)
      ctx.fillStyle = color
      ctx.font = `bold ${Math.round(s * 0.22)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('雲', 0, 0)
      noGlow(ctx)
      rrect(ctx, -s * 0.04, s * 0.2, s * 0.08, s * 0.3, 2, '#202833')
      break
    }
    case 'lanterna': {
      rrect(ctx, -s * 0.03, -s * 0.1, s * 0.06, s * 0.55, 2, '#202833')
      const p = 0.5 + Math.sin(t * 5) * 0.2
      ctx.globalAlpha = 0.25 * p
      circle(ctx, 0, -s * 0.16, s * 0.4, color)
      ctx.globalAlpha = 1
      glow(ctx, color, 12)
      circle(ctx, 0, -s * 0.16, s * 0.1, color)
      noGlow(ctx)
      break
    }
    default: {
      circle(ctx, 0, 0, s * 0.25, color)
    }
  }
  ctx.restore()
  noGlow(ctx)
  if (hurt) ctx.globalAlpha = 1
}
