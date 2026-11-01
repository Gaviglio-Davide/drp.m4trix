// ============================================================
// GAMESMITH — analisi della sceneggiatura (italiano, tollerante
// ai refusi con distanza di Levenshtein) per il reparto
// "Crea da Script". Il gioco vero e proprio lo costruisce
// generate.ts.
// ============================================================

import type { EntityKind, Objective, PaletteId } from '@/lib/game2d/types'

export type ScriptAnalysis = {
  title: string
  protagonist: string
  paletteId: PaletteId
  settingLabel: string
  enemyKinds: EntityKind[]
  weapon: 'spada' | 'blaster'
  objective: Objective
  size: 'piccolo' | 'medio' | 'grande'
  difficulty: 1 | 2 | 3
  enemyCount: number
  boss: boolean
  dialogues: string[]
  found: string[] // etichette rilevate, per la UI
  raw: string
}

// ---------- utilità fuzzy ----------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function lev(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return prev[n]
}

/** il testo contiene la parola (o una sua variante con 1-2 refusi)? */
function hasWord(text: string, word: string): boolean {
  if (text.includes(word)) return true
  const tol = word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0
  if (tol === 0) return false
  const words = text.split(' ')
  for (const w of words) {
    if (Math.abs(w.length - word.length) > tol) continue
    if (lev(w, word) <= tol) return true
  }
  return false
}

function hasAny(text: string, words: string[]): string | null {
  for (const w of words) if (hasWord(text, w)) return w
  return null
}

// ---------- lessico ----------

const SETTINGS: { id: PaletteId; label: string; words: string[] }[] = [
  {
    id: 'cyber',
    label: 'Città Neon',
    words: ['cyber', 'cyberpunk', 'neon', 'robot', 'droni', 'drone', 'cyborg', 'metropoli', 'megacorp', 'sindacato', 'ologramma', 'asfalto', 'grattacieli', 'sottostrada', 'chopper', 'implant', 'impianti', 'hologramma', 'synth'],
  },
  {
    id: 'fantasy',
    label: 'Regno di Pietra',
    words: ['castello', 'dragone', 'drago', 'magia', 'mago', 'spada', 'cavaliere', 'reame', 'regno', 'villaggio', 'foresta', 'bosco', 'golem', 'dungeon', 'cripta', 'fortezza', 'principessa', 'orchi', 'goblin', 'spada leggendaria', 'leggenda'],
  },
  {
    id: 'horror',
    label: 'Zona Morta',
    words: ['zombie', 'zombi', 'non morti', 'infetti', 'mansion', 'villa abbandonata', 'oscurita', 'terrore', 'bunker', 'laboratorio', 'infezione', 'virus', 'contagio', 'fantasma', 'demone', ' incubo', 'morte'],
  },
  {
    id: 'spazio',
    label: 'Pianeta Alieno',
    words: ['spazio', 'spaziale', 'alieni', 'alieno', 'pianeta', 'navicella', 'astronave', 'galassia', 'orbita', 'marziani', 'xeno', 'caverna cristallina', 'meteora', 'astrale'],
  },
  {
    id: 'deserto',
    label: 'Rovine nel Deserto',
    words: ['deserto', 'sabbia', 'rovine', 'oasi', 'dune', 'carovana', 'piramidi', 'tempio', 'faraone', 'scorpioni'],
  },
]

const ENEMY_WORDS: { kind: EntityKind; words: string[] }[] = [
  { kind: 'drone', words: ['droni', 'drone', 'robot', 'sentinelle', 'macchine', 'droidi'] },
  { kind: 'soldato', words: ['soldati', 'soldato', 'mercenari', 'guardie', 'banditi', 'sicari', 'pirati', 'orchi', 'goblin', 'banda'] },
  { kind: 'zombie', words: ['zombie', 'zombi', 'infetti', 'ghoul', 'non morti', 'morti viventi'] },
  { kind: 'slime', words: ['slime', 'melme', 'blob', 'gelatina', 'mutanti'] },
  { kind: 'guardiano', words: ['guardiani', 'guardiano', 'custodi', 'custode', 'colossi', 'cavaliere nero'] },
  { kind: 'golem', words: ['golem', 'titan', 'titano', 'colosso'] },
  { kind: 'ratto', words: ['ratti', 'ratto', 'parassiti', 'sciami', 'topi'] },
  { kind: 'turret', words: ['torrette', 'torretta', 'cannoni automatici', 'sentrerie'] },
  { kind: 'boss', words: ['boss', 'capo', 'signore', 'leader', 'generale', 'dragone', 'drago', 're malvagio', 'tiranno'] },
]

const MELEE_WORDS = ['spada', 'katana', 'lama', 'martello', 'mazza', 'ascia', 'pugni', 'coltello', 'alabarda']
const GUN_WORDS = ['pistola', 'blaster', 'fucile', 'laser', 'raggio', 'arma da fuoco', 'revolver', 'fucile al plasma', 'sparo']

