'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Check, KeyRound, Loader2, Settings, UserRound } from 'lucide-react'
import { useWorld } from '@/lib/world-store'
import { THEMES } from '@/lib/themes'
import { fetchAuth } from '@/lib/http'

/**
 * Ingranaggio profilo: cambia nome, password e colore del sito.
 * Riutilizzabile: passa <ProfileDialog><button .../></ProfileDialog>
 * oppure usa il pulsante ingranaggio integrato.
 */
export default function ProfileDialog({
  children,
  iconOnly = false,
}: {
  children?: React.ReactNode
  iconOnly?: boolean
}) {
  const user = useWorld(s => s.user)
  const setUser = useWorld(s => s.setUser)
  const accent = useWorld(s => s.accent)
  const setAccent = useWorld(s => s.setAccent)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => {
    if (user) setName(user.name ?? '')
  }, [user, open])

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Il nome non può essere vuoto')
      return
    }
    setSavingName(true)
    try {
      const res = await fetchAuth('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')
      setUser({ ...user!, name: data.user.name })
      toast.success('Nome aggiornato! ✨')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSavingName(false)
    }
  }

  const savePassword = async () => {
    if (newPw.length < 6) {
      toast.error('La nuova password deve avere almeno 6 caratteri')
      return
    }
    if (newPw !== confirmPw) {
      toast.error('Le due password nuove non coincidono')
      return
    }
    setSavingPw(true)
    try {
      const res = await fetchAuth('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      toast.success('Password aggiornata! 🔒')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button
            variant="ghost"
            size={iconOnly ? 'icon' : 'sm'}
            title="Profilo e impostazioni"
            aria-label="Profilo e impostazioni"
          >
            <Settings
              className={`${iconOnly ? 'h-5 w-5' : 'h-4 w-4'} ${
                open ? 'rotate-90' : ''
              } transition-transform duration-300`}
            />
            {!iconOnly && <span className="ml-1">Profilo</span>}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Il tuo profilo</DialogTitle>
          <DialogDescription>
            Nome, password e il colore del tuo darpon.m4trix.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profilo">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profilo">
              <UserRound className="mr-1 inline h-3.5 w-3.5" /> Profilo
            </TabsTrigger>
            <TabsTrigger value="password">
              <KeyRound className="mr-1 inline h-3.5 w-3.5" /> Password
            </TabsTrigger>
            <TabsTrigger value="aspetto">🎨 Colori</TabsTrigger>
          </TabsList>

          {/* ----- PROFILO ----- */}
          <TabsContent value="profilo" className="mt-3 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pf-email">Email</Label>
              <Input id="pf-email" value={user?.email ?? ''} disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pf-name">Nome visualizzato</Label>
              <div className="flex gap-2">
                <Input
                  id="pf-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Il tuo nome"
                  maxLength={40}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                />
                <Button onClick={saveName} disabled={savingName}>
                  {savingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Salva'
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ----- PASSWORD ----- */}
          <TabsContent value="password" className="mt-3 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pw-current">Password attuale</Label>
              <Input
                id="pw-current"
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pw-new">Nuova password</Label>
              <Input
                id="pw-new"
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Almeno 6 caratteri"
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pw-confirm">Ripeti nuova password</Label>
              <Input
                id="pw-confirm"
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                onKeyDown={e => e.key === 'Enter' && savePassword()}
              />
            </div>
            <Button onClick={savePassword} disabled={savingPw}>
              {savingPw && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cambia password
            </Button>
          </TabsContent>

          {/* ----- ASPETTO / COLORI ----- */}
          <TabsContent value="aspetto" className="mt-3">
            <p className="mb-3 text-sm text-muted-foreground">
              Scegli il colore del sito: bottoni, sfondi e accenti cambiano
              subito. La scelta viene salvata nel tuo account.
            </p>
            <div className="grid grid-cols-8 gap-2">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  title={t.name}
                  aria-label={`Colore ${t.name}`}
                  onClick={() => setAccent(t.id)}
                  className={`group relative flex aspect-square items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-white transition-transform hover:scale-110 ${
                    accent === t.id
                      ? 'ring-stone-700'
                      : 'ring-transparent'
                  }`}
                  style={{ backgroundColor: t.primary }}
                >
                  {accent === t.id && (
                    <Check className="h-4 w-4 text-white drop-shadow" />
                  )}
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs font-medium text-stone-500">
              Tema attivo:{' '}
              <b className="text-[var(--primary-strong)]">
                {THEMES.find(t => t.id === accent)?.name ?? 'Bosco'}
              </b>
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
