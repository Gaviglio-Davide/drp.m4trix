'use client'

// ============================================================
// v20 — AI DEL MONDO (piccolo reparto AI del Game Studio)
// Console che vive DENTRO gli editor dei mondi: scrivi cosa
// vuoi e dove («inserisci un albero in 10,5», «metti 8 case
// tra -20,-20 e 20,20», «elimina tutti i nemici», «mondo
// 120x80») e il mondo lo esegue subito.
// Prima un parser italiano locale (istantaneo, offline); se la
// frase non è riconosciuta passa dall'Agente Darpx (/api/agent)
// che converte la richiesta in comando JSON.
// Usato da SceneEditor3D (mondi 3D) e RealisticStudio (Darpx).
// ============================================================

import { useRef, useState } from 'react'
import { fetchAuth } from '@/lib/http'

export type AiCmd =
  | { op: 'place'; asset: string; x: number; z: number; n: number }
  | { op: 'scatter'; asset: string; n: number; x: number; z: number; x2: number; z2: number }
  | { op: 'delete'; x: number; z: number }
  | { op: 'deleteAll'; asset: string }
  | { op: 'resize'; w: number; h: number }
  | { op: 'help' }

type LogRow = { role: 'user' | 'ai' | 'err'; text: string }

// ---------------- utilità testo ----------------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const NUM = String.raw`(-?\d+(?:[.,]\d+)?)`
// v20-fix: COORD DEVE restare una stringa: dentro new RegExp il
// toString di un RegExp inserirebbe gli slash literal e romperebbe tutto
const COORD = String.raw`${NUM}\s*[,;x× ]\s*${NUM}`
const VERBS = String.raw`(?:inserisci|inserire|aggiungi|aggiungere|piazza|piazzami|piazzare|metti|metterci|posa|posare|crea|creami|genera|fai|spargi|distribuisci)`
const NUMW = String.raw`(?:un|una|uno|il|lo|la|i|gli|le|(\d+))?\s*`

/** sinonimi italiani comuni (albero→Abete, fuoco→Falò, ecc.) */
const SINONIMI: Record<string, string> = {
  albero: 'Abete', alberi: 'Abete', pino: 'Abete', pini: 'Abete', abete: 'Abete', abeti: 'Abete', pineta: 'Abete',
  cespuglio: 'Cespuglio', cespugli: 'Cespuglio', arbusto: 'Cespuglio', arbusti: 'Cespuglio', macchia: 'Cespuglio',
  cassa: 'Cassa', casse: 'Cassa', baule: 'Cassa', bauli: 'Cassa', scatola: 'Cassa', scatole: 'Cassa',
  barile: 'Barile', barili: 'Barile', botte: 'Barile', botti: 'Barile',
  fuoco: 'Falò', falo: 'Falò', campeggio: 'Falò', bonfire: 'Falò', falò: 'Falò',
  soldato: 'Soldato', nemico: 'Zombie', nemici: 'Zombie', mostro: 'Zombie', mostri: 'Zombie', zombie: 'Zombie',
  moneta: 'Moneta', monete: 'Moneta', oro: 'Moneta',
  pozione: 'Pozione', pozioni: 'Pozione',
  chiave: 'Chiave', chiavi: 'Chiave',
  png: 'PNG (parla)', persona: 'PNG (parla)', persone: 'PNG (parla)', abitante: 'PNG (parla)', abitanti: 'PNG (parla)', npc: 'PNG (parla)',
  eroe: 'Partenza eroe', spawn: 'Partenza eroe', partenza: 'Partenza eroe', inizio: 'Partenza eroe',
  portale: 'Portale obiettivo', uscita: 'Portale obiettivo', traguardo: 'Portale obiettivo',
  roccia: 'Roccia', rocce: 'Roccia', sasso: 'Roccia', sassi: 'Roccia',
  muro: 'Muro', muri: 'Muro',
}

/** trova l'asset che combacia meglio con il testo scritto */
export function fuzzyAsset(text: string, assets: { label: string }[]): string | null {
  const t = norm(text)
  if (!t) return null
  // 1) sinonimi (parola intera o dentro la frase)
  for (const [word, target] of Object.entries(SINONIMI)) {
    if (new RegExp(`(^|\\s)${word}(\\s|$)`).test(t) && assets.some(a => a.label === target)) return target
  }
  let best: string | null = null
  let bestScore = 0
  for (const a of assets) {
    const n = norm(a.label)
    if (!n) continue
    let score = 0
    if (t === n) score = 100
    else if (t.includes(n) || n.includes(t)) score = 80
    else {
      // parole chiave in comune
      const tw = t.split(' ').filter(w => w.length > 2)
      const nw = n.split(' ').filter(w => w.length > 2)
      const hit = tw.filter(w => nw.some(v => v.startsWith(w) || w.startsWith(v))).length
      score = hit * 30
    }
    if (score > bestScore) {
      bestScore = score
      best = a.label
    }
  }
  return bestScore >= 30 ? best : null
}

