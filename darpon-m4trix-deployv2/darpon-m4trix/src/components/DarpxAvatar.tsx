'use client'

// ============================================================
// DARPX AVATAR (v10) — IL SAMURAI GEOMETRICO
// ------------------------------------------------------------
// Il personaggio creato dall'utente diventa la forma fisica
// dell'agente, vivo come i desktop pet:
//   • OCCHI: luccicano, seguono il cursore, fanno saccadi e
//     sbattono le palpebre; ti guardano quando passi col mouse
//   • GLITCH: burst casuali + scatti su evento (fette spostate,
//     doppio fantasma RGB, scanline)
//   • CAMMINA: dondolio e rimbalzo mentre gira per il sito
//   • PENSA: occhi in alto + puntini orbitanti sul cappello
//   • PARLA: bagliore della bocca + barre della voce
//   • FESTEGGIA: scintille d'oro e salti
// Canvas 2D leggero: nessuna libreria 3D, gira ovunque.
// ============================================================

import { useEffect, useRef } from 'react'
import spriteImport from '@/assets/darpx-samurai.png'

export type AvatarMood = 'idle' | 'walk' | 'think' | 'talk' | 'happy' | 'glitch'

// Volto nell'immagine sorgente 512×512 (frazioni misurate sul file)
const EYE_L = { x: 225 / 512, y: 127 / 512 }
const EYE_R = { x: 272 / 512, y: 127 / 512 }
const MOUTH = { x: 245 / 512, y: 152 / 512 }

const SPRITE_SRC =
  typeof spriteImport === 'string'
    ? (spriteImport as unknown as string)
    : ((spriteImport as { src?: string }).src ?? '')

