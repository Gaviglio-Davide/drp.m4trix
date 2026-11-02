'use client'

// ============================================================
// GAME PLAYER — fa girare un gioco del Game Studio a schermo
// intero: HUD neon, dialoghi, dpad touch, vittoria/sconfitta.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { GameRuntime, type HudState } from '@/lib/game2d/runtime'
import type { GameProject } from '@/lib/game2d/types'
import { unlockAudio } from '@/lib/game2d/sfx'

type Props = {
  project: GameProject
  onExit: () => void
  onEdit?: () => void
}

export default function GamePlayer({ project, onExit, onEdit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<GameRuntime | null>(null)
  const [hud, setHud] = useState<HudState>({
    hp: project.settings.playerHp,
    maxHp: project.settings.playerHp,
    coins: 0,
    keys: 0,
    sceneName: '',
    objective: '',
  })
  const [dialogue, setDialogue] = useState<{ name: string; pages: string[] } | null>(null)
  const [page, setPage] = useState(0)
  const [end, setEnd] = useState<'win' | 'lose' | null>(null)
  const [runId, setRunId] = useState(0) // rimonta il runtime per ricominciare

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rt = new GameRuntime(canvas, project, {
      onHud: setHud,
      onDialogue: d => {
        setDialogue(d)
        setPage(0)
      },
      onEnd: r => setEnd(r),
    })
    runtimeRef.current = rt
    rt.restart()
    rt.start()
    const ro = new ResizeObserver(() => rt.fit())
    ro.observe(canvas)
    return () => {
      ro.disconnect()
      rt.destroy()
      runtimeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  // tastiera per i dialoghi
  useEffect(() => {
    if (!dialogue) return
    const onKey = (e: KeyboardEvent) => {
      if (['Space', 'Enter', 'KeyE'].includes(e.code)) {
        e.preventDefault()
        advance()
      }
      if (e.code === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogue, page])

  const advance = () => {
    if (!dialogue) return
    if (page < dialogue.pages.length - 1) setPage(p => p + 1)
    else close()
  }
  const close = () => {
    setDialogue(null)
    runtimeRef.current?.closeDialogue()
  }

  const hpPct = Math.max(0, (hud.hp / hud.maxHp) * 100)

  const vkey = (code: string, down: boolean) => {
    runtimeRef.current?.setVirtualKey(code, down)
    unlockAudio()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--site-bg)]">
      {/* barra superiore */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="neon-text truncate font-[family-name:var(--font-display)] text-sm font-bold tracking-widest uppercase">
            {project.title}
          </span>
          <span className="cp-chip hidden sm:inline-block">{hud.sceneName}</span>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button size="sm" variant="outline" onClick={onEdit} className="cp-btn">
              ✎ Editor
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onExit} className="cp-btn">
            ✕ Esci
          </Button>
        </div>
      </div>

      {/* HUD */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[var(--tx-dim)]">HP</span>
          <div className="h-2.5 w-36 overflow-hidden rounded-sm bg-black/60 ring-1 ring-[var(--line)]">
            <div
              className="h-full transition-all"
              style={{
                width: `${hpPct}%`,
                background:
                  hpPct > 50
                    ? 'linear-gradient(90deg,#00ff9c,#7cffb2)'
                    : hpPct > 25
                      ? 'linear-gradient(90deg,#fcee0a,#ffb43a)'
                      : 'linear-gradient(90deg,#ff3355,#ff7a7a)',
                boxShadow: '0 0 8px rgba(255,255,255,0.35)',
              }}
            />
          </div>
          <span className="text-[var(--tx)]">
            {hud.hp}/{hud.maxHp}
          </span>
        </div>
        <span className="text-[#fcee0a]">◈ {hud.coins}</span>
        <span className="text-[var(--neon)]">🔑 {hud.keys}</span>
        <span className="hidden text-[var(--tx-dim)] md:inline">{hud.objective}</span>
      </div>

      {/* canvas */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ imageRendering: 'auto' }}
        />

        {/* messaggio flottante */}
        {hud.msg && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
            <div className="cp-panel cp-panel-neon px-4 py-2 text-sm text-[var(--tx)]">
              {hud.msg}
            </div>
          </div>
        )}

        {/* dialogo */}
        {dialogue && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
            <div
              className="cp-panel cp-panel-neon w-full max-w-2xl cursor-pointer p-4"
              onClick={advance}
            >
              <div className="neon-text mb-1 font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.2em] uppercase">
                ▸ {dialogue.name}
              </div>
              <p className="min-h-12 text-[15px] leading-relaxed text-[var(--tx)]">
                {dialogue.pages[page]}
              </p>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--tx-faint)]">
                <span>
                  {page + 1}/{dialogue.pages.length} — [E] o click per continuare
                </span>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    close()
                  }}
                  className="cp-chip hover:text-[var(--neon)]"
                >
                  chiudi ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* fine partita */}
        {end && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="cp-panel cp-panel-neon flex flex-col items-center gap-4 px-10 py-8 text-center">
              {end === 'win' ? (
                <>
                  <div className="neon-text font-[family-name:var(--font-display)] text-4xl font-black tracking-widest">
                    VITTORIA
                  </div>
                  <p className="text-sm text-[var(--tx-dim)]">
                    Obiettivo completato con ◈ {hud.coins} monete raccolte.
                  </p>
                </>
              ) : (
                <>
                  <div className="neon-text-2 font-[family-name:var(--font-display)] text-4xl font-black tracking-widest">
                    GAME OVER
                  </div>
                  <p className="text-sm text-[var(--tx-dim)]">
                    Il tuo eroe è caduto... ma nel cyber-spazio nessuno resta
                    morto a lungo.
                  </p>
                </>
              )}
              <div className="flex gap-2">
                <Button className="cp-btn" onClick={() => { setEnd(null); setRunId(i => i + 1) }}>
                  ↻ Ricomincia
                </Button>
                <Button variant="outline" className="cp-btn" onClick={onExit}>
                  Esci
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* dpad touch (solo mobile) */}
        <div className="absolute bottom-4 left-4 grid grid-cols-3 gap-1 md:hidden">
          <span />
          <button
            className="h-12 w-12 bg-[var(--panel)] text-lg text-[var(--neon)] ring-1 ring-[var(--line)]"
            onTouchStart={() => vkey('KeyW', true)}
            onTouchEnd={() => vkey('KeyW', false)}
          >
            ▲
          </button>
          <span />
          <button
            className="h-12 w-12 bg-[var(--panel)] text-lg text-[var(--neon)] ring-1 ring-[var(--line)]"
            onTouchStart={() => vkey('KeyA', true)}
            onTouchEnd={() => vkey('KeyA', false)}
          >
            ◀
          </button>
          <button
            className="h-12 w-12 bg-[var(--panel)] text-lg text-[var(--neon)] ring-1 ring-[var(--line)]"
            onTouchStart={() => vkey('KeyS', true)}
            onTouchEnd={() => vkey('KeyS', false)}
          >
            ▼
          </button>
          <button
            className="h-12 w-12 bg-[var(--panel)] text-lg text-[var(--neon)] ring-1 ring-[var(--line)]"
            onTouchStart={() => vkey('KeyD', true)}
            onTouchEnd={() => vkey('KeyD', false)}
          >
            ▶
          </button>
        </div>
        <button
          className="absolute right-4 bottom-4 h-16 w-16 rounded-full bg-[var(--neon)] font-black text-[#04060d] shadow-[var(--glow)] md:hidden"
          onTouchStart={() => {
            unlockAudio()
            runtimeRef.current?.attack()
          }}
        >
          ATK
        </button>
      </div>

      {/* hint comandi */}
      <div className="hidden justify-center gap-6 border-t border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[11px] tracking-wider text-[var(--tx-faint)] md:flex">
        <span>
          <b className="text-[var(--neon)]">WASD / frecce</b> muovi
        </span>
        <span>
          <b className="text-[var(--neon)]">SPAZIO</b> attacca
        </span>
        <span>
          <b className="text-[var(--neon)]">E</b> interagisci
        </span>
        <span>
          <b className="text-[var(--neon)]">click</b> attacca col mouse
        </span>
      </div>
    </div>
  )
}