// ---------------- parser italiano locale ----------------

export function parseAiCommand(raw: string, assets: { label: string }[]): AiCmd | null {
  const t = norm(raw)
  if (!t) return null

  // aiuto
  if (/^(aiuto|help|comandi|come funziona)/.test(t)) return { op: 'help' }

  // mondo 120x80 / mondo 120 per 80
  const mWorld = t.match(new RegExp(String.raw`mondo\s*${NUM}\s*(?:x|×|per|da)\s*${NUM}`))
  if (mWorld) {
    return { op: 'resize', w: Math.round(parseFloat(mWorld[1].replace(',', '.'))), h: Math.round(parseFloat(mWorld[2].replace(',', '.'))) }
  }

  // sparga N asset tra x1,z1 e x2,z2
  const mScatter = t.match(
    new RegExp(String.raw`${VERBS}\s+${NUMW}(\d+)\s+(.*?)\s+(?:tra|fra|in area|nell'area|nella zona|nella zona tra)\s*${COORD}\s*(?:e|ed|a|fino a)\s*${COORD}`)
  )
  if (mScatter) {
    const asset = fuzzyAsset(mScatter[3], assets)
    if (asset) {
      return {
        op: 'scatter',
        asset,
        n: Math.min(200, Math.max(1, parseInt(mScatter[2], 10))),
        x: parseFloat(mScatter[4].replace(',', '.')),
        z: parseFloat(mScatter[5].replace(',', '.')),
        x2: parseFloat(mScatter[6].replace(',', '.')),
        z2: parseFloat(mScatter[7].replace(',', '.')),
      }
    }
  }

  // inserisci (un|N) asset in x,z
  const mPlace = t.match(
    new RegExp(String.raw`${VERBS}\s+${NUMW}(.*?)\s*(?:in|a|su|presso|alle coordinate|alla coordinate|coordinate|coords|nella posizione|nella cella|nella zona di)\s*${COORD}`)
  )
  if (mPlace) {
    const nWord = mPlace[1] // articolo o quantitativo (può essere undefined)
    const n = nWord && /^\d+$/.test(nWord) ? Math.min(50, Math.max(1, parseInt(nWord, 10))) : 1
    const asset = fuzzyAsset(mPlace[2], assets)
    if (asset) {
      return {
        op: 'place',
        asset,
        x: parseFloat(mPlace[3].replace(',', '.')),
        z: parseFloat(mPlace[4].replace(',', '.')),
        n,
      }
    }
  }

  // elimina in x,z
  const mDel = t.match(new RegExp(String.raw`(?:elimina|rimuovi|togli|cancella|sposta via)\s+(?:.*)?\s*in\s*${COORD}`))
  if (mDel) {
    return { op: 'delete', x: parseFloat(mDel[1].replace(',', '.')), z: parseFloat(mDel[2].replace(',', '.')) }
  }

  // elimina tutti gli X
  const mDelAll = t.match(new RegExp(String.raw`(?:elimina|rimuovi|togli|cancella)\s+(?:tutti|tutte|tutto)\s*(?:gli|le|i|l')?\s*(.*)`))
  if (mDelAll) {
    const asset = fuzzyAsset(mDelAll[1], assets)
    if (asset) return { op: 'deleteAll', asset }
  }

  return null
}

// ---------------- fallback LLM via /api/agent ----------------

