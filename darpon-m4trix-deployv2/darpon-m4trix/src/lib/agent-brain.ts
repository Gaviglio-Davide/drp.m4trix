'use client'

// ============================================================
// Agente Darpx — cervello locale (CLIENT, istantaneo, zero costi)
// Riconosce l'intenzione dell'utente in millisecondi e sa fare
// AZIONI concrete: cambiare reparto, precompilare la creazione
// 3D, generare un mondo. Per le domande complesse passa la palla
// al cervello LLM lato server (vedi /api/agent).
// ============================================================

import type { GenKind, GenSize } from '@/lib/worldgen'
import type { DashboardTab } from '@/lib/ui-store'

export type AgentAction =
  | { type: 'navigate'; tab: DashboardTab }
  | { type: 'prefill3d'; prompt: string }
  | { type: 'createWorld'; kind: GenKind; size: GenSize; density: number }
  | { type: 'none' }

export type AgentReply = {
  text: string
  action: AgentAction
  suggestions: string[]
  confidence: number // 0..1: sotto 0.55 il client chiede anche al server
}

// ---------- normalizzazione ----------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const has = (t: string, ...words: string[]) => words.some(w => t.includes(w))

// ---------- base di conoscenza del sito ----------

const KB: { keys: string[]; title: string; body: string[] }[] = [
  {
    keys: ['ruota la visuale', 'ruotare la visuale', 'girare la visuale', 'girare la camera', 'visuale', 'camera', 'punto di vista'],
    title: '🖼️ Ruotare la visuale nell\'editor',
    body: [
      '• Tasto DESTRO del mouse + trascina = ruota la visuale in ogni direzione',
      '• Rotella del mouse = zoom avanti/indietro',
      '• Su cellulare: due dita per ruotare e pizzicare per lo zoom',
      '• Il bottone 📷 (macchina fotografica) attiva la vecchia modalità camera',
      '• Click destro SECCO su un oggetto lo elimina',
    ],
  },
  {
    keys: ['terreno', 'collina', 'montagna alza', 'scavare', 'scava', 'lago', 'valle', 'spiana'],
    title: '⛰️ Sculptare il terreno',
    body: [
      'Nella barra terreno dell\'editor trovi i pennelli:',
      '• ⛰️ Montagna = alza colline · 🥄 Pala = scava valli',
      '• 🧽 Gomma = spiana · ✋ Mano = torna a piazzare oggetti',
      '• Slider: diametro del pennello e forza',
      '• Scavando sotto il livello dell\'acqua compare un LAGHETTO vero 🏞️',
      '• «Azzera» riporta il terreno piatto · in Gioca cammini sui dislivelli',
    ],
  },
  {
    keys: ['giocare', 'gioca', 'modalita giocatore', 'esplorare', 'in prima persona', 'camminare'],
    title: '🎮 Giocare dentro il mondo',
    body: [
      '• Premi il bottone GIOCA nell\'editor per entrare in prima persona',
      '• WASD o frecce = muoversi · SPAZIO = salto · mouse = guardarsi intorno',
      '• Cammini sulle strade, sui dislivelli del terreno e dentro le creazioni',
      '• Il bottone ESCI (o tasto Esc) ti riporta all\'editor',
      '• Puoi scegliere il personaggio con cui giocare dal bottone apposito',
    ],
  },
  {
    keys: ['salvare', 'salvataggio', 'salva', 'snapshot', 'versioni', 'autosalvataggio'],
    title: '💾 Salvataggi',
    body: [
      '• Il mondo si salva in automatico mentre lavori (vedi lo stato in alto)',
      '• Con il bottone Cronologia/Salvataggi crei SNAPSHOT con nome: versioni a cui tornare quando vuoi',
      '• I progetti sono tutti nella home, reparto «I miei mondi»',
    ],
  },
  {
    keys: ['importare modello', 'importare un modello', 'caricare modello', 'caricare un modello', 'importa', 'glb', 'gltf', 'file 3d', 'modelli importati', 'progetti importati'],
    title: '📦 Importare modelli 3D',
    body: [
      '• Home → reparto «Progetti importati» → bottone Importa modelli',
      '• Si possono caricare file .glb e .gltf (anche molti insieme)',
      '• Occhio ai file .meshy: sono cifrati, servono i GLB scaricati',
      '• Con l\'occhio 👁️ apri l\'ANTEPRIMA 3D: ruota, wireframe, statistiche e download',
      '• I modelli finiscono automaticamente nella barra oggetti di OGNI tuo mondo',
      '• La dimensione (0,5x…3x) si sceglie nella lista e vale per i nuovi piazzamenti',
    ],
  },
  {
    keys: ['non vedo', 'non si vede', 'invisibile', 'scomparso', 'non trovo il modello', 'modello non appare'],
    title: '🔍 Un modello non si vede?',
    body: [
      'Controlla in questo ordine:',
      '• Reparto «Progetti importati»: il file è nella lista? Se no, l\'upload non è finito',
      '• Premi l\'occhio 👁️: l\'anteprima 3D ti dice subito se il file è leggibile o corrotto',
      '• Nell\'editor, apri la barra oggetti: i tuoi modelli stanno in fondo, con l\'icona 📦',
      '• Se il file è corrotto l\'anteprima lo segnala: scaricalo di nuovo dalla fonte',
    ],
  },
  {
    keys: ['struttura', 'strutture', 'costruttore di case', 'pezzi', 'strutturelab'],
    title: '🏗️ Reparto Strutture',
    body: [
      '• Home → «Strutture»: progetti edifici pezzo per pezzo su una griglia 3D',
      '• Pavimenti, muri, tetti, porte e finestre colorabili, su più piani',
      '• Le strutture salvate finiscono nella barra oggetti di ogni mondo come oggetti unici',
      '• Puoi duplicarle, rinominarle e riutilizzarle quanti volte vuoi',
    ],
  },
  {
    keys: ['immagine', 'foto', 'dalla foto', 'mondo da un\'immagine', 'mondo da una immagine', 'world labs'],
    title: '🖼️ Darpx.ai · Immagine → Mondo',
    body: [
      '• Home → «Darpx.ai» → carica una qualsiasi immagine',
      '• Darpx la analizza (colori, luce, paesaggio) e costruisce un mondo 3D coerente: colline, laghi, boschi',
      '• Se l\'immagine è notturna aggiunge lampioni; se è dominata dal blu fa un lago grande',
      '• Spunta «usa anche come cielo» per farne il panorama del mondo',
    ],
  },
  {
    keys: ['testo', 'creare un personaggio', 'personaggio 3d', 'mostro', 'drago', '3d da testo', 'meshy', 'tripo', 'hunyuan', 'stable fast', 'chiave api', 'motore 3d'],
    title: '🧊 Darpx.ai · Testo o Immagine → 3D',
    body: [
      '• Home → «Darpx.ai» → sezione «Testo o Immagine → 3D»',
      '• Motori disponibili: Tripo, fal.ai (Hunyuan 3D), Stable Fast 3D e Meshy: se uno si blocca, passa al successivo in automatico',
      '• Serve una chiave API gratuita del motore che preferisci (la salvi una volta, cifrata nel database)',
      '• Puoi anche partire da un\'IMMAGINE: Darpx crea il modello 3D corrispondente',
      '• Il modello finisce in «Progetti importati» con anteprima 👁️ e nella barra oggetti dell\'editor',
    ],
  },
  {
    keys: ['chi sei', 'cos\'è darpx', 'cos\'e darpx', 'darpx', 'agente', 'come ti chiami', 'chi ti ha creato'],
    title: '✨ Sono l\'Agente Darpx',
    body: [
      'Sono l\'assistente AI integrato nel sito: rispondo subito e faccio cose concrete:',
      '• «crea un mondo medievale grande» → lo genero e te lo apro',
      '• «genera un drago» → preparo la creazione 3D in Darpx.ai',
      '• «vai alle strutture» → cambio reparto per te',
      '• «come si ruota la visuale?» → ti spiego tutto del sito',
      'Chiedimi qualsiasi cosa del sito: conosco ogni reparto a memoria 💪',
    ],
  },
  {
    keys: ['tema', 'colore del sito', 'accento', 'profilo', 'cambiare nome', 'password', 'account'],
    title: '👤 Il tuo account',
    body: [
      '• In alto a destra trovi il tuo profilo: nome, tema colore e cambio password',
      '• Il tema scelto vale su tutto il sito e viene ricordato',
      '• Tutto ciò che crei è privato e visibile solo nel tuo account',
    ],
  },
  {
    keys: ['undo', 'annulla', 'ctrl z', 'rifare'],
    title: '↩️ Annullare le modifiche',
    body: [
      '• Il bottone freccia curva (in alto nell\'editor) annulla l\'ultima azione',
      '• Vale per oggetti piazzati, spostati, colorati e per il terreno scolpito',
      '• Puoi annullare più volte per tornare indietro di molti passi',
    ],
  },
]

