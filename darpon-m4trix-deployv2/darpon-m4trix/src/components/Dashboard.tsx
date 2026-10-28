'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Box as Cube,
  Library,
  Hammer,
  LogOut,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useWorld, type ProjectMeta } from '@/lib/world-store'
import { fetchAuth } from '@/lib/http'
import ImportedModels from '@/components/ImportedModels'
import StructuresLab from '@/components/StructuresLab'
import ProfileDialog from '@/components/ProfileDialog'
import { SITE_DEFAULTS, type SiteConfig } from '@/lib/site'

// I 3 reparti della home: mondi, modelli importati, strutture
type Tab = 'mondi' | 'importati' | 'strutture'

const CARD_ITEM = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.06,
      type: 'spring' as const,
      stiffness: 180,
      damping: 20,
    },
  }),
}

export default function Dashboard() {
  const user = useWorld(s => s.user)
  const projects = useWorld(s => s.projects)
  const setProjects = useWorld(s => s.setProjects)
  const openProject = useWorld(s => s.openProject)
  const [siteName, setSiteName] = useState(SITE_DEFAULTS.siteName)
  const [newName, setNewName] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('mondi')

  const refresh = async () => {
    try {
      // fetchAuth: evita il 401 fantasma subito dopo il login
      const res = await fetchAuth('/api/projects')
      if (!res.ok) return
      const data = await res.json()
      setProjects(data.projects ?? [])
    } catch {
      toast.error('Impossibile caricare i progetti')
    }
  }

  useEffect(() => {
    void refresh()
    // nome del sito personalizzato dall'area admin
    fetch('/api/site')
      .then(r => r.json())
      .then(d => d.config?.siteName && setSiteName(d.config.siteName))
      .catch(() => {})
  }, [])

  const createProject = async () => {
    if (busy) return // niente doppioni!
    const trimmed = newName.trim()
    if (!trimmed) {
      toast.error('Dai un nome al tuo mondo!')
      return
    }
    setBusy(true)
    try {
      const res = await fetchAuth('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la creazione')
      setCreateOpen(false)
      setNewName('')
      void refresh()
      openProject(data.project)
      toast.success(`Mondo "${data.project.name}" creato! 🌍`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const deleteProject = async (p: ProjectMeta) => {
    try {
      const res = await fetchAuth(`/api/projects/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(`"${p.name}" eliminato`)
      void refresh()
    } catch {
      toast.error('Eliminazione non riuscita')
    }
  }

  const renameProject = async () => {
    if (!renameId || !renameName.trim()) return
    try {
      const res = await fetchAuth(`/api/projects/${renameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameName.trim() }),
      })
      if (!res.ok) throw new Error()
      setRenameId(null)
      toast.success('Progetto rinominato!')
      void refresh()
    } catch {
      toast.error('Rinomina non riuscita')
    }
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    useWorld.getState().setUser(null)
    useWorld.getState().setView('landing')
  }

  const openWithSave = async (p: ProjectMeta) => {
    try {
      const res = await fetchAuth(`/api/projects/${p.id}`)
      const data = await res.json()
      if (res.ok) {
        openProject(data.project)
        return
      }
      throw new Error()
    } catch {
      toast.error('Impossibile aprire il progetto')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--site-bg)]">
      {/* sfondo decorativo */}
      <div className="pointer-events-none fixed -left-40 top-0 h-96 w-96 rounded-full bg-[var(--site-blob)] opacity-70 blur-3xl" />
      <div className="pointer-events-none fixed -right-40 bottom-0 h-96 w-96 rounded-full bg-[var(--site-blob-2)] opacity-70 blur-3xl" />

      <header className="sticky top-0 z-10 border-b border-black/5 bg-[var(--site-bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <motion.span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-md"
              whileHover={{ rotate: -8, scale: 1.08 }}
              transition={{ type: 'spring', stiffness: 300, damping: 12 }}
            >
              <Cube className="h-5 w-5" />
            </motion.span>
            <span className="text-lg font-black tracking-tight text-stone-800">
              {siteName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 hidden text-sm font-medium text-stone-600 sm:inline">
              Ciao, {user?.name || user?.email} 👋
            </span>
            <ProfileDialog />
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="mr-1 h-4 w-4" /> Esci
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl p-6">
        {/* ===== barra dei reparti ===== */}
        <div className="mb-6 flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/70 p-1.5 ring-1 ring-black/5">
          {(
            [
              { id: 'mondi' as Tab, icon: <Cube className="h-4 w-4" />, label: 'I miei mondi' },
              { id: 'importati' as Tab, icon: <Package className="h-4 w-4" />, label: 'Progetti importati' },
              { id: 'strutture' as Tab, icon: <Hammer className="h-4 w-4" />, label: 'Strutture' },
            ]
          ).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                tab === t.id
                  ? 'bg-[var(--primary)] text-white shadow-md'
                  : 'text-stone-600 hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'mondi' && (
          <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18 }}
          >
            <h1 className="text-2xl font-black tracking-tight text-stone-800">
              I tuoi mondi
            </h1>
            <p className="text-sm text-stone-500">
              Crea un nuovo progetto, costruisci il mondo e trasformalo in un
              videogioco.
            </p>
          </motion.div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md">
                <Plus className="mr-1 h-4 w-4" /> Nuovo progetto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuovo mondo</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="proj-name">Nome del progetto</Label>
                <Input
                  id="proj-name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Es. Il Regno del Cavaliere"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !busy) void createProject()
                  }}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button onClick={createProject} disabled={busy}>
                  {busy ? (
                    <>
                      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Creo...
                    </>
                  ) : (
                    'Crea progetto'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-dashed bg-white/60">
              <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
                <motion.span
                  className="text-5xl"
                  animate={{ y: [0, -10, 0], rotate: [0, 6, -6, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  🌍
                </motion.span>
                <p className="text-lg font-semibold text-stone-700">
                  Ancora nessun mondo
                </p>
                <p className="max-w-md text-sm text-stone-500">
                  Premi <b>Nuovo progetto</b> per iniziare: piazza case, strade
                  e alberi con un clic, poi premi <b>Gioca</b> per esplorarci
                  dentro con il tuo cavaliere.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <motion.button
              custom={0}
              variants={CARD_ITEM}
              initial="hidden"
              animate="show"
              whileHover={{ y: -4 }}
              onClick={() => setCreateOpen(true)}
              className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-white/40 p-6 text-stone-500 transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)]"
            >
              <motion.span
                animate={{ rotate: [0, 90, 90, 90] }}
                transition={{ duration: 6, repeat: Infinity, times: [0, 0.15, 0.85, 1] }}
              >
                <Plus className="h-8 w-8" />
              </motion.span>
              <span className="text-sm font-semibold">Nuovo progetto</span>
            </motion.button>
            {projects.map((p, i) => (
              <motion.div
                key={p.id}
                custom={i + 1}
                variants={CARD_ITEM}
                initial="hidden"
                animate="show"
                whileHover={{ y: -4 }}
              >
                <Card className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border-black/5 bg-white shadow-sm transition-shadow hover:shadow-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="truncate text-base">{p.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-2 pt-0 text-xs text-stone-500">
                    <p>
                      Modificato il{' '}
                      {new Date(p.updatedAt).toLocaleString('it-IT', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="mt-0.5">
                      {(() => {
                        try {
                          const st = JSON.parse(p.state)
                          return `${st.objects?.length ?? 0} oggetti · ${st.customAssets?.length ?? 0} asset caricati`
                        } catch {
                          return '—'
                        }
                      })()}
                    </p>
                  </CardContent>
                  <CardFooter className="gap-2 pt-2">
                    <Button size="sm" className="flex-1" onClick={() => openWithSave(p)}>
                      Apri
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRenameId(p.id)
                        setRenameName(p.name)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Eliminare «{p.name}»?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Il mondo e i suoi salvataggi verranno cancellati per
                            sempre.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => deleteProject(p)}
                          >
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
          </>
        )}

        {/* REPARTO: modelli 3D importati dall'utente (disponibili in ogni editor) */}
        {tab === 'importati' && <ImportedModels />}

        {/* REPARTO: progettazione strutture, separata dalla creazione dei mondi */}
        {tab === 'strutture' && <StructuresLab />}
      </main>

      <Dialog
        open={!!renameId}
        onOpenChange={o => !o && setRenameId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina progetto</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && renameProject()}
            autoFocus
          />
          <DialogFooter>
            <Button onClick={renameProject}>Salva nome</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
