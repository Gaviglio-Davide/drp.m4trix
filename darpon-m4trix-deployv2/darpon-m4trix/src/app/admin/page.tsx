'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  CheckCircle2,
  Database,
  Eye,
  Flame,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Type,
  UserRound,
  XCircle,
} from 'lucide-react'
import GLBViewer from '@/components/GLBViewer'
import {
  SITE_DEFAULTS,
  SITE_LABELS,
  SECTION_DEFS,
  DEFAULT_SECTION_SUBTITLES,
  DEFAULT_PARAGRAPHS,
  type SiteConfig,
  type HomeParagraph,
  type SectionConfig,
} from '@/lib/site'

// ============================================================
// Pannello Admin — darpon.m4trix (aggiornamento .4)
// Gestione utenti (rinomina + password), progetti, modelli 3D
// con ANTEPRIMA, chiavi globali dei motori 3D con TEST,
// Agente AI, testi della home, reparti on/off e banner annunci:
// tutto modificabile da qui, senza toccare il codice.
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
  _count: { projects: number; modelAssets: number }
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

type AdminProvider = {
  id: string
  label: string
  icon: string
  keyUrl: string
  keyHint: string
  note: string
  supportsText: boolean
  supportsImage: boolean
  siteKey: boolean
  envKey: boolean
}