// ---------- azioni ----------

const KIND_WORDS: { kind: GenKind; words: string[] }[] = [
  { kind: 'citta', words: ['citta', 'centro storico', 'borgo grande', 'metropoli medievale'] },
  { kind: 'villaggio', words: ['villaggio', 'paesino', 'paese', 'borgo'] },
  { kind: 'fortezza', words: ['fortezza', 'castello', 'rocca', 'fortino', 'cittadella'] },
  { kind: 'paesaggio', words: ['paesaggio', 'natura', 'bosco', 'foresta', 'lago', 'montagna', 'deserto', 'valle', 'isola'] },
]

const SIZE_WORDS: { size: GenSize; words: string[] }[] = [
  { size: 's', words: ['piccol', 'minuscol', 'quartiere'] },
  { size: 'l', words: ['grand', 'grosso', 'esteso', 'largo'] },
  { size: 'xl', words: ['enorm', 'gigante', 'immens', 'xl', 'metropoli'] },
]

function parseKind(t: string): GenKind | null {
  for (const k of KIND_WORDS) if (has(t, ...k.words)) return k.kind
  return null
}

function parseSize(t: string): GenSize {
  for (const s of SIZE_WORDS) if (has(t, ...s.words)) return s.size
  return 'm'
}

function parseDensity(t: string): number {
  if (has(t, 'fitto', 'fitta', 'denso', 'densa', 'popolato', 'pieno', 'tante case')) return 0.85
  if (has(t, 'rado', 'rada', 'spoglio', 'spoglia', 'vuoto', 'poche case', 'essenziale')) return 0.3
  return 0.6
}

