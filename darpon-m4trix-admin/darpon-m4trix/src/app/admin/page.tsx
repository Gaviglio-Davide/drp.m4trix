'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Flame,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Pencil,
  RefreshCw,
  Trash2,
  Type,
  UserRound,
  XCircle,
} from 'lucide-react'
import { SITE_DEFAULTS, SITE_LABELS, type SiteConfig } from '@/lib/site'

// ============================================================
// Pannello Admin — darpon.m4trix
// Gestione utenti, progetti, modelli 3D e testi del sito,
// senza toccare il codice.
// ============================================================

type Stats = {
  counts: { users: number; projects: number; saves: number; siteTexts: number }
  env: {
    databaseUrl: boolean
    authSecret: boolean
    blob: boolean
    adminPasswordCustom: boolean
  }
  dbInfo: string
}

type AdminUser = {
  id: string
  email: string
  name: string | null
  accentColor: string | null
  createdAt: string
  _count: { projects: number }
}

type AdminProject = {
  id: string
  name: string
  updatedAt: string
  createdAt: string
  owner: { email: string; name: string | null }
  saves: number
  stateBytes: number
}

type Asset = {
  url: string
  name: string
  bytes: number
  uploadedAt: string
  store: string
}

const fmtBytes = (n: number) =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function AdminPage() {
  const [checking, setChecking] = useState(true)
  const [admin, setAdmin] = useState(false)
  const [usingDefault, setUsingDefault] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/login')
      const data = await res.json()
      setAdmin(Boolean(data.admin))
      setUsingDefault(Boolean(data.usingDefaultPassword))
    } catch {
      setAdmin(false)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  const login = async () => {
    if (!password) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')
      setAdmin(true)
      setPassword('')
      toast.success('Benvenuto nell\'area admin 🔥')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    await fetch('/api/admin/login', { method: 'DELETE' })
    setAdmin(false)
  }

  if (checking) {
    return (
      <Centered>
        <Loader2 className="h-7 w-7 animate-spin text-[var(--primary)]" />
      </Centered>
    )
  }

  if (!admin) {
    return (
      <Centered>
        <Card className="w-full max-w-sm rounded-3xl border-black/5 bg-white/90 shadow-2xl backdrop-blur">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-[#f2620f] to-[#c2410c] text-white shadow-lg">
              <Flame className="h-7 w-7" />
            </div>
            <CardTitle className="text-center text-xl">Area Admin</CardTitle>
            <p className="text-center text-sm text-stone-500">
              darpon.m4trix — gestione del sito
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="adminpass">Password admin</Label>
              <Input
                id="adminpass"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && login()}
                placeholder="Password"
                autoFocus
              />
            </div>
            <Button disabled={busy} onClick={login}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entra
            </Button>
            <a
              href="/"
              className="text-center text-xs text-stone-400 underline-offset-2 hover:underline"
            >
              ← Torna al sito
            </a>
          </CardContent>
        </Card>
      </Centered>
    )
  }

  return <AdminPanel usingDefault={usingDefault} onLogout={logout} />
}

// ============================================================
// Pannello (dopo il login)
// ============================================================

