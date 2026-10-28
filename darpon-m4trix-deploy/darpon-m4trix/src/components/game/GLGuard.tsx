'use client'

import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Protezioni per il canvas 3D:
 * - webglSupported(): true se il browser riesce a creare un contesto WebGL
 * - GLBoundary: error boundary che cattura i crash del renderer 3D
 * - NoGLCard: schermata gentile invece di uno spinner infinito
 */

export function webglSupported(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const c = document.createElement('canvas')
    return !!(
      c.getContext('webgl2') ??
      c.getContext('webgl') ??
      c.getContext('experimental-webgl')
    )
  } catch {
    return false
  }
}

export function NoGLCard() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--site-bg)] p-6">
      <div className="max-w-sm rounded-3xl bg-white/90 p-8 text-center shadow-2xl ring-1 ring-black/5">
        <span className="text-5xl">🧊</span>
        <h2 className="mt-4 text-lg font-black text-stone-800">
          Il 3D non è attivo su questo dispositivo
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          Il tuo browser non riesce ad avviare WebGL (la tecnologia che disegna
          il mondo 3D). Prova a <b>aggiornare il browser</b>, ad attivare
          l&apos;accelerazione hardware nelle impostazioni oppure apri il sito
          su un altro dispositivo.
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Riprova
        </Button>
      </div>
    </div>
  )
}

type BoundaryState = { failed: boolean }

export class GLBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(err: unknown) {
    console.error('[darpon.m4trix] Errore del canvas 3D:', err)
  }

  render() {
    if (this.state.failed) return <NoGLCard />
    return this.props.children
  }
}