const WORLD_TRIGGERS = ['mondo', 'mappa', 'citta', 'città', 'villaggio', 'fortezza', 'castello', 'paesaggio', 'bosco', 'lago', 'isola', 'deserto']

function extractObjectPhrase(t: string): string | null {
  // "genera un drago verde con le ali" → "un drago verde con le ali"
  const m = /(?:genera|crea|fammi|fami|fai|voglio|creami|creare)\s+(?:un|uno|una|il|lo|la|dei|delle|qualche)?\s*(.{3,120})/.exec(t)
  if (!m) return null
  return m[1].replace(/[.!?]+$/, '').trim()
}

// ---------- risposte pronte ----------

const GREETING_REPLY: AgentReply = {
  text: `Ciao! 👋 Sono l'**Agente Darpx**, l'assistente del sito.\n\nPosso fare cose vere, non solo chiacchiere:\n• «crea un mondo medievale grande» → lo genero e lo apro\n• «genera un drago» → preparo il modello 3D in Darpx.ai\n• «vai ai progetti importati» → cambio reparto\n• «come si scava il terreno?» → spiego ogni funzione\n\nCosa vuoi fare?`,
  action: { type: 'none' },
  suggestions: ['Crea un villaggio grande', 'Genera un drago', 'Come ruoto la visuale?', 'Cosa sai fare?'],
  confidence: 1,
}