export default function DarpxAvatar({
  mood = 'idle',
  size = 56,
  className,
}: {
  mood?: AvatarMood
  size?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const moodRef = useRef<AvatarMood>(mood)

  useEffect(() => {
    moodRef.current = mood
  }, [mood])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)

    const img = new Image()
    if (SPRITE_SRC) img.src = SPRITE_SRC

    // cursore: posizione normalizzata 0..1 rispetto alla canvas
    const mouse = { x: 0.5, y: 0.3, t: 0 }
    const onMouse = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      if (!r.width || !r.height) return
      mouse.x = (e.clientX - r.left) / r.width
      mouse.y = (e.clientY - r.top) / r.height
      mouse.t = performance.now()
    }
    window.addEventListener('mousemove', onMouse, { passive: true })

    let raf = 0
    let dead = false
    const t0 = performance.now()

    // eventi casuali della vita
    let nextBlinkAt = 2 + Math.random() * 3
    let blinkUntil = -1
    let nextGlitchAt = 4 + Math.random() * 6
    let glitchUntil = -1
    let nextSaccadeAt = 1.5 + Math.random() * 2
    let saccade = { x: 0, y: 0 }

    const loop = (now: number) => {
      if (dead) return
      const t = (now - t0) / 1000
      const m = moodRef.current

      /* ---------- programmazione eventi ---------- */
      if (t >= nextBlinkAt) {
        blinkUntil = t + 0.13
        nextBlinkAt = t + 2.6 + Math.random() * 3.4
      }
      if (t >= nextGlitchAt) {
        glitchUntil = t + 0.22 + Math.random() * 0.26
        nextGlitchAt = t + 5 + Math.random() * 8
      }
      if (t >= nextSaccadeAt) {
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * 0.8
        saccade = { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 }
        nextSaccadeAt = t + 1.6 + Math.random() * 2.8
      }
      const glitching = m === 'glitch' || t < glitchUntil

      /* ---------- movimento del corpo ---------- */
      const walking = m === 'walk'
      const happy = m === 'happy'
      const thinking = m === 'think'
      const talking = m === 'talk'

      const bob = walking
        ? Math.abs(Math.sin(t * 8)) * size * 0.022
        : happy
          ? Math.abs(Math.sin(t * 6)) * size * 0.045
          : Math.sin(t * 1.9) * size * 0.012
      const rock = walking
        ? Math.sin(t * 8) * 0.05
        : thinking
          ? Math.sin(t * 1.2) * 0.02
          : Math.sin(t * 0.8) * 0.012
      const sway = walking ? Math.sin(t * 1.7) * size * 0.02 : Math.sin(t * 0.6) * size * 0.006
      const jitterX = glitching
        ? (Math.sin(Math.floor(t * 22) * 12.9898) % 1) * size * 0.05
        : 0
      const jitterY = glitching
        ? (Math.sin(Math.floor(t * 22) * 78.233) % 1) * size * 0.03
        : 0

      /* ---------- sguardo ---------- */
      const maxOff = size * 0.042
      let gx = saccade.x * maxOff
      let gy = saccade.y * maxOff
      const freshMouse = now - mouse.t < 3500
      if (freshMouse) {
        // segue il cursore (le coordinate volto sono nella metà alta)
        const dx = mouse.x * size - (MOUTH.x * size + sway)
        const dy = mouse.y * size - (EYE_L.y * size + bob)
        const len = Math.max(0.0001, Math.hypot(dx, dy))
        const k = Math.min(1, len / (size * 0.5))
        gx = (dx / len) * maxOff * k
        gy = (dy / len) * maxOff * k
      } else if (thinking) {
        gx = 0
        gy = -maxOff * 0.75 // guarda in alto, pensa
      }

      /* ---------- disegno ---------- */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)

      ctx.save()
      ctx.translate(size / 2 + sway + jitterX, size / 2 + bob + jitterY)
      ctx.rotate(rock)

      const half = size / 2
      if (img.complete && img.naturalWidth) {
        // fantasmi RGB durante il glitch
        if (glitching) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = 0.28
          try {
            ctx.filter = 'hue-rotate(130deg) saturate(2.4)'
          } catch {
            /* Safari vecchi: senza filtro va bene uguale */
          }
          ctx.drawImage(img, -half - size * 0.012, -half, size, size)
          try {
            ctx.filter = 'hue-rotate(-130deg) saturate(2.4)'
          } catch {
            /* idem */
          }
          ctx.drawImage(img, -half + size * 0.012, -half, size, size)
          ctx.filter = 'none'
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        }

        ctx.drawImage(img, -half, -half, size, size)

        // fette spostate (glitch classico)
        if (glitching) {
          const seed = Math.floor(t * 22)
          for (let i = 0; i < 3; i++) {
            const sy =
              ((Math.sin((seed + i * 31) * 41.7) + 1) / 2) * (512 - 512 * 0.12)
            const sh = 512 * (0.05 + ((Math.sin((seed + i * 7) * 17.3) + 1) / 2) * 0.07)
            const off =
              ((Math.sin((seed + i * 13) * 29.1) > 0 ? 1 : -1) *
                (0.03 + ((Math.sin((seed + i) * 11.7) + 1) / 2) * 0.06)) *
              size
            ctx.drawImage(img, 0, sy, 512, sh, -half + off, -half + sy * (size / 512), size, sh * (size / 512))
          }
        }
      }

      /* ---------- occhi vivi ---------- */
      const blinkK = t < blinkUntil ? 0.12 : 1
      const pulse = 1 + Math.sin(t * 6.2) * 0.1
      const boost = happy ? 1.35 : talking ? 1.18 : glitching ? 1.25 : 1
      const eyeR0 = size * 0.052 * pulse * boost

      ctx.globalCompositeOperation = 'lighter'
      for (const EYE of [EYE_L, EYE_R]) {
        const ex = EYE.x * size - half + gx
        const ey = EYE.y * size - half + gy
        ctx.save()
        ctx.translate(ex, ey)
        ctx.scale(1, blinkK)
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, eyeR0)
        grad.addColorStop(0, 'rgba(255,240,190,0.95)')
        grad.addColorStop(0.35, 'rgba(255,214,96,0.55)')
        grad.addColorStop(1, 'rgba(120,255,180,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.ellipse(0, 0, eyeR0, eyeR0 * 0.72, 0, 0, Math.PI * 2)
        ctx.fill()
        // nucleo
        ctx.fillStyle = 'rgba(255,246,205,0.9)'
        ctx.beginPath()
        ctx.ellipse(0, 0, eyeR0 * 0.3, eyeR0 * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      /* ---------- bocca che parla ---------- */
      if (talking) {
        const amp = Math.abs(Math.sin(t * 11) * 0.6 + Math.sin(t * 17.3 + 1) * 0.4)
        const mx = MOUTH.x * size - half
        const my = MOUTH.y * size - half + gy * 0.4
        const mr = size * (0.028 + amp * 0.02)
        const mgrad = ctx.createRadialGradient(mx, my, 0, mx, my, mr)
        mgrad.addColorStop(0, `rgba(255,224,130,${0.5 + amp * 0.4})`)
        mgrad.addColorStop(1, 'rgba(255,180,60,0)')
        ctx.fillStyle = mgrad
        ctx.beginPath()
        ctx.arc(mx, my, mr, 0, Math.PI * 2)
        ctx.fill()

        // barre della voce sotto la bocca
        const bars = 5
        const bw = size * 0.022
        const gap = size * 0.014
        const totalW = bars * bw + (bars - 1) * gap
        let bx = MOUTH.x * size - half - totalW / 2
        const by = size * 0.40
        for (let i = 0; i < bars; i++) {
          const h =
            size * (0.02 + Math.abs(Math.sin(t * 9 + i * 1.7) * Math.sin(t * 4.1 + i)) * 0.05)
          ctx.fillStyle = `rgba(255,214,96,${0.55 + 0.35 * Math.sin(t * 7 + i)})`
          ctx.fillRect(bx, by - h, bw, h)
          bx += bw + gap
        }
      }

      /* ---------- puntini del pensiero ---------- */
      if (thinking) {
        const cx0 = size * 0.16
        const cy0 = size * 0.075
        for (let i = 0; i < 3; i++) {
          const a = t * 2.1 + i * 2.09
          const dx = Math.cos(a) * size * 0.05
          const dy = Math.sin(a * 1.4) * size * 0.02
          ctx.fillStyle = `rgba(255,215,94,${0.55 + 0.35 * Math.sin(t * 5 + i * 2)})`
          ctx.beginPath()
          ctx.arc(cx0 + dx, cy0 + dy, size * 0.011, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      /* ---------- scintille felici ---------- */
      if (happy) {
        for (let i = 0; i < 7; i++) {
          const px = size * (0.18 + (((i * 0.37 + t * 0.05) % 1) * 0.64))
          const py = size * (0.78 - (((t * 0.14 + i * 0.17) % 1) * 0.55))
          const a = 1 - (((t * 0.14 + i * 0.17) % 1))
          const s = size * 0.016 * (0.5 + a)
          ctx.strokeStyle = `rgba(255,225,120,${a * 0.9})`
          ctx.lineWidth = Math.max(1, size * 0.006)
          ctx.beginPath()
          ctx.moveTo(px - s, py)
          ctx.lineTo(px + s, py)
          ctx.moveTo(px, py - s)
          ctx.lineTo(px, py + s)
          ctx.stroke()
        }
      }

      ctx.globalCompositeOperation = 'source-over'

      /* ---------- scanline del glitch ---------- */
      if (glitching) {
        ctx.fillStyle = 'rgba(0,0,0,0.14)'
        for (let y = (Math.floor(t * 30) % 4); y < size; y += 4) {
          ctx.fillRect(-half, -half + y, size, 1)
        }
        ctx.fillStyle = 'rgba(87,224,255,0.08)'
        ctx.fillRect(-half, -half + ((t * 60) % size), size, size * 0.02)
      }

      ctx.restore()
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => {
      dead = true
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMouse)
    }
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, borderRadius: size * 0.22, lineHeight: 0 }}
    />
  )
}