function AdminPanel({
  usingDefault,
  onLogout,
}: {
  usingDefault: boolean
  onLogout: () => void
}) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [projects, setProjects] = useState<AdminProject[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetStore, setAssetStore] = useState('')
  const [config, setConfig] = useState<SiteConfig>({ ...SITE_DEFAULTS })
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  const loadAll = useCallback(() => {
    return Promise.all([
      fetch('/api/admin/stats').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/projects').then(r => r.json()),
      fetch('/api/admin/assets').then(r => r.json()),
      fetch('/api/admin/site').then(r => r.json()),
    ])
      .then(([s, u, p, a, c]) => {
        setStats(s)
        setUsers(u.users ?? [])
        setProjects(p.projects ?? [])
        setAssets(a.assets ?? [])
        setAssetStore(a.store ?? '')
        if (c.config) setConfig(c.config)
      })
      .catch(() => {
        toast.error('Impossibile caricare i dati')
      })
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const deleteUser = async (u: AdminUser) => {
    if (!window.confirm(`Eliminare ${u.email}? Verranno cancellati anche tutti i suoi progetti.`)) return
    const res = await fetch(`/api/admin/users?id=${u.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Utente eliminato')
      void loadAll()
    } else toast.error('Eliminazione fallita')
  }

  const deleteProject = async (p: AdminProject) => {
    if (!window.confirm(`Eliminare il progetto "${p.name}"?`)) return
    const res = await fetch(`/api/admin/projects?id=${p.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Progetto eliminato')
      void loadAll()
    } else toast.error('Eliminazione fallita')
  }

  const renameProject = async () => {
    if (!renaming?.name.trim()) return
    const res = await fetch('/api/admin/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: renaming.id, name: renaming.name }),
    })
    if (res.ok) {
      toast.success('Progetto rinominato')
      setRenaming(null)
      void loadAll()
    } else toast.error('Rinomina fallita')
  }

  const deleteAsset = async (a: Asset) => {
    if (!window.confirm(`Eliminare il modello "${a.name}"? I progetti che lo usano mostreranno un errore.`)) return
    const res = await fetch(`/api/admin/assets?url=${encodeURIComponent(a.url)}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Modello eliminato')
      void loadAll()
    } else toast.error('Eliminazione fallita')
  }

  const saveSite = async () => {
    const res = await fetch('/api/admin/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (res.ok) toast.success('Testi salvati! Visita la home per vederli 🏰')
    else toast.error('Salvataggio fallito')
  }

  return (
    <div className="min-h-screen bg-[var(--site-bg)] pb-16">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-[var(--site-bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-[#f2620f] to-[#c2410c] text-white shadow-md">
              <Flame className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-black leading-tight tracking-tight text-stone-800">
                darpon.m4trix — Admin
              </p>
              <p className="text-xs text-stone-500">Pannello di gestione del sito</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadAll()}>
              <RefreshCw className="mr-1 h-4 w-4" /> Aggiorna
            </Button>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="mr-1 h-4 w-4" /> Esci
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {usingDefault && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            ⚠️ Stai usando la <b>password admin predefinita</b>. Per sicurezza
            aggiungi su Vercel la variabile d&apos;ambiente{' '}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono">ADMIN_PASSWORD</code>{' '}
            (Settings → Environment Variables) e fai un Redeploy.
          </div>
        )}

        <Tabs defaultValue="stato">
          <TabsList className="mb-4 grid w-full grid-cols-5">
            <TabsTrigger value="stato">Stato</TabsTrigger>
            <TabsTrigger value="utenti">Utenti</TabsTrigger>
            <TabsTrigger value="progetti">Progetti</TabsTrigger>
            <TabsTrigger value="modelli">Modelli 3D</TabsTrigger>
            <TabsTrigger value="testi">Testi del sito</TabsTrigger>
          </TabsList>

          {/* ---------------- STATO ---------------- */}
          <TabsContent value="stato" className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={<UserRound className="h-4 w-4" />} label="Utenti" value={stats?.counts.users} />
              <StatCard icon={<Pencil className="h-4 w-4" />} label="Progetti" value={stats?.counts.projects} />
              <StatCard icon={<RefreshCw className="h-4 w-4" />} label="Salvataggi" value={stats?.counts.saves} />
              <StatCard icon={<ImageIcon className="h-4 w-4" />} label="Modelli 3D" value={assets.length} />
            </div>

            <Card className="rounded-2xl border-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Diagnostica del deploy</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                <Check ok={stats?.env.databaseUrl} label="DATABASE_URL impostata" hint="Su Vercel: Storage → Postgres → Connect Project (Passo 4 della guida)." />
                <Check ok={stats?.env.authSecret} label="AUTH_SECRET impostata" hint="Su Vercel: Settings → Environment Variables (Passo 6 della guida)." />
                <Check ok={stats?.env.blob} label="Vercel Blob attivo (modelli 3D)" hint="Su Vercel: Storage → Blob → Connect Project (Passo 5 della guida)." />
                <Check ok={stats?.env.adminPasswordCustom} label="ADMIN_PASSWORD personalizzata" hint="Consigliata: Settings → Environment Variables → ADMIN_PASSWORD." warning />
                <Check ok={stats?.counts.users !== undefined} label="Database connesso e tabelle pronte" hint={stats?.dbInfo} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- UTENTI ---------------- */}
          <TabsContent value="utenti" className="flex flex-col gap-3">
            {users.length === 0 && <Empty text="Nessun utente registrato" />}
            {users.map(u => (
              <Card key={u.id} className="flex items-center justify-between gap-3 rounded-2xl border-black/5 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-800">
                    {u.name || <i className="text-stone-400">senza nome</i>}
                    <span className="ml-2 font-normal text-stone-500">{u.email}</span>
                  </p>
                  <p className="text-xs text-stone-400">
                    {u._count.projects} progetti · registrato il {fmtDate(u.createdAt)}
                    {u.accentColor ? ` · tema: ${u.accentColor}` : ''}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteUser(u)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </TabsContent>

          {/* ---------------- PROGETTI ---------------- */}
          <TabsContent value="progetti" className="flex flex-col gap-3">
            {projects.length === 0 && <Empty text="Nessun progetto" />}
            {projects.map(p => (
              <Card key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border-black/5 p-4">
                <div className="min-w-0">
                  {renaming?.id === p.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={renaming.name}
                        onChange={e => setRenaming({ id: p.id, name: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && renameProject()}
                        className="h-8 w-56"
                        autoFocus
                      />
                      <Button size="sm" onClick={renameProject}>Salva</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Annulla</Button>
                    </div>
                  ) : (
                    <p className="truncate text-sm font-semibold text-stone-800">{p.name}</p>
                  )}
                  <p className="text-xs text-stone-400">
                    di {p.owner.name || p.owner.email} · {p.saves} salvataggi · {fmtBytes(p.stateBytes)} ·
                    aggiornato {fmtDate(p.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setRenaming({ id: p.id, name: p.name })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteProject(p)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* ---------------- MODELLI 3D ---------------- */}
          <TabsContent value="modelli" className="flex flex-col gap-3">
            <p className="text-xs text-stone-400">
              Archivio: {assetStore === 'blob' ? 'Vercel Blob (produzione)' : 'public/uploads (locale)'}
            </p>
            {assets.length === 0 && <Empty text="Nessun modello caricato" />}
            {assets.map(a => (
              <Card key={a.url} className="flex items-center justify-between gap-3 rounded-2xl border-black/5 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-800">{a.name}</p>
                  <p className="truncate text-xs text-stone-400">
                    {fmtBytes(a.bytes)} · {fmtDate(a.uploadedAt)} · {a.url}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteAsset(a)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </TabsContent>

          {/* ---------------- TESTI DEL SITO ---------------- */}
          <TabsContent value="testi" className="flex flex-col gap-4">
            <Card className="rounded-2xl border-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Type className="h-4 w-4" /> Testi mostrati nella home
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {(Object.keys(SITE_DEFAULTS) as (keyof SiteConfig)[]).map(k => (
                  <div key={k} className="flex flex-col gap-1.5">
                    <Label htmlFor={`site-${k}`}>{SITE_LABELS[k]}</Label>
                    {k === 'intro' ? (
                      <textarea
                        id={`site-${k}`}
                        value={config[k]}
                        onChange={e => setConfig({ ...config, [k]: e.target.value })}
                        rows={3}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      />
                    ) : (
                      <Input id={`site-${k}`} value={config[k]} onChange={e => setConfig({ ...config, [k]: e.target.value })} />
                    )}
                  </div>
                ))}
                <Button onClick={saveSite} className="self-start">Salva i testi</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-8 text-center">
          <a href="/" className="inline-flex items-center gap-1 text-sm text-stone-400 underline-offset-2 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Torna al sito
          </a>
        </div>
      </main>
    </div>
  )
}

// ============================================================
// Piccoli componenti
// ============================================================

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--site-bg)] p-4">
      {children}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-black/5 bg-white/85 p-4 shadow-sm"
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-400">
        {icon} {label}
      </div>
      <p className="mt-1 text-2xl font-black text-stone-800">
        {value === undefined ? <Loader2 className="h-5 w-5 animate-spin text-stone-300" /> : value}
      </p>
    </motion.div>
  )
}

function Check({
  ok,
  label,
  hint,
  warning,
}: {
  ok?: boolean
  label: string
  hint?: string
  warning?: boolean
}) {
  if (ok === undefined) return null
  return (
    <div className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-green-600" />
      ) : (
        <XCircle className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${warning ? 'text-amber-500' : 'text-red-500'}`} />
      )}
      <div className="min-w-0">
        <p className={`text-sm font-medium ${ok ? 'text-stone-700' : warning ? 'text-amber-700' : 'text-red-600'}`}>
          {label}
        </p>
        {!ok && hint && <p className="text-xs text-stone-500">{hint}</p>}
        {ok && warning && hint && <p className="text-xs text-stone-400">{hint}</p>}
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-stone-400">
      {text}
    </div>
  )
}
