'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useWorld, type SessionUser } from '@/lib/world-store'
import { SITE_DEFAULTS, DEFAULT_PARAGRAPHS, type SiteConfig, type HomeParagraph } from '@/lib/site'

// ============================================================
// Skyline cyberpunk — grattacieli, finestre neon, droni e
// griglia all'orizzonte. Puro CSS/divs animati.
// ============================================================

const NEONS = ['#00f0ff', '#ff2bd6', '#fcee0a', '#00ff9c', '#b26bff']

type TowerDef = {
  left: string
  w: number
  h: number
  delay: number
}

const TOWERS: TowerDef[] = [
  { left: '2%', w: 64, h: 150, delay: 0.0 },
  { left: '12%', w: 46, h: 96, delay: 0.4 },
  { left: '20%', w: 74, h: 190, delay: 0.9 },
  { left: '33%', w: 54, h: 120, delay: 0.2 },
  { left: '43%', w: 88, h: 220, delay: 1.3 },
  { left: '56%', w: 50, h: 104, delay: 0.6 },
  { left: '64%', w: 70, h: 172, delay: 1.0 },
  { left: '76%', w: 58, h: 132, delay: 0.3 },
  { left: '86%', w: 46, h: 92, delay: 1.6 },
]

function Windows({ w, h, seed }: { w: number; h: number; seed: number }) {
  const cols = Math.max(2, Math.floor(w / 14))
  const rows = Math.max(3, Math.floor(h / 18))
  const cells: { x: number; y: number; c: string; on: boolean }[] = []
  for (let r0 = 0; r0 < rows; r0++)
    for (let c0 = 0; c0 < cols; c0++) {
      const on = (r0 * 7 + c0 * 13 + seed) % 5 < 3
      cells.push({
        x: 4 + c0 * (w - 8) / cols,
        y: 6 + r0 * (h - 10) / rows,
        c: NEONS[(r0 * 3 + c0 + seed) % NEONS.length],
        on,
      })
    }
  return (
    <>
      {cells.map((c, i) => (
        <motion.span
          key={i}
          className="absolute rounded-[1px]"
          style={{
            left: c.x,
            top: c.y,
            width: 5,
            height: 7,
            background: c.on ? c.c : 'rgba(255,255,255,0.06)',
            boxShadow: c.on ? `0 0 6px ${c.c}` : 'none',
          }}
          animate={c.on ? { opacity: [1, 0.55, 1] } : undefined}
          transition={{
            duration: 2 + ((i * 7) % 5) * 0.7,
            repeat: Infinity,
            delay: (i % 9) * 0.35,
          }}
        />
      ))}
    </>
  )
}

function Drone({ top, delay, dur, dir }: { top: string; delay: number; dur: number; dir: 1 | -1 }) {
  return (
    <motion.div
      className="absolute"
      style={{ top }}
      initial={{ x: dir === 1 ? '-10%' : '110%' }}
      animate={{ x: dir === 1 ? '110%' : '-10%' }}
      transition={{ duration: dur, repeat: Infinity, ease: 'linear', delay }}
    >
      <span className="block h-1 w-5 rounded-full bg-[var(--neon)] shadow-[0_0_8px_var(--neon)]" />
      <motion.span
        className="mt-0.5 block h-1 w-1 rounded-full bg-[#ff3355]"
        animate={{ opacity: [1, 0.2, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    </motion.div>
  )
}

function CyberCityScene() {
  return (
    <motion.div
      className="relative mx-auto mt-10 h-64 w-full max-w-xl select-none overflow-hidden"
      aria-hidden
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, type: 'spring', stiffness: 60, damping: 16 }}
    >
      {/* luna/sole sintetico */}
      <div
        className="absolute left-1/2 top-6 h-20 w-20 -translate-x-1/2 rounded-full"
        style={{
          background: 'linear-gradient(180deg, var(--neon-2), transparent 70%)',
          opacity: 0.55,
          filter: 'blur(2px)',
        }}
      />
      <div
        className="absolute left-1/2 top-10 h-16 w-32 -translate-x-1/2"
        style={{
          background:
            'repeating-linear-gradient(180deg, transparent 0 6px, var(--site-bg) 6px 9px)',
          opacity: 0.8,
        }}
      />

      {/* droni */}
      <Drone top="18%" delay={0.5} dur={14} dir={1} />
      <Drone top="30%" delay={6} dur={18} dir={-1} />

      {/* skyline */}
      <div className="absolute inset-x-0 bottom-12 flex items-end justify-center gap-2">
        {TOWERS.map((t, i) => (
          <motion.div
            key={i}
            className="relative shrink-0 bg-[#0d1224] ring-1 ring-[var(--line)]"
            style={{ width: t.w, height: t.h }}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 5 + (i % 4), repeat: Infinity, ease: 'easeInOut', delay: t.delay }}
          >
            <Windows w={t.w} h={t.h} seed={i * 17} />
            {/* antenna con luce */}
            {i % 3 === 0 && (
              <>
                <span className="absolute -top-3 left-1/2 h-3 w-0.5 -translate-x-1/2 bg-[var(--line-strong)]" />
                <motion.span
                  className="absolute -top-4 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#ff3355]"
                  animate={{ opacity: [1, 0.1, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.4 }}
                />
              </>
            )}
            {/* insegna neon verticale */}
            {i % 4 === 2 && (
              <motion.span
                className="absolute right-1 top-3 text-[10px] font-bold"
                style={{
                  color: NEONS[i % NEONS.length],
                  textShadow: `0 0 8px ${NEONS[i % NEONS.length]}`,
                  writingMode: 'vertical-rl',
                }}
                animate={{ opacity: [1, 0.5, 1, 0.8, 1] }}
                transition={{ duration: 3.5, repeat: Infinity }}
              >
                電脳
              </motion.span>
            )}
          </motion.div>
        ))}
      </div>

      {/* strada riflessi + griglia prospettica */}
      <div className="absolute inset-x-0 bottom-0 h-12 border-t border-[var(--line-strong)] bg-[#05070d]">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(90deg, color-mix(in srgb, var(--neon) 30%, transparent) 1px, transparent 1px), linear-gradient(180deg, color-mix(in srgb, var(--neon-2) 22%, transparent) 1px, transparent 1px)',
            backgroundSize: '40px 12px',
            transform: 'perspective(120px) rotateX(58deg)',
            transformOrigin: 'top',
          }}
        />
      </div>
    </motion.div>
  )
}

