'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useWorld, type SessionUser } from '@/lib/world-store'
import { readStoredTheme } from '@/lib/themes'
import AuthLanding from '@/components/AuthLanding'
import Dashboard from '@/components/Dashboard'
import Editor from '@/components/game/Editor'

export default function Home() {
  const view = useWorld(s => s.view)
  const user = useWorld(s => s.user)
  const setUser = useWorld(s => s.setUser)
  const setView = useWorld(s => s.setView)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    // dev probe for browser-based debugging
    ;(window as unknown as Record<string, unknown>).__useWorld = useWorld

    // applica subito il tema salvato in locale (lo script anti-FOUC
    // nel layout l'ha già fatto: qui teniamo lo store allineato)
    const stored = readStoredTheme()
    useWorld.getState().setAccent(stored, false)

    const check = async () => {
      try {
        const res = await fetch('/api/auth/me')
        const data = await res.json()
        if (data.user) {
          setUser(data.user as SessionUser)
          // il tema dell'account vince su quello locale
          const accountAccent = (data.user as SessionUser).accentColor
          if (accountAccent && accountAccent !== stored) {
            useWorld.getState().setAccent(accountAccent, false)
          }
          setView('dashboard')
        }
      } catch {
        // not logged in
      } finally {
        setBooting(false)
      }
    }
    void check()
  }, [])

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--site-bg)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
          <p className="text-sm font-medium text-stone-500">
            Accendo darpon.m4trix...
          </p>
        </div>
      </div>
    )
  }

  if (view === 'landing' || !user) {
    return <AuthLanding />
  }

  if (view === 'editor') {
    return <Editor />
  }

  return <Dashboard />
}