export function analyzeScript(raw: string): ScriptAnalysis {
  const text = norm(raw)
  const found: string[] = []

  // ---- ambientazione ----
  let paletteId: PaletteId = 'cyber'
  let settingLabel = 'Città Neon'
  let bestScore = 0
  for (const s of SETTINGS) {
    let score = 0
    for (const w of s.words) if (hasWord(text, w)) score++
    if (score > bestScore) {
      bestScore = score
      paletteId = s.id
      settingLabel = s.label
    }
  }
  if (bestScore > 0) found.push(`Ambientazione: ${settingLabel}`)

  // ---- nemici ----
  const enemyKinds: EntityKind[] = []
  for (const e of ENEMY_WORDS) {
    if (e.kind === 'boss') continue
    if (hasAny(text, e.words)) {
      if (!enemyKinds.includes(e.kind)) enemyKinds.push(e.kind)
    }
  }
  if (enemyKinds.length === 0) {
    // default per ambientazione
    enemyKinds.push(
      paletteId === 'cyber' ? 'drone' : paletteId === 'horror' ? 'zombie' : paletteId === 'spazio' ? 'slime' : paletteId === 'deserto' ? 'ratto' : 'soldato'
    )
  }
  found.push(`Nemici: ${enemyKinds.join(', ')}`)

  // ---- boss ----
  const boss = !!hasAny(text, ['boss', 'capo finale', 'signore', 'leader', 'generale', 'dragone', 'drago', 'tiranno', 're malvagio', 'colosso finale'])

  // ---- arma ----
  let weapon: 'spada' | 'blaster' = paletteId === 'cyber' ? 'blaster' : 'spada'
  if (hasAny(text, GUN_WORDS)) weapon = 'blaster'
  if (hasAny(text, MELEE_WORDS)) weapon = 'spada'
  found.push(`Arma: ${weapon === 'blaster' ? 'blaster' : 'spada'}`)

  // ---- obiettivo ----
  let objective: Objective = 'goal'
  if (boss) objective = 'boss'
  if (hasAny(text, ['recupera', 'recuperare', 'chiavi', 'chiave', 'reperti', 'cristalli', 'cristallo', 'colleziona', 'reliquia', 'reliquie', 'dati', 'chip'])) {
    objective = 'collezione'
  }
  found.push(
    `Obiettivo: ${objective === 'boss' ? 'elimina il boss' : objective === 'collezione' ? 'recupera gli oggetti' : 'raggiungi il portale'}`
  )

  // ---- dimensione ----
  let size: ScriptAnalysis['size'] = 'medio'
  if (hasAny(text, ['piccolo', 'piccola', 'breve', 'veloce', 'rapido'])) size = 'piccolo'
  if (hasAny(text, ['grande', 'enorme', 'immense', 'immenso', 'vasto', 'gigante', 'epico', 'lungo'])) size = 'grande'
  found.push(`Mappa: ${size}`)

  // ---- difficoltà ----
  let difficulty: 1 | 2 | 3 = 2
  if (hasAny(text, ['facile', 'tranquillo', 'relax', 'per bambini'])) difficulty = 1
  if (hasAny(text, ['difficile', 'estremo', 'inferno', 'impossibile', 'brutale', 'nightmare'])) difficulty = 3
  found.push(`Difficoltà: ${['facile', 'normale', 'difficile'][difficulty - 1]}`)

  // ---- numero nemici ----
  const sizeBase = size === 'piccolo' ? 6 : size === 'grande' ? 16 : 10
  let enemyCount = sizeBase
  if (hasAny(text, ['molti nemici', 'orda', 'sciame', 'migliaia'])) enemyCount = Math.round(sizeBase * 1.6)
  if (hasAny(text, ['pochi nemici', 'poche guardie'])) enemyCount = Math.max(3, Math.round(sizeBase * 0.5))

  // ---- protagonista ----
  let protagonist = 'Eroe'
  const pm = raw.match(/mi chiamo\s+([A-Za-zÀ-ú']+)/i) ||
    raw.match(/protagonista\s+(?:si\s+chiama|chiamato|chiamata|e[’']?)\s+([A-Za-zÀ-ú']+)/i) ||
    raw.match(/(?:eroe|eroina|eroe che si chiama)\s+([A-Z][a-zÀ-ú]+)/)
  if (pm) {
    protagonist = pm[1].charAt(0).toUpperCase() + pm[1].slice(1)
    found.push(`Protagonista: ${protagonist}`)
  }

  // ---- titolo ----
  let title = ''
  const tm = raw.match(/si chiama\s+["“']([^"”']{2,60})["”']/i) ||
    raw.match(/titolo[:\s]+["“']?([^"”'\.\n]{2,60})["”']?/i) ||
    raw.match(/il gioco\s+(?:si\s+chiama|e[’']?)\s+["“']?([^"”'\.\n]{2,60})["”']?/i)
  if (tm) title = tm[1].trim()
  if (!title) title = `${settingLabel}: Protocollo ${String.fromCharCode(65 + (Math.floor(Math.random() * 26)))}`

  // ---- dialoghi: frasi dell'utente riutilizzate nel gioco ----
  const sentences = raw
    .split(/(?<=[\.\!\?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length >= 18 && s.length <= 220)
  const dialogues = sentences.slice(0, 3)
  if (dialogues.length) found.push(`Dialoghi dallo script: ${dialogues.length}`)

  return {
    title,
    protagonist,
    paletteId,
    settingLabel,
    enemyKinds,
    weapon,
    objective,
    size,
    difficulty,
    enemyCount,
    boss: boss || difficulty === 3,
    dialogues,
    found,
    raw,
  }
}