// ============================================================
// Landing
// ============================================================

const CHIP_CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.75 } },
}
const CHIP_ITEM = {
  hidden: { opacity: 0, y: 14, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 260, damping: 20 },
  },
}

export default function AuthLanding() {
  const setUser = useWorld(s => s.setUser)
  const setView = useWorld(s => s.setView)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useState<SiteConfig>({ ...SITE_DEFAULTS })
  const [paragraphs, setParagraphs] = useState<HomeParagraph[]>(DEFAULT_PARAGRAPHS)
  const [dbMissing, setDbMissing] = useState(false)

  // Testi personalizzati dall'admin + diagnostica del database
  useEffect(() => {
    fetch('/api/site')
      .then(r => r.json())
      .then(d => {
        if (d.config) setConfig(d.config)
        if (Array.isArray(d.paragraphs)) setParagraphs(d.paragraphs)
      })
      .catch(() => {})
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setDbMissing(d.db === false))
      .catch(() => {})
  }, [])

  const submit = async (mode: 'login' | 'signup') => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 500 = quasi sempre deploy non configurato: messaggio più utile
        if (res.status >= 500) {
          throw new Error(
            'Il server non è configurato: manca il database o il segreto delle sessioni. Apri /admin → Stato per la diagnostica.'
          )
        }
        throw new Error(data.error ?? 'Errore')
      }

      // applica il tema salvato dell'account (se c'è)
      const savedAccent = (data.user as SessionUser)?.accentColor
      if (savedAccent) useWorld.getState().setAccent(savedAccent, false)
      else useWorld.getState().setAccent(useWorld.getState().accent, false)

      setUser(data.user as SessionUser)
      setView('dashboard')
      toast.success(
        mode === 'login' ? 'Bentornato in rete! 👋' : 'Account creato: benvenuto nella rete! 🎉'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const headline = config.headline.split(/\s+/).filter(Boolean)

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--site-bg)]">
      {/* sfondo animato */}
      <motion.div
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[var(--site-blob)] blur-3xl"
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[var(--site-blob-2)] blur-3xl"
        animate={{ x: [0, -55, 0], y: [0, 55, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* griglia cyberpunk */}
      <div className="cp-grid-bg pointer-events-none absolute inset-0" />

      <main className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-10 px-4 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
        {/* ---------- hero ---------- */}
        <section className="text-center lg:text-left">
          <motion.div
            className="cp-chip cp-chip-active mb-5 inline-flex items-center gap-2 px-4 py-1.5 text-xs uppercase"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 16 }}
          >
            <motion.span
              animate={{ rotate: [0, 20, -12, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              🕹️
            </motion.span>
            {config.tagline}
          </motion.div>

          <h1 className="neon-title text-5xl font-black leading-[1.06] tracking-wide sm:text-6xl lg:text-[4.2rem]">
            {headline.map((w, i) => (
              <motion.span
                key={i}
                className="inline-block"
                initial={{ opacity: 0, y: 28, rotate: 5 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{
                  delay: 0.12 + i * 0.13,
                  type: 'spring',
                  stiffness: 210,
                  damping: 17,
                }}
              >
                {w}
                {i < headline.length - 1 ? '\u00A0' : ''}
              </motion.span>
            ))}
            <br />
            <motion.span
              className="animate-gradient-x animate-flicker inline-block bg-[linear-gradient(90deg,var(--neon-2),var(--neon),var(--neon-2))] bg-[length:200%_auto] bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.55,
                type: 'spring',
                stiffness: 210,
                damping: 17,
              }}
            >
              {config.headlineAccent}
            </motion.span>
          </h1>

          <motion.p
            className="mx-auto mt-5 max-w-md text-lg text-[var(--tx-dim)] lg:mx-0"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
          >
            {config.intro.split(/(\bpremi Gioca[^.]*)/).map((part, i) =>
              part.startsWith('premi Gioca') ? <b key={i}>{part}</b> : part
            )}
          </motion.p>

          <motion.div
            className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start"
            variants={CHIP_CONTAINER}
            initial="hidden"
            animate="show"
          >
            {[
              '🎮 Giochi completi da uno script',
              '🗺️ Mappe procedurali infinite',
              '👾 Nemici, boss e dialoghi',
              '💾 Salvataggi automatici',
            ].map(t => (
              <motion.span
                key={t}
                variants={CHIP_ITEM}
                whileHover={{ scale: 1.06, y: -2 }}
                className="cp-chip cursor-default px-3.5 py-1.5 text-[13px] tracking-normal normal-case"
              >
                {t}
              </motion.span>
            ))}
          </motion.div>

          <CyberCityScene />
        </section>

        {/* ---------- card auth ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 36, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 120, damping: 17 }}
        >
          <Card className="cp-panel w-full max-w-md rounded-none shadow-2xl shadow-black/40 backdrop-blur lg:ml-auto">
            <CardHeader>
              <motion.div
                className="cp-panel cp-panel-neon mx-auto mb-1 flex h-12 w-12 items-center justify-center"
                initial={{ rotate: -12, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.55, type: 'spring', stiffness: 220, damping: 12 }}
              >
                <span className="text-xl">👾</span>
              </motion.div>
              <CardTitle className="neon-title text-center text-xl">
                Collegati alla rete
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dbMissing && (
                <div className="mb-4 border border-amber-400/40 bg-[var(--panel-soft)] p-3 text-xs leading-relaxed text-amber-300">
                  ⚠️ <b>Database non collegato</b>: accedi e registrati non
                  possono funzionare. Su Vercel apri il tuo progetto → tab{' '}
                  <b>Storage</b> → <b>Create Database → Postgres</b> →{' '}
                  <b>Connect Project</b> → poi <b>Redeploy</b>. Dettagli in{' '}
                  <a href="/admin" className="underline">/admin → Stato</a>.
                </div>
              )}
              <Tabs defaultValue="login">
                <TabsList className="mb-4 grid w-full grid-cols-2">
                  <TabsTrigger value="login">Accedi</TabsTrigger>
                  <TabsTrigger value="signup">Registrati</TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="flex flex-col gap-4">
                  <EmailPass
                    email={email}
                    password={password}
                    setEmail={setEmail}
                    setPassword={setPassword}
                    onEnter={() => submit('login')}
                  />
                  <Button disabled={busy} onClick={() => submit('login')} className="cp-btn">
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Accedi
                  </Button>
                </TabsContent>
                <TabsContent value="signup" className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="name">Nome (facoltativo)</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Il tuo alias in rete"
                    />
                  </div>
                  <EmailPass
                    email={email}
                    password={password}
                    setEmail={setEmail}
                    setPassword={setPassword}
                    onEnter={() => submit('signup')}
                  />
                  <Button disabled={busy} onClick={() => submit('signup')} className="cp-btn">
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crea account
                  </Button>
                </TabsContent>
              </Tabs>
              <p className="mt-4 text-center text-xs text-[var(--tx-faint)]">
                Tutto ciò che costruisci viene salvato nel tuo account.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* ---------- paragrafi liberi (gestiti dall'admin) ---------- */}
      {paragraphs.length > 0 && (
        <section className="relative mx-auto max-w-5xl px-4 pb-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paragraphs.map((p, i) => (
              <motion.article
                key={p.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 90, damping: 16 }}
                className="cp-panel p-6"
              >
                <h2 className="text-base font-black tracking-tight text-[var(--tx)]">
                  {p.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--tx-dim)]">
                  {p.text}
                </p>
              </motion.article>
            ))}
          </div>
        </section>
      )}

      <footer className="relative pb-6 text-center text-xs text-[var(--tx-faint)]">
        {config.footer}
        <a href="/admin" className="ml-2 opacity-50 underline-offset-2 hover:opacity-100 hover:underline">
          Admin
        </a>
      </footer>
    </div>
  )
}

function EmailPass({
  email,
  password,
  setEmail,
  setPassword,
  onEnter,
}: {
  email: string
  password: string
  setEmail: (v: string) => void
  setPassword: (v: string) => void
  onEnter: () => void
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEnter()}
          placeholder="tu@esempio.it"
          autoComplete="email"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onEnter()}
          placeholder="Almeno 6 caratteri"
          autoComplete={password.length ? 'current-password' : 'new-password'}
        />
      </div>
    </>
  )
}
