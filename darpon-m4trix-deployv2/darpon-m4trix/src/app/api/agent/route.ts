import { NextRequest, NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { decryptSecret } from '@/lib/encrypt'

export const runtime = 'nodejs'
export const maxDuration = 30

// ============================================================
// Agente Darpx — cervello LLM lato server (opzionale).
// Il cervello locale (agent-brain.ts) risponde subito nel
// browser; quando non è sicuro passa la domanda qui.
// Fonti del modello, in ordine:
//   1. z-ai-web-dev-sdk (se configurato nell'ambiente)
//   2. endpoint OpenAI-compatibile impostato dall'admin
//      (SiteConfig "aiConfig": chiave + baseUrl + modello)
//   3. risposta di cortesia senza LLM
// Nessuna chiave passa mai dal browser.
// ============================================================

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT = `Sei l'Agente Darpx, l'assistente AI integrato nel sito darpon.m4trix, un hub italiano per creare videogiochi 3D nel browser.

REGOLE:
- Rispondi SEMPRE in italiano, in modo diretto e amichevole.
- Sii conciso: massimo 10 righe. Usa elenchi con "•" quando servono passi.
- Non inventare MAI funzioni che non esistono. Usa solo quelle elencate qui sotto.
- Se la richiesta è fuori tema (non riguarda il sito), rispondi brevemente e riporta il discorso su darpon.m4trix.

COSA SA FARE IL SITO:
- I MIEI MONDI: progetti 3D; si creano con "Nuovo progetto"; ogni mondo si apre nell'editor.
- EDITOR: si piazza ciò che si vuole con un clic. RESA REALISTICA v7: edifici con zoccoli in pietra, tetti in coppi, finestre con telaio, texture procedurali. Tasto DESTRO trascinato = ruota la visuale; rotella = zoom; click destro secco = elimina oggetto; Ctrl+Z o freccia = annulla; pennelli TERRENO: Montagna (alza), Pala (scava: sotto il livello dell'acqua compare un lago), Gomma (spiana), Mano (oggetti); bottone GIOCA = terza persona (WASD, corsa con Shift); cieli personalizzati; salvataggio automatico + snapshot; legenda oggetti; scelta del personaggio (eroe realistico o modelli GLB).
- GENERA: città medievali, villaggi, fortezze, paesaggi con dimensione, densità e variante (dado) regolabili; piazze con fontana, panchine, aiuole e giardini con recinzioni e siepi.
- PROGETTI IMPORTATI: caricamento file .glb/.gltf (i .meshy cifrati non vanno); dimensione predefinita 0,5x–3x; ANTEPRIMA 3D con occhio 👁️; i modelli finiscono nella barra oggetti di ogni mondo.
- STRUTTURE: costruttore pezzo per pezzo con muri, porte e finestre SUL BORDO delle celle (simmetria perfetta); pezzi da ESTERNO stile HomeByMe: recinzione, siepe, vialetto, aiuola, panchina; libreria riutilizzabile in ogni mondo.
- DARPX.AI: (a) MOTORE INTERNO testo→3D: genera modelli nel browser, senza chiavi e senza limiti; capisce italiano (specie, colori, materiali, taglia, dettagli); PRIMA DI GENERARE chiede i dettagli mancanti (colore, taglia, materiale, dettagli) con possibilità di saltare; ogni richiesta produce un modello DIVERSO; texture PBR realistiche. (b) LABORATORIO GLB: migliora i modelli che l'utente ha già: tinta, materiali PBR (oro, ferro, legno, pietra...), ali, corna, basamento, aura, ridimensionamento; (c) IMMAGINE → MONDO: analizza un'immagine e crea un mondo 3D coerente, con opzione "usa come cielo"; (d) MOTORI ESTERNI opzionali: Tripo, fal.ai, Stable Fast 3D, Meshy con chiave API salvata cifrata; (e) AGENTE DARPX: te stesso, con avatar animato che cammina e viaggia per il sito.
- ACCOUNT: nome, tema colore (16 temi), cambio password; tutto è privato.

FORMATTAZIONE: puoi usare i grassetti con **testo** e "•" per le liste. Niente titoli markdown.`

// ---- configurazione AI dell'admin (SiteConfig, cifrata) ----

type AIConfig = { baseUrl?: string; apiKey?: string; model?: string }

async function readAIConfig(): Promise<AIConfig | null> {
  try {
    await ensureSchemaOnce().catch(() => {})
    const row = await db.siteConfig.findUnique({ where: { key: 'aiConfig' } })
    if (!row) return null
    const parsed = JSON.parse(row.value) as Record<string, string>
    const out: AIConfig = {}
    if (parsed.baseUrl) out.baseUrl = parsed.baseUrl
    if (parsed.model) out.model = parsed.model
    if (parsed.apiKey) {
      const k = decryptSecret(parsed.apiKey)
      if (k) out.apiKey = k
    }
    return out.apiKey ? out : null
  } catch {
    return null
  }
}

// ---- provider 1: z-ai-web-dev-sdk ----

async function tryZai(history: ChatMessage[]): Promise<string | null> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: SYSTEM_PROMPT },
        ...history.slice(-10),
      ],
      thinking: { type: 'disabled' },
    })
    const text = completion.choices[0]?.message?.content
    return text && text.trim() ? text.trim() : null
  } catch {
    return null
  }
}

// ---- provider 2: endpoint OpenAI-compatibile ----

async function tryOpenAI(cfg: AIConfig, history: ChatMessage[]): Promise<string | null> {
  try {
    const base = (cfg.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.slice(-10),
        ],
        max_tokens: 700,
        temperature: 0.6,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = data.choices?.[0]?.message?.content
    return text && text.trim() ? text.trim() : null
  } catch {
    return null
  }
}

// ---- limite di utilizzo (in-memory) ----

const hits = new Map<string, { count: number; reset: number }>()

function rateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = hits.get(userId)
  if (!entry || entry.reset < now) {
    hits.set(userId, { count: 1, reset: now + 5 * 60 * 1000 })
    return true
  }
  entry.count += 1
  return entry.count <= 30
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  if (!rateLimit(user.id)) {
    return NextResponse.json(
      { error: 'Troppe richieste: riprova tra qualche minuto' },
      { status: 429 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string
    history?: ChatMessage[]
  }
  const message = String(body.message ?? '').trim().slice(0, 800)
  if (!message) {
    return NextResponse.json({ error: 'Messaggio vuoto' }, { status: 400 })
  }
  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          m =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.trim()
        )
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : []

  // 1) z-ai (ambiente configurato) 2) OpenAI-compatibile (admin)
  let answer = await tryZai(history.length ? [...history, { role: 'user', content: message }] : [{ role: 'user', content: message }])
  let engine: 'zai' | 'openai' | 'none' = 'zai'
  if (!answer) {
    const cfg = await readAIConfig()
    if (cfg) {
      answer = await tryOpenAI(cfg, [
        ...history,
        { role: 'user', content: message },
      ])
      if (answer) engine = 'openai'
    }
  }
  if (!answer) engine = 'none'

  if (!answer) {
    answer = [
      'Al momento il mio cervello "potenziato" non è attivo su questo sito, ma posso comunque aiutarti subito:',
      '• «crea un mondo medievale grande» → lo genero e lo apro',
      '• «genera un drago» → preparo il modello 3D',
      '• «come si ruota la visuale?» → spiego ogni funzione del sito',
      '',
      "Per attivare le risposte avanzate, l'admin può configurare una chiave AI dal pannello admin (sezione Agente AI).",
    ].join('\n')
  }

  return NextResponse.json({ answer, engine })
}
