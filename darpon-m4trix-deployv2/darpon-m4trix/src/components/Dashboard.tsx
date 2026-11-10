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
  Gamepad2,
  Globe2,
  Hammer,
  Library,
  LogOut,
  Package,
  Pencil,
  Plus,
  ScrollText,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useWorld, type ProjectMeta } from '@/lib/world-store'
import { isGameProjectState } from '@/lib/game2d/persist'
import { fetchAuth } from '@/lib/http'
import ImportedModels from '@/components/ImportedModels'
import StructuresLab from '@/components/StructuresLab'
import WorldGen from '@/components/WorldGen'
import DarpxAI from '@/components/DarpxAI'
import DarpxAgent from '@/components/DarpxAgent'
import ProfileDialog from '@/components/ProfileDialog'
import GameStudio from '@/components/studio/GameStudio'
import CreaDaScript from '@/components/creagame/CreaDaScript'
import WorldForge from '@/components/worldforge/WorldForge'
import { SITE_DEFAULTS, type SiteConfig } from '@/lib/site'
import { sectionOf, useUI, type DashboardTab } from '@/lib/ui-store'

// I reparti della home: mondi, modelli importati, strutture, genera, darpx

type Tab = DashboardTab

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
  const [showGenera, setShowGenera] = useState(false) // v15: genera dentro Mondi 3D
  const [welcomeOpen, setWelcomeOpen] = useState(false) // v16: benvenuto a ogni ingresso
  const tab = useUI(s => s.tab)
  const setTab = useUI(s => s.setTab)
  const site = useUI(s => s.site)
  const loadSite = useUI(s => s.loadSite)

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
    // contenuti del sito (testi, reparti, annuncio) dall'area admin
    void loadSite()
    // nome del sito personalizzato dall'area admin
    fetch('/api/site')
      .then(r => r.json())
      .then(d => d.config?.siteName && setSiteName(d.config.siteName))
      .catch(() => {})
    // v16: pop-up di benvenuto OGNI volta che entri
    const t = setTimeout(() => setWelcomeOpen(true), 450)
    return () => clearTimeout(t)
  }, [refresh, loadSite])

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

  // I giochi del Game Studio sono progetti nel DB con marker kind:'game2d':
  // NON devono comparire nel reparto Mondi 3D (reparti separati).
  const worldProjects = projects.filter(p => !isGameProjectState(p.state))

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

      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--site-bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <motion.span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-md"
              whileHover={{ rotate: -8, scale: 1.08 }}
              transition={{ type: 'spring', stiffness: 300, damping: 12 }}
            >
              <Cube className="h-5 w-5" />
            </motion.span>
            <span className="text-lg font-black tracking-tight text-[var(--tx)]">
              {siteName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 hidden text-sm font-medium text-[var(--tx-dim)] sm:inline">
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
        {/* ===== banner annuncio (modificabile dall'admin) ===== */}
        {site.announcement.enabled && site.announcement.text && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-start gap-2.5 rounded-2xl border border-purple-200 bg-gradient-to-r from-[var(--primary-soft)] to-[var(--panel-soft)] p-3.5 text-sm text-[var(--tx)] shadow-sm"
          >
            <span className="text-base leading-none">📣</span>
            <p className="min-w-0 flex-1 whitespace-pre-wrap">{site.announcement.text}</p>
          </motion.div>
        )}

        {/* ===== barra dei reparti ===== */}
        <div className="mb-6 flex flex-wrap items-center gap-1.5 rounded-2xl bg-[var(--panel)] p-1.5 ring-1 ring-[var(--line)]">
          {(
            [
              { id: 'gamestudio' as Tab, icon: <Gamepad2 className="h-4 w-4" />, label: sectionOf(site.sections, 'gamestudio').title, enabled: sectionOf(site.sections, 'gamestudio').enabled },
              { id: 'creagame' as Tab, icon: <ScrollText className="h-4 w-4" />, label: sectionOf(site.sections, 'creagame').title, enabled: sectionOf(site.sections, 'creagame').enabled },
              { id: 'worldforge' as Tab, icon: <Globe2 className="h-4 w-4" />, label: sectionOf(site.sections, 'worldforge').title, enabled: sectionOf(site.sections, 'worldforge').enabled },
              { id: 'mondi' as Tab, icon: <Cube className="h-4 w-4" />, label: sectionOf(site.sections, 'mondi').title, enabled: sectionOf(site.sections, 'mondi').enabled },
              { id: 'importati' as Tab, icon: <Package className="h-4 w-4" />, label: sectionOf(site.sections, 'importati').title, enabled: sectionOf(site.sections, 'importati').enabled },
              { id: 'strutture' as Tab, icon: <Hammer className="h-4 w-4" />, label: sectionOf(site.sections, 'strutture').title, enabled: sectionOf(site.sections, 'strutture').enabled },
              { id: 'darpx' as Tab, icon: <Sparkles className="h-4 w-4" />, label: sectionOf(site.sections, 'darpx').title, enabled: sectionOf(site.sections, 'darpx').enabled },
            ]
          ).filter(t => t.enabled !== false && t.id !== 'genera').map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                tab === t.id
                  ? 'bg-[var(--primary)] text-white shadow-md'
                  : 'text-[var(--tx-dim)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)]'
              }`}
            >
              {t.icon}
              {/* v15: il vecchio suffisso «(prova)» non si mostra più */}
              {t.label.replace(/ \(prova\)$/, '')}
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
            <h1 className="text-2xl font-black tracking-tight text-[var(--tx)]">
              I tuoi mondi
            </h1>
            <p className="text-sm text-[var(--tx-dim)]">
              Crea un nuovo progetto, costruisci il mondo e trasformalo in un
              videogioco.
            </p>
          </motion.div>
          {/* v15: tasto GENERA dentro Mondi 3D, accanto a Nuovo progetto */}
          <Button
            variant="outline"
            className="shadow-md"
            onClick={() => setShowGenera(g => !g)}
          >
            <Wand2 className="mr-1 h-4 w-4" /> Genera {showGenera ? '▲' : '▼'}
          </Button>
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

        {/* v15: generatore di città e paesaggi, dentro il reparto Mondi 3D */}
        {tab === 'mondi' && showGenera && (
          <div className="mb-6">
            <WorldGen />
          </div>
        )}

        {worldProjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-dashed bg-[var(--panel)]">
              <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
                <motion.span
                  className="text-5xl"
                  animate={{ y: [0, -10, 0], rotate: [0, 6, -6, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  🌍
                </motion.span>
                <p className="text-lg font-semibold text-[var(--tx)]">
                  Ancora nessun mondo
                </p>
                <p className="max-w-md text-sm text-[var(--tx-dim)]">
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
              className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-6 text-[var(--tx-dim)] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)]"
            >
              <motion.span
                animate={{ rotate: [0, 90, 90, 90] }}
                transition={{ duration: 6, repeat: Infinity, times: [0, 0.15, 0.85, 1] }}
              >
                <Plus className="h-8 w-8" />
              </motion.span>
              <span className="text-sm font-semibold">Nuovo progetto</span>
            </motion.button>
            {worldProjects.map((p, i) => (
              <motion.div
                key={p.id}
                custom={i + 1}
                variants={CARD_ITEM}
                initial="hidden"
                animate="show"
                whileHover={{ y: -4 }}
              >
                <Card className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border-[var(--line)] bg-[var(--panel)] shadow-sm transition-shadow hover:shadow-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="truncate text-base">{p.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-2 pt-0 text-xs text-[var(--tx-dim)]">
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
                        <Button size="sm" variant="outline" className="text-red-400">
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
          {projects.length > worldProjects.length && (
            <p className="mt-4 text-xs text-[var(--tx-faint)]">
              🕹 {projects.length - worldProjects.length} giochi del Game Studio non sono in questa lista: li trovi nel reparto{' '}
              <button className="neon-text underline" onClick={() => setTab('gamestudio')}>
                Game Studio
              </button>.
            </p>
          )}
          </>
        )}

        {/* REPARTO: game studio — editor di videogiochi stile Godot/Unity */}
        {tab === 'gamestudio' && <GameStudio />}

        {/* REPARTO: crea un gioco giocabile da una sceneggiatura */}
        {tab === 'creagame' && <CreaDaScript />}

        {/* REPARTO: mappe procedurali personalizzabili stile Watabou */}
        {tab === 'worldforge' && <WorldForge />}

        {/* REPARTO: modelli 3D importati dall'utente (disponibili in ogni editor) */}
        {tab === 'importati' && <ImportedModels />}

        {/* REPARTO: Darpx.ai — immagine → mondo, testo → 3D */}
        {tab === 'darpx' && <DarpxAI />}

        {/* REPARTO: progettazione strutture, separata dalla creazione dei mondi */}
        {tab === 'strutture' && <StructuresLab />}
      </main>

      {/* Agente Darpx: assistente AI fluttuante, sempre disponibile */}
      <DarpxAgent />

      {/* v16: pop-up di BENVENUTO — si apre a ogni ingresso nel sito */}
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent className="max-w-md border-[var(--line)] bg-[var(--panel)] sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-[var(--tx)]">
              <span className="text-2xl">👋</span> Bentornato su {siteName}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-[var(--tx-dim)]">
            Tutto è pronto. Ecco i tuoi posti di lavoro:
          </p>
          <div className="flex flex-col gap-2 text-sm">
            {[
              { icon: '🎮', t: 'Game Studio', d: 'Il cuore del sito: costruisci il tuo videogioco in 3D, sposti tutto con le frecce e scegli le animazioni dei personaggi.' },
              { icon: '🌍', t: 'Mondi 3D', d: 'Crea mondi a mano o generali città e paesaggi con un clic (bottone Genera).' },
              { icon: '📦', t: 'Progetti importati', d: 'Carica i tuoi modelli .glb o prendili dal Catalogo 3D gratuito.' },
            ].map(x => (
              <div key={x.t} className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                <span className="text-xl">{x.icon}</span>
                <div className="min-w-0">
                  <p className="font-bold text-[var(--tx)]">{x.t}</p>
                  <p className="text-xs leading-snug text-[var(--tx-dim)]">{x.d}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--tx-faint)]">
            Suggerimento: se ti perdi, premi il pulsante con l'ingranaggio in alto per nome, password e colore del sito.
          </p>
          <Button
            className="w-full bg-[var(--primary)] font-bold text-white"
            onClick={() => setWelcomeOpen(false)}
          >
            Entra e crea 🚀
          </Button>
        </DialogContent>
      </Dialog>

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