const HELP_REPLY: AgentReply = {
  text: `Ecco cosa so fare **subito**:\n\n🌍 **Generare mondi** — «crea una fortezza enorme», «fammi un villaggio fitto di case»\n🧊 **Preparare modelli 3D** — «genera un cavaliere dorato», «crea una casa giapponese»\n🧭 **Muovermi nel sito** — «vai alle strutture», «apri Darpx.ai», «mostra i miei mondi»\n📚 **Spiegare tutto** — visuale, terreno, gioco, salvataggi, import, strutture, chiavi 3D…\n\nScrivi quello che vuoi: capisco l'italiano, anche in modo naturale.`,
  action: { type: 'none' },
  suggestions: ['Crea una città medievale', 'Vai a Darpx.ai', 'Come importo i modelli?', 'Cosa sai fare?'],
  confidence: 1,
}

const FALLBACK_REPLY: AgentReply = {
  text: `Questa è una domanda un po' particolare per me 😅\n\nNel frattempo posso aiutarti con:\n• generare mondi e modelli 3D\n• spiegarti ogni funzione del sito\n• portarti dove vuoi con un clic\n\nProva a riformulare, oppure usa uno dei suggerimenti qui sotto.`,
  action: { type: 'none' },
  suggestions: ['Cosa sai fare?', 'Come ruoto la visuale?', 'Crea un paesaggio', 'Vai ai progetti importati'],
  confidence: 0.3,
}

// ---------- cervello principale ----------

