'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useWorld, type SessionUser } from '@/lib/world-store'

// ============================================================
// Piccola città fluttuante — pura animazione CSS/divs
// ============================================================

const float = (duration: number, delay = 0, dist = 6) => ({
  animate: { y: [0, -dist, 0] },
  transition: { duration, repeat: Infinity, ease: 'easeInOut' as const, delay },
})

function Smoke({ className }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute ${className ?? ''}`}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="absolute h-2 w-2 rounded-full bg-white/80"
          style={{ left: 0, bottom: 0 }}
          animate={{ y: [-2, -26], x: [0, 6], opacity: [0, 0.9, 0], scale: [0.7, 1.4] }}
          transition={{
            duration: 2.6,
            repeat: Infinity,
            delay: i * 0.9,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  )
}

function House({
  w,
  wall,
  roof,
  className,
  delay = 0,
}: {
  w: number
  wall: string
  roof: string
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      className={`absolute ${className ?? ''}`}
      style={{ width: w }}
      {...float(4.5, delay)}
    >
      <div
        style={{
          width: w,
          height: w * 0.46,
          background: roof,
          clipPath: 'polygon(50% 0%, 102% 100%, -2% 100%)',
        }}
      />
      <div
        className="relative"
        style={{ width: w, height: w * 0.66, background: wall }}
      >
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-[#ffd97a] ring-1 ring-black/15"
          style={{ width: w * 0.22, height: w * 0.22 }}
        />
      </div>
    </motion.div>
  )
}

function Tree({
  size,
  className,
  delay = 0,
}: {
  size: number
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      className={`absolute ${className ?? ''}`}
      style={{ width: size }}
      {...float(3.8, delay, 4)}
    >
      <div
        className="mx-auto rounded-full bg-[#5d8a4f] ring-1 ring-black/10"
        style={{ width: size, height: size }}
      />
      <div
        className="mx-auto bg-[#7a5236]"
        style={{ width: size * 0.18, height: size * 0.55 }}
      />
    </motion.div>
  )
}

function TownScene() {
  return (
    <motion.div
      className="relative mx-auto mt-12 h-60 w-full max-w-md select-none"
      aria-hidden
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, type: 'spring', stiffness: 60, damping: 16 }}
    >
      {/* nuvole */}
      <motion.div
        className="absolute left-0 top-1 z-10"
        animate={{ x: [0, 30, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="relative h-6 w-20">
          <span className="absolute left-3 top-0 h-6 w-6 rounded-full bg-white" />
          <span className="absolute left-7 top-1 h-7 w-9 rounded-full bg-white" />
          <span className="absolute left-12 top-1 h-5 w-6 rounded-full bg-white" />
        </div>
      </motion.div>
      <motion.div
        className="absolute right-2 top-6 z-10 opacity-80"
        animate={{ x: [0, -24, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      >
        <div className="relative h-5 w-16">
          <span className="absolute left-2 top-0 h-5 w-5 rounded-full bg-white" />
          <span className="absolute left-6 top-0.5 h-6 w-7 rounded-full bg-white" />
        </div>
      </motion.div>

      {/* isola che fluttua */}
      <motion.div
        className="absolute inset-x-0 bottom-7"
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="relative mx-auto h-44 w-80 max-w-full">
          {/* blocco terra */}
          <div className="absolute inset-x-0 bottom-0 h-40 overflow-hidden rounded-[2.2rem] border border-black/10 shadow-2xl">
            {/* prato */}
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#9cc47c] to-[#82ad66]" />
            {/* terra */}
            <div className="absolute inset-x-0 top-16 bottom-0 bg-gradient-to-b from-[#8a6a4a] to-[#6e4f34]" />
            <div className="absolute inset-x-0 top-16 h-2 bg-[#6f9455]" />

            {/* torre con bandiera */}
            <motion.div
              className="absolute bottom-9 left-8"
              {...float(5, 0.4)}
            >
              <div className="relative w-12">
                <div className="flex justify-between">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="h-2 w-2.5 bg-[#c9c2b4]" />
                  ))}
                </div>
                <div className="h-20 w-12 bg-gradient-to-b from-[#d9d2c3] to-[#bfb6a3] ring-1 ring-black/5">
                  <span className="mx-auto mt-3 block h-2 w-2 rounded-[2px] bg-[#ffd97a] ring-1 ring-black/10" />
                  <span className="mx-auto mt-2 block h-2 w-2 rounded-[2px] bg-[#ffd97a] ring-1 ring-black/10" />
                </div>
                {/* asta + bandiera */}
                <div className="absolute -top-5 left-1/2 h-6 w-0.5 -translate-x-1/2 bg-stone-500">
                  <motion.span
                    className="absolute left-0.5 top-0 block h-2.5 w-4 origin-left bg-[var(--primary)]"
                    style={{ clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }}
                    animate={{ scaleX: [1, 0.75, 1], rotate: [0, -4, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
                <Smoke className="-top-4 left-3" />
              </div>
            </motion.div>

            {/* case */}
            <House w={16} wall="#f2d6b3" roof="#c96b4a" className="bottom-9 left-24" delay={0.6} />
            <House w={19} wall="#e9b284" roof="#7d3b2e" className="bottom-9 left-[8.6rem]" delay={1.1} />
            <House w={15} wall="#8a9b8e" roof="#a34a35" className="bottom-9 right-9" delay={1.7} />

            {/* alberi */}
            <Tree size={13} className="bottom-8 right-24" delay={0.3} />
            <Tree size={10} className="bottom-8 left-4" delay={1.3} />

            {/* stradina */}
            <div className="absolute bottom-0 left-1/2 h-9 w-14 -translate-x-1/2 bg-[#cbb79a]" />
          </div>

          {/* punta rocciosa sotto */}
          <div
            className="absolute inset-x-10 -bottom-3 h-8 bg-[#5d4229]"
            style={{ clipPath: 'polygon(0 0, 100% 0, 55% 100%, 45% 100%)' }}
          />
          <div
            className="absolute bottom-[-3.2rem] left-1/2 h-9 w-10 -translate-x-1/2 bg-[#4a3520]"
            style={{ clipPath: 'polygon(20% 0, 80% 0, 60% 100%, 40% 100%)' }}
          />
        </div>
      </motion.div>

      {/* ombra */}
      <motion.div
        className="absolute bottom-1 left-1/2 h-4 w-44 rounded-full bg-black/20 blur-md"
        animate={{ scale: [1, 0.82, 1], opacity: [0.5, 0.3, 0.5], x: '-50%' }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
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

  const submit = async (mode: 'login' | 'signup') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')

      // applica il tema salvato dell'account (se c'è)
      const savedAccent = (data.user as SessionUser)?.accentColor
      if (savedAccent) useWorld.getState().setAccent(savedAccent, false)
      else useWorld.getState().setAccent(useWorld.getState().accent, false)

      setUser(data.user as SessionUser)
      setView('dashboard')
      toast.success(
        mode === 'login' ? 'Bentornato! 👋' : 'Account creato, benvenuto! 🎉'
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  const headline = ['Costruisci', 'mondi', '3D.']

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
      <motion.div
        className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-[var(--site-blob)] blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -35, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
      {/* griglia a puntini */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(60,50,30,0.10) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />

      <main className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-10 px-4 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
        {/* ---------- hero ---------- */}
        <section className="text-center lg:text-left">
          <motion.div
            className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--primary-strong)] ring-1 ring-[var(--primary)]/25 backdrop-blur"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 16 }}
          >
            <motion.span
              animate={{ rotate: [0, 20, -12, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              🌍
            </motion.span>
            L&apos;hub per creare videogiochi
          </motion.div>

          <h1 className="text-5xl font-black leading-[1.06] tracking-tight text-stone-800 sm:text-6xl lg:text-[4.2rem]">
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
              className="animate-gradient-x inline-block bg-[linear-gradient(90deg,var(--primary-strong),var(--primary),var(--primary-strong))] bg-[length:200%_auto] bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.55,
                type: 'spring',
                stiffness: 210,
                damping: 17,
              }}
            >
              Giocaci dentro.
            </motion.span>
          </h1>

          <motion.p
            className="mx-auto mt-5 max-w-md text-lg text-stone-600 lg:mx-0"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
          >
            Costruisci il tuo mondo con un semplice clic: case, torri, strade
            e alberi prendono vita davanti ai tuoi occhi. Scegli i colori,
            carica i tuoi modelli 3D e quando tutto è pronto...{' '}
            <b>premi Gioca ed esplora il mondo da dentro</b>.
          </motion.p>

          <motion.div
            className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start"
            variants={CHIP_CONTAINER}
            initial="hidden"
            animate="show"
          >
            {[
              '🏗️ Costruzione facilissima',
              '🎨 Colori al clic',
              '⚔️ Il tuo cavaliere',
              '💾 Salvataggi automatici',
            ].map(t => (
              <motion.span
                key={t}
                variants={CHIP_ITEM}
                whileHover={{ scale: 1.06, y: -2 }}
                className="cursor-default rounded-full bg-white/85 px-3.5 py-1.5 text-sm font-medium text-stone-700 shadow-sm ring-1 ring-black/5"
              >
                {t}
              </motion.span>
            ))}
          </motion.div>

          <TownScene />
        </section>

        {/* ---------- card auth ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 36, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 120, damping: 17 }}
        >
          <Card className="w-full max-w-md rounded-3xl border-black/5 bg-white/90 shadow-2xl shadow-black/10 backdrop-blur lg:ml-auto">
            <CardHeader>
              <motion.div
                className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg"
                initial={{ rotate: -12, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.55, type: 'spring', stiffness: 220, damping: 12 }}
              >
                <span className="text-xl">🧱</span>
              </motion.div>
              <CardTitle className="text-center text-xl">
                Entra nel tuo hub
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                  />
                  <Button disabled={busy} onClick={() => submit('login')}>
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
                      placeholder="Il tuo nome"
                    />
                  </div>
                  <EmailPass
                    email={email}
                    password={password}
                    setEmail={setEmail}
                    setPassword={setPassword}
                  />
                  <Button disabled={busy} onClick={() => submit('signup')}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crea account
                  </Button>
                </TabsContent>
              </Tabs>
              <p className="mt-4 text-center text-xs text-stone-400">
                Tutto ciò che costruisci viene salvato nel tuo account.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <footer className="relative pb-6 text-center text-xs text-stone-400">
        darpon.m4trix — costruisci, gioca, sogna. 🏰
      </footer>
    </div>
  )
}

function EmailPass({
  email,
  password,
  setEmail,
  setPassword,
}: {
  email: string
  password: string
  setEmail: (v: string) => void
  setPassword: (v: string) => void
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
          placeholder="Almeno 6 caratteri"
          autoComplete={password.length ? 'current-password' : 'new-password'}
          onKeyDown={e => e.key === 'Enter' && void e}
        />
      </div>
    </>
  )
}