type AIConfigState = {
  baseUrl: string
  model: string
  hasKey: boolean
  keyPreview: string
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
  const [paragraphs, setParagraphs] = useState<HomeParagraph[]>(DEFAULT_PARAGRAPHS)
  const [sections, setSections] = useState<Record<string, SectionConfig>>({})
  const [announcement, setAnnouncement] = useState({ text: '', enabled: false })
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  // utenti: modifica inline
  const [userEdit, setUserEdit] = useState<{
    id: string
    name: string
    password: string
  } | null>(null)

  // chiavi 3D
  const [providers, setProviders] = useState<AdminProvider[]>([])
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({})
  const [savingProvider, setSavingProvider] = useState<string | null>(null)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, string>>({})

  // agente AI
  const [ai, setAi] = useState<AIConfigState | null>(null)
  const [aiForm, setAiForm] = useState({ baseUrl: '', model: '', apiKey: '' })
  const [savingAi, setSavingAi] = useState(false)
  const [zaiEnv, setZaiEnv] = useState(false)

  // anteprima modelli
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')

  const loadAll = useCallback(() => {
    return Promise.all([
      fetch('/api/admin/stats').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/projects').then(r => r.json()),
      fetch('/api/admin/assets').then(r => r.json()),
      fetch('/api/admin/site').then(r => r.json()),
      fetch('/api/admin/providers').then(r => r.json()),
      fetch('/api/admin/ai').then(r => r.json()),
    ])
      .then(([s, u, p, a, c, pr, aiData]) => {
        setStats(s)
        setUsers(u.users ?? [])
        setProjects(p.projects ?? [])
        setAssets(a.assets ?? [])
        setAssetStore(a.store ?? '')
        if (c.config) setConfig(c.config)
        if (Array.isArray(c.paragraphs)) setParagraphs(c.paragraphs)
        if (c.sections) setSections(c.sections)
        if (c.announcement) setAnnouncement(c.announcement)
        setProviders(pr.providers ?? [])
        if (aiData.ai) {
          setAi(aiData.ai)
          setAiForm({
            baseUrl: aiData.ai.baseUrl ?? '',
            model: aiData.ai.model ?? '',
            apiKey: '',
          })
        }
        setZaiEnv(Boolean(aiData.zaiEnv))
      })
      .catch(() => {
        toast.error('Impossibile caricare i dati')
      })
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // ---------------- azioni utenti ----------------

  const deleteUser = async (u: AdminUser) => {
    if (!window.confirm(`Eliminare ${u.email}? Verranno cancellati anche tutti i suoi progetti.`)) return
    const res = await fetch(`/api/admin/users?id=${u.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Utente eliminato')
      void loadAll()
    } else toast.error('Eliminazione fallita')
  }

  const saveUserEdit = async () => {
    if (!userEdit) return
    const body: { id: string; name?: string; password?: string } = { id: userEdit.id }
    if (userEdit.name.trim() !== '') body.name = userEdit.name.trim()
    if (userEdit.password !== '') body.password = userEdit.password
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      toast.success('Utente aggiornato ✅')
      setUserEdit(null)
      void loadAll()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Aggiornamento fallito')
    }
  }

  // ---------------- azioni progetti ----------------

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

  // ---------------- azioni modelli ----------------

  const deleteAsset = async (a: Asset) => {
    if (!window.confirm(`Eliminare il modello "${a.name}"? I progetti che lo usano mostreranno un errore.`)) return
    const res = await fetch(`/api/admin/assets?url=${encodeURIComponent(a.url)}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Modello eliminato')
      void loadAll()
    } else toast.error('Eliminazione fallita')
  }

  // ---------------- contenuti del sito ----------------

  const saveSite = async () => {
    const res = await fetch('/api/admin/site', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, paragraphs, sections, announcement }),
    })
    if (res.ok) toast.success('Contenuti salvati! Visita la home per vederli 🏰')
    else toast.error('Salvataggio fallito')
  }

  const addParagraph = () => {
    setParagraphs(ps => [
      ...ps,
      {
        id: `p-${Date.now().toString(36)}`,
        title: 'Nuovo paragrafo',
        text: 'Scrivi qui il testo che vuoi mostrare nella home.',
      },
    ])
  }

  const moveParagraph = (idx: number, dir: -1 | 1) => {
    setParagraphs(ps => {
      const next = [...ps]
      const j = idx + dir
      if (j < 0 || j >= next.length) return ps
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  const updateParagraph = (idx: number, patch: Partial<HomeParagraph>) => {
    setParagraphs(ps => ps.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const removeParagraph = (idx: number) => {
    setParagraphs(ps => ps.filter((_, i) => i !== idx))
  }

  const updateSection = (key: string, patch: Partial<SectionConfig>) => {
    setSections(ss => ({
      ...ss,
      [key]: {
        title: ss[key]?.title ?? SECTION_DEFS.find(d => d.key === key)?.defaultTitle ?? key,
        subtitle: ss[key]?.subtitle ?? '',
        enabled: ss[key]?.enabled ?? true,
        ...patch,
      },
    }))
  }

  // ---------------- chiavi 3D globali ----------------

  const saveProviderKey = async (p: AdminProvider, keyToUse?: string) => {
    const k = (keyToUse ?? providerKeys[p.id] ?? '').trim()
    if (!k && !p.siteKey) return
    setSavingProvider(p.id)
    try {
      const res = await fetch('/api/admin/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: p.id, key: k }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Salvataggio fallito')
      setProviderKeys(prev => ({ ...prev, [p.id]: '' }))
      await loadAll()
      toast.success(k ? `Chiave ${p.label} salvata (vale per TUTTI gli utenti) 🔐` : `Chiave ${p.label} rimossa`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore salvataggio')
    } finally {
      setSavingProvider(null)
    }
  }

  const testProvider = async (p: AdminProvider) => {
    setTestingProvider(p.id)
    setTestResults(prev => ({ ...prev, [p.id]: '…' }))
    try {
      const res = await fetch('/api/admin/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: p.id, key: (providerKeys[p.id] ?? '').trim() || undefined }),
      })
      const data = (await res.json()) as { ok?: boolean; message?: string }
      setTestResults(prev => ({ ...prev, [p.id]: data.message ?? 'Nessuna risposta' }))
    } catch {
      setTestResults(prev => ({ ...prev, [p.id]: 'Test non riuscito (rete)' }))
    } finally {
      setTestingProvider(null)
    }
  }

  // ---------------- agente AI ----------------

  const saveAI = async () => {
    setSavingAi(true)
    try {
      const res = await fetch('/api/admin/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: aiForm.baseUrl,
          model: aiForm.model,
          ...(aiForm.apiKey.trim() ? { apiKey: aiForm.apiKey.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Salvataggio fallito')
      setAiForm(f => ({ ...f, apiKey: '' }))
      await loadAll()
      toast.success('Agente AI configurato! 🤖')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore salvataggio')
    } finally {
      setSavingAi(false)
    }
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
          <TabsList className="mb-4 grid w-full grid-cols-4 sm:grid-cols-7">
            <TabsTrigger value="stato">Stato</TabsTrigger>
            <TabsTrigger value="utenti">Utenti</TabsTrigger>
            <TabsTrigger value="progetti">Progetti</TabsTrigger>
            <TabsTrigger value="modelli">Modelli</TabsTrigger>
            <TabsTrigger value="chiavi">Chiavi 3D</TabsTrigger>
            <TabsTrigger value="agente">Agente AI</TabsTrigger>
            <TabsTrigger value="contenuti">Contenuti</TabsTrigger>
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
                <Check
                  ok={providers.some(p => p.siteKey || p.envKey)}
                  label="Almeno un motore 3D globale attivo"
                  hint="Senza chiavi globali, ogni utente deve aggiungere la propria chiave in Darpx.ai (vedi tab «Chiavi 3D»)."
                  warning
                />
                <Check
                  ok={Boolean(zaiEnv || ai?.hasKey)}
                  label="Agente AI potenziato attivo"
                  hint="Senza una chiave AI l'Agente Darpx risponde comunque col cervello locale istantaneo (vedi tab «Agente AI»)."
                  warning
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- UTENTI ---------------- */}
          <TabsContent value="utenti" className="flex flex-col gap-3">
            <p className="text-xs text-stone-400">
              Puoi rinominare gli utenti, cambiare la loro password (reset) o
              eliminarli con tutti i loro progetti.
            </p>
            {users.length === 0 && <Empty text="Nessun utente registrato" />}
            {users.map(u => (
              <Card key={u.id} className="rounded-2xl border-black/5 p-4">
                {userEdit?.id === u.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">
                        {u.email}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        value={userEdit.name}
                        onChange={e => setUserEdit({ ...userEdit, name: e.target.value })}
                        placeholder={`Nome (attuale: ${u.name || 'senza nome'})`}
                        className="h-9 w-56"
                      />
                      <Input
                        type="password"
                        value={userEdit.password}
                        onChange={e => setUserEdit({ ...userEdit, password: e.target.value })}
                        placeholder="Nuova password (opzionale)"
                        className="h-9 w-56"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void saveUserEdit()}>Salva</Button>
                      <Button size="sm" variant="ghost" onClick={() => setUserEdit(null)}>Annulla</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-800">
                        {u.name || <i className="text-stone-400">senza nome</i>}
                        <span className="ml-2 font-normal text-stone-500">{u.email}</span>
                      </p>
                      <p className="text-xs text-stone-400">
                        {u._count.projects} progetti · {u._count.modelAssets} modelli · registrato il {fmtDate(u.createdAt)}
                        {u.accentColor ? ` · tema: ${u.accentColor}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setUserEdit({ id: u.id, name: u.name ?? '', password: '' })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteUser(u)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
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
              Archivio: {assetStore === 'blob' ? 'Vercel Blob (produzione)' : 'public/uploads (locale)'} ·
              con l&apos;occhio 👁️ apri l&apos;anteprima 3D di ogni modello
            </p>
            {assets.length === 0 && <Empty text="Nessun modello caricato" />}
            {assets.map(a => (
              <Card key={a.url} className="flex items-center justify-between gap-3 rounded-2xl border-black/5 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-800">{a.name}</p>
                  <p className="truncate text-xs text-stone-400">
                    {fmtBytes(a.bytes)} · {fmtDate(a.uploadedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    title="Anteprima 3D"
                    onClick={() => {
                      setPreviewUrl(a.url)
                      setPreviewName(a.name)
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => deleteAsset(a)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* ---------------- CHIAVI 3D (GLOBALI) ---------------- */}
          <TabsContent value="chiavi" className="flex flex-col gap-3">
            <Card className="rounded-2xl border-black/5 bg-gradient-to-br from-white to-stone-50">
              <CardContent className="p-4">
                <p className="text-sm text-stone-600">
                  Le chiavi che imposti qui sono <b>globali</b>: valgono per
                  TUTTI gli utenti del sito, che potranno generare modelli 3D
                  da Darpx.ai senza chiavi personali. Vengono salvate{' '}
                  <b>cifrate</b> nel database. Con più chiavi impostate, se un
                  motore si blocca il sito passa automaticamente al successivo.
                </p>
              </CardContent>
            </Card>
            {providers.map(p => (
              <Card key={p.id} className="rounded-2xl border-black/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xl">{p.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-stone-800">{p.label}</p>
                      <p className="text-[11px] text-stone-400">{p.note}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      p.siteKey
                        ? 'bg-emerald-100 text-emerald-700'
                        : p.envKey
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-stone-200 text-stone-500'
                    }`}
                  >
                    {p.siteKey ? '✅ chiave globale attiva' : p.envKey ? '⚙️ da variabile d\'ambiente' : 'non configurato'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    type="password"
                    value={providerKeys[p.id] ?? ''}
                    onChange={e => setProviderKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder={p.keyHint}
                    className="h-9 min-w-0 flex-1"
                  />
                  <Button
                    size="sm"
                    disabled={savingProvider === p.id || (!(providerKeys[p.id] ?? '').trim() && !p.siteKey)}
                    onClick={() => void saveProviderKey(p)}
                  >
                    {savingProvider === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : p.siteKey ? (
                      'Sostituisci'
                    ) : (
                      'Salva'
                    )}
                  </Button>
                  {p.siteKey && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void saveProviderKey(p, '')}>
                        Rimuovi
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testingProvider === p.id}
                        onClick={() => void testProvider(p)}
                      >
                        {testingProvider === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Test'
                        )}
                      </Button>
                    </>
                  )}
                  <a
                    href={p.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-medium text-[var(--primary-strong)] underline-offset-2 hover:underline"
                  >
                    prendi la chiave ↗
                  </a>
                </div>
                {testResults[p.id] && (
                  <p
                    className={`mt-2 rounded-lg px-3 py-1.5 text-xs ${
                      testResults[p.id].includes('valida')
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {testResults[p.id]}
                  </p>
                )}
              </Card>
            ))}
          </TabsContent>

          {/* ---------------- AGENTE AI ---------------- */}
          <TabsContent value="agente" className="flex flex-col gap-3">
            <Card className="rounded-2xl border-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4" /> Agente Darpx · stato
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2">
                  <span>🧠 Cervello locale (istantaneo, senza chiavi)</span>
                  <span className="font-bold text-emerald-600">SEMPRE ATTIVO</span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2">
                  <span>⚙️ z-ai SDK (variabili d&apos;ambiente sul server)</span>
                  <span className={`font-bold ${zaiEnv ? 'text-emerald-600' : 'text-stone-400'}`}>
                    {zaiEnv ? 'ATTIVO' : 'non configurato'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2">
                  <span>🔌 Endpoint OpenAI-compatibile (qui sotto)</span>
                  <span className={`font-bold ${ai?.hasKey ? 'text-emerald-600' : 'text-stone-400'}`}>
                    {ai?.hasKey ? `ATTIVO ${ai.keyPreview ? `(${ai.keyPreview})` : ''}` : 'non configurato'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" /> Endpoint OpenAI-compatibile (opzionale)
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs leading-relaxed text-stone-500">
                  Con una chiave qualsiasi di un servizio compatibile con OpenAI
                  (OpenAI, OpenRouter, Groq, Together…), l&apos;Agente Darpx
                  risponde anche alle domande complesse con un vero modello
                  linguistico. Senza chiave resta comunque attivo il cervello
                  locale. La chiave è salvata <b>cifrata</b>.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai-base">Base URL</Label>
                  <Input
                    id="ai-base"
                    value={aiForm.baseUrl}
                    onChange={e => setAiForm({ ...aiForm, baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai-model">Modello</Label>
                  <Input
                    id="ai-model"
                    value={aiForm.model}
                    onChange={e => setAiForm({ ...aiForm, model: e.target.value })}
                    placeholder="gpt-4o-mini"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ai-key">
                    Chiave API {ai?.hasKey ? '(già impostata: lascia vuoto per tenerla)' : ''}
                  </Label>
                  <Input
                    id="ai-key"
                    type="password"
                    value={aiForm.apiKey}
                    onChange={e => setAiForm({ ...aiForm, apiKey: e.target.value })}
                    placeholder="sk-…"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => void saveAI()} disabled={savingAi}>
                    {savingAi && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salva
                  </Button>
                  {ai?.hasKey && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await fetch('/api/admin/ai', { method: 'DELETE' })
                        await loadAll()
                        toast.success('Configurazione AI rimossa')
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Rimuovi
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- CONTENUTI ---------------- */}
          <TabsContent value="contenuti" className="flex flex-col gap-4">
            {/* banner annuncio */}
            <Card className="rounded-2xl border-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Megaphone className="h-4 w-4" /> Banner annuncio (visibile a tutti in home)
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <textarea
                  value={announcement.text}
                  onChange={e => setAnnouncement({ ...announcement, text: e.target.value })}
                  rows={2}
                  maxLength={600}
                  placeholder="Es: 🎉 Novità: crea modelli 3D con Tripo e Hunyuan! Prova la sezione Darpx.ai"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
                  <input
                    type="checkbox"
                    checked={announcement.enabled}
                    onChange={e => setAnnouncement({ ...announcement, enabled: e.target.checked })}
                    className="accent-[var(--primary)]"
                  />
                  Mostra il banner in cima alla home
                </label>
              </CardContent>
            </Card>

            {/* reparti on/off + titoli */}
            <Card className="rounded-2xl border-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" /> Reparti della home (titoli, descrizioni, on/off)
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-stone-400">
                  Puoi rinominare i reparti, cambiarne la descrizione oppure
                  nasconderli: la barra della home si aggiorna subito.
                </p>
                {SECTION_DEFS.map(def => {
                  const s = sections[def.key]
                  return (
                    <div
                      key={def.key}
                      className="flex flex-col gap-2 rounded-2xl border border-black/5 bg-stone-50/60 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-stone-600">
                          {def.label}
                        </span>
                        <Input
                          value={s?.title ?? def.defaultTitle}
                          onChange={e => updateSection(def.key, { title: e.target.value })}
                          placeholder={def.defaultTitle}
                          className="h-8 flex-1"
                        />
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-stone-600">
                          <input
                            type="checkbox"
                            checked={s?.enabled !== false}
                            onChange={e => updateSection(def.key, { enabled: e.target.checked })}
                            className="accent-[var(--primary)]"
                          />
                          visibile
                        </label>
                      </div>
                      <textarea
                        value={s?.subtitle ?? ''}
                        onChange={e => updateSection(def.key, { subtitle: e.target.value })}
                        rows={2}
                        placeholder={DEFAULT_SECTION_SUBTITLES[def.key] ?? 'Descrizione del reparto'}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      />
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* testi principali */}
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
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                      />
                    ) : (
                      <Input id={`site-${k}`} value={config[k]} onChange={e => setConfig({ ...config, [k]: e.target.value })} />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* paragrafi */}
            <Card className="rounded-2xl border-black/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <Type className="h-4 w-4" /> Paragrafi della home
                  </span>
                  <Button size="sm" variant="outline" onClick={addParagraph}>
                    <Plus className="mr-1 h-4 w-4" /> Aggiungi paragrafo
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-stone-400">
                  Crea quante sezioni vuoi: compariranno sulla home come schede,
                  nell&apos;ordine in cui le dispositi. Titolo e testo sono liberi.
                </p>
                {paragraphs.length === 0 && (
                  <Empty text="Nessun paragrafo: la home mostra solo i testi principali" />
                )}
                {paragraphs.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 rounded-2xl border border-black/5 bg-stone-50/60 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-stone-600">
                        {idx + 1}
                      </span>
                      <Input
                        value={p.title}
                        onChange={e => updateParagraph(idx, { title: e.target.value })}
                        placeholder="Titolo della sezione"
                        className="h-8 flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Sposta su"
                        disabled={idx === 0}
                        onClick={() => moveParagraph(idx, -1)}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Sposta giù"
                        disabled={idx === paragraphs.length - 1}
                        onClick={() => moveParagraph(idx, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Elimina"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => removeParagraph(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <textarea
                      value={p.text}
                      onChange={e => updateParagraph(idx, { text: e.target.value })}
                      rows={3}
                      placeholder="Testo del paragrafo"
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button onClick={saveSite} className="self-start" size="lg">
              💾 Salva tutti i contenuti
            </Button>
          </TabsContent>
        </Tabs>

        <div className="mt-8 text-center">
          <a href="/" className="inline-flex items-center gap-1 text-sm text-stone-400 underline-offset-2 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Torna al sito
          </a>
        </div>
      </main>

      {/* anteprima 3D dei modelli (stessa del sito) */}
      <GLBViewer url={previewUrl} name={previewName} onClose={() => setPreviewUrl(null)} />
    </div>
  )
}

// ============================================================
// Piccoli componenti
// ============================================================

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--site-bg)] p-4">
      {children}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value?: number }) {
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