export function askBrain(message: string): AgentReply {
  const t = norm(message)
  if (!t) return FALLBACK_REPLY

  // saluti
  if (
    /^(ciao|salve|hey|ehi|buongiorno|buonasera|hola|hello|yo|ola)[\s!.,]*$/.test(t) ||
    t === 'ciao darpx'
  ) {
    return GREETING_REPLY
  }

  // aiuto / capacità
  if (
    has(t, 'cosa sai fare', 'cosa puoi fare', 'che cosa sai', 'aiuto', 'help', 'come funzioni', 'istruzioni', 'comandi') &&
    !has(t, 'come si usa')
  ) {
    return HELP_REPLY
  }

  // navigazione
  const navMap: { tab: DashboardTab; words: string[] }[] = [
    { tab: 'mondi', words: ['i miei mondi', 'mondi', 'progetti', 'le mie citta'] },
    { tab: 'genera', words: ['genera', 'reparto genera'] },
    { tab: 'importati', words: ['importati', 'modelli importati', 'libreria modelli', 'modelli 3d'] },
    { tab: 'strutture', words: ['strutture', 'struttura', 'costruttore'] },
    { tab: 'darpx', words: ['darpx', 'ai', 'intelligenza artificiale'] },
  ]
  if (has(t, 'vai', 'apri', 'mostra', 'portami', 'voglio vedere', 'fammi vedere', 'voglio andare')) {
    for (const n of navMap) {
      if (n.tab !== 'genera' && has(t, ...n.words)) {
        return {
          text: `Ci sono: ti porto al reparto **${
            n.tab === 'mondi' ? 'I miei mondi' : n.tab === 'importati' ? 'Progetti importati' : n.tab === 'strutture' ? 'Strutture' : 'Darpx.ai'
          }** 🧭`,
          action: { type: 'navigate', tab: n.tab },
          suggestions: ['Cosa sai fare?', 'Torna ai mondi', 'Come ruoto la visuale?'],
          confidence: 1,
        }
      }
    }
  }

  // generazione mondo
  const worldIntent =
    has(t, 'crea un mondo', 'crea una citta', 'crea un villaggio', 'crea una fortezza', 'crea un castello',
      'crea un paesaggio', 'genera un mondo', 'genera una citta', 'genera una città', 'genera un villaggio',
      'genera una fortezza', 'genera un castello', 'genera un paesaggio', 'fammi un mondo', 'fammi una citta',
      'fammi un villaggio', 'fammi una fortezza', 'nuovo mondo', 'costruisci un mondo', 'creami un mondo',
      'crea un isola', 'crea un\'isola', 'crea un bosco', 'crea un lago', 'voglio un mondo') ||
    (has(t, 'crea', 'genera', 'fammi', 'costruisci', 'voglio') && parseKind(t) && has(t, ...WORLD_TRIGGERS))
  if (worldIntent) {
    const kind = parseKind(t) ?? 'citta'
    const size = parseSize(t)
    const density = parseDensity(t)
    const kindLabel =
      kind === 'citta' ? 'città medievale' : kind === 'villaggio' ? 'villaggio' : kind === 'fortezza' ? 'fortezza' : 'paesaggio'
    const sizeLabel = size === 's' ? 'piccola' : size === 'l' ? 'grande' : size === 'xl' ? 'enorme' : 'media'
    return {
      text: `Perfetto: genero una **${kindLabel} ${sizeLabel}** e te la apro nell'editor 🌍\n\nPotrai modificarla subito: case, strade, terreno, tutto.`,
      action: { type: 'createWorld', kind, size, density },
      suggestions: ['Creane un\'altra variante', 'Come si gioca dentro?', 'Vai a Darpx.ai'],
      confidence: 1,
    }
  }

  // generazione modello 3D
  if (has(t, 'genera', 'crea', 'fammi', 'creami', 'voglio', 'fai')) {
    const phrase = extractObjectPhrase(t)
    const looksLikeWorld = phrase ? has(norm(phrase), ...WORLD_TRIGGERS) : true
    if (phrase && !looksLikeWorld) {
      return {
        text: `Ottima idea! 🧊 Preparo la creazione 3D di **${phrase}** nel reparto Darpx.\n\nLì scegli il motore (Tripo · fal.ai · Stability), lo stile e premi Genera: il modello arriva in «Progetti importati» con tanto di anteprima 👁️`,
        action: { type: 'prefill3d', prompt: phrase },
        suggestions: ['Genera anche un cavaliere', 'Come funzionano le chiavi 3D?', 'Vai ai progetti importati'],
        confidence: 1,
      }
    }
  }

  // base di conoscenza
  let best: { score: number; entry: (typeof KB)[number] } | null = null
  for (const entry of KB) {
    let score = 0
    for (const k of entry.keys) {
      if (t.includes(norm(k))) score += k.split(' ').length * 2
    }
    if (score > 0 && (!best || score > best.score)) best = { score, entry }
  }
  if (best && best.score >= 2) {
    return {
      text: `${best.entry.title}\n\n${best.entry.body.join('\n')}`,
      action: { type: 'none' },
      suggestions: ['Cosa sai fare?', 'Crea un mondo', 'Vai a Darpx.ai'],
      confidence: 0.9,
    }
  }

  // ringraziamenti
  if (has(t, 'grazie', 'perfetto', 'grandee', 'top', 'fantastico', 'bello')) {
    return {
      text: 'Figurati! 😄 Se ti serve altro sono qui: mondi, modelli 3D, spiegazioni… chiedi pure!',
      action: { type: 'none' },
      suggestions: ['Cosa sai fare?', 'Crea un villaggio'],
      confidence: 0.8,
    }
  }

  // domanda generica → lascia spazio al LLM
  return FALLBACK_REPLY
}

export const DEFAULT_SUGGESTIONS = [
  'Cosa sai fare?',
  'Crea una città medievale',
  'Come ruoto la visuale?',
  'Genera un drago',
]