async function aiConvert(text: string, assets: { label: string }[]): Promise<AiCmd | null> {
  const assetList = assets.slice(0, 60).map(a => a.label).join(' | ')
  const prompt = [
    `Sei il convertitore di comandi dell'editor di mondi 3D.`,
    `Converti la richiesta dell'utente in UN SOLO comando JSON, senza altro testo.`,
    `Formati possibili:`,
    `{"op":"place","asset":"<nome>","x":numero,"z":numero,"n":1}`,
    `{"op":"scatter","asset":"<nome>","n":quanti,"x":x1,"z":z1,"x2":x2,"z2":z2}`,
    `{"op":"delete","x":numero,"z":numero}`,
    `{"op":"deleteAll","asset":"<nome>"}`,
    `{"op":"resize","w":metri,"h":metri}`,
    `Asset disponibili: ${assetList}`,
    `Se l'asset richiesto non esiste, scegli il più simile. Coordinate in metri.`,
    `Richiesta: "${text}"`,
  ].join('\n')
  const res = await fetchAuth('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt }),
  })
  const data = await res.json().catch(() => ({}))
  const reply: string = typeof data.reply === 'string' ? data.reply : typeof data.message === 'string' ? data.message : ''
  const m = reply.match(/\{[^{}]*\}/)
  if (!m) return null
  try {
    const cmd = JSON.parse(m[0]) as AiCmd
    const ops = ['place', 'scatter', 'delete', 'deleteAll', 'resize']
    if (ops.includes(cmd.op)) return cmd
    return null
  } catch {
    return null
  }
}

// ---------------- componente ----------------

const ESEMPI = [
  'inserisci un albero in 10,5',
  'metti 8 case tra -20,-20 e 20,20',
  'elimina tutti i nemici',
  'mondo 120x80',
]

export default function AiWorldConsole({
  assets,
  exec,
  title = '🤖 AI del Mondo',
  hint = 'Scrivi cosa piazzare e dove: lo fa per te.',
}: {
  assets: { label: string }[]
  exec: (cmd: AiCmd) => string
  title?: string
  hint?: string
}) {
  const [text, setText] = useState('')
  const [log, setLog] = useState<LogRow[]>([
    { role: 'ai', text: 'Scrivi un comando (es. «inserisci un albero in 10,5»). Scrivi «aiuto» per tutti i comandi.' },
  ])
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const push = (row: LogRow) => setLog(prev => [...prev.slice(-40), row])

  const run = async (raw?: string) => {
    const txt = (raw ?? text).trim()
    if (!txt || busy) return
    push({ role: 'user', text: txt })
    setText('')
    setBusy(true)
    try {
      let cmd = parseAiCommand(txt, assets)
      if (!cmd && !/^(aiuto|help|comandi)/.test(norm(txt))) {
        // il parser locale non ha capito: chiede all'Agente Darpx
        push({ role: 'ai', text: '… lo chiedo all\'Agente Darpx 🧠' })
        cmd = await aiConvert(txt, assets)
        if (!cmd) {
          push({ role: 'err', text: 'Non ho capito. Prova: «inserisci un albero in 10,5» oppure «aiuto».' })
          return
        }
      }
      if (!cmd) {
        push({ role: 'err', text: 'Comando non riconosciuto. Scrivi «aiuto».' })
        return
      }
      const out = exec(cmd)
      push({ role: 'ai', text: out })
    } catch (e) {
      push({ role: 'err', text: e instanceof Error ? e.message : 'Comando fallito' })
    } finally {
      setBusy(false)
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      }, 20)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--neon)] bg-[var(--panel-soft)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-2.5 py-1.5">
        <p className="neon-text text-[11px] font-bold tracking-[0.16em] uppercase">{title}</p>
        <button
          className="cp-chip text-[10px]"
          title="Cancella la cronologia"
          onClick={() => setLog(log.slice(-1))}
        >
          ✕
        </button>
      </div>
      <div className="px-2.5 py-1.5">
        <p className="mb-1.5 text-[10px] leading-tight text-[var(--tx-faint)]">{hint}</p>
        <div ref={logRef} className="mb-1.5 max-h-36 overflow-y-auto rounded-lg bg-black/25 px-2 py-1.5">
          {log.map((r, i) => (
            <p
              key={i}
              className={`mb-1 break-words text-[11px] leading-snug ${
                r.role === 'user'
                  ? 'text-[var(--tx)]'
                  : r.role === 'err'
                    ? 'text-red-400'
                    : 'text-[var(--neon)]'
              }`}
            >
              {r.role === 'user' ? '▸ ' : r.role === 'err' ? '✖ ' : '🤖 '}
              {r.text}
            </p>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void run()
            }}
            placeholder='es. inserisci un albero in 10,5'
            className="h-7 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]"
          />
          <button
            className="cp-chip cp-chip-active shrink-0 font-bold"
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? '…' : '▶'}
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ESEMPI.map(s => (
            <button
              key={s}
              className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--tx-dim)] transition-colors hover:border-[var(--neon)] hover:text-[var(--neon)]"
              onClick={() => void run(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
