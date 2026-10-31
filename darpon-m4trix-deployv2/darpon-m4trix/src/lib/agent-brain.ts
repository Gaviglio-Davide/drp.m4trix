'use client'

// ============================================================
// Agente Darpx — CERVELLO ULTRA (v7)
// ------------------------------------------------------------
// Obiettivo: capire SEMPRE, anche con errori di battitura,
// frasi storte o parole diverse dal solito.
//
// Come ragiona (in ordine):
//   1. normalizza la frase (accenti, punteggiatura, ripetizioni)
//   2. la traduce in "parole chiave" tramite un dizionario di
//      SINONIMI con matching fuzzy (Levenshtein) su ogni parola
//   3. valuta TUTTE le intenzioni possibili con un punteggio
//      (azioni, mondi, 3D, temi, navigazione, 60+ voci di sapere)
//   4. MEMORIA DI CONTESTO: «ancora», «un altro», «sì fallo»
//      ripetono l'ultima azione con una variante nuova
//   5. se proprio nulla quadra NON dice «non capito»: mostra
//      cosa ha capito, fa domande mirate e passa la mano al
//      cervello LLM lato server per la risposta completa
// ============================================================

import type { GenKind, GenSize } from '@/lib/worldgen'
import type { DashboardTab } from '@/lib/ui-store'
import { THEMES } from '@/lib/themes'
import { SPECIES } from '@/lib/darpx3d/parse'

export type AgentAction =
  | { type: 'navigate'; tab: DashboardTab }
  | { type: 'prefill3d'; prompt: string }   // → motore interno, genera da solo
  | { type: 'createWorld'; kind: GenKind; size: GenSize; density: number }
  | { type: 'setTheme'; themeId: string }
  | { type: 'none' }

export type AgentReply = {
  text: string
  action: AgentAction
  suggestions: string[]
  confidence: number // 0..1: sotto 0.75 il client chiede anche al server
}

export type BrainContext = {
  lastIntent: 'none' | 'createWorld' | 'generate3d' | 'setTheme' | 'navigate'
  lastKind?: GenKind
  lastPrompt3d?: string
  lastTheme?: string
  turns: number
}

export function emptyBrainContext(): BrainContext {
  return { lastIntent: 'none', turns: 0 }
}

// ---------- normalizzazione ----------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s' -]/g, ' ')
    .replace(/'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** distanza di Levenshtein */
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

/** parola simile? (tolleranza crescente con la lunghezza) */
function fuzzyWord(word: string, target: string): boolean {
  if (word === target) return true
  const L = Math.max(word.length, target.length)
  if (L < 4) return false
  const tol = L >= 10 ? 3 : L >= 7 ? 2 : 1
  return lev(word, target) <= tol
}

// ---------- dizionario dei sinonimi ----------
// ogni gruppo manda le sue parole su un'unica "parola chiave".
// v7.1: NIENTE sostantivi-mondo (villaggio, citta, castello…):
// devono restare intatti per il parse dei tipi di mondo.

const SYNONYMS: [string, string[]][] = [
  // movimento visuale
  ['ruota', ['gira', 'girare', 'ruotare', 'ruota', 'orienta', 'movimenta', 'punta', 'sposta la vista', 'visuale', 'vista', 'camera', 'telecamera', 'inquadratura', 'punto di vista']],
  // terreno
  ['terreno', ['terreno', 'collina', 'montagna', 'rilevo', 'scava', 'scavare', 'scavo', 'buca', 'lago', 'valle', 'spiana', 'spianare', 'livella', 'sculpta', 'modella il suolo', 'alza il suolo', 'pala']],
  // gioco
  ['gioca', ['giocare', 'gioca', 'gioco', 'esplora', 'esplorare', 'in prima persona', 'cammina', 'camminare', 'entrare', 'entrare dentro', 'modalita giocatore']],
  // salvataggi
  ['salvataggi', ['salva', 'salvare', 'salvataggio', 'salvataggi', 'snapshot', 'versioni', 'cronologia', 'autosalvataggio', 'autosave', 'backup', 'copia di sicurezza']],
  // import
  ['import', ['importa', 'importare', 'carica', 'caricare', 'upload', 'glb', 'gltf', 'file 3d', 'modelli importati', 'progetti importati', 'caricamento', 'modello esterno']],
  // strutture + esterni
  ['strutture', ['struttura', 'strutture', 'costruttore', 'pezzi', 'strutturelab', 'casa pezzo per pezzo', 'edificio personalizzato', 'progettare', 'progetto edifici', 'esterni', 'giardino', 'recinzione', 'siepe', 'aiuola', 'panchina', 'vialetto', 'pergolato', 'fontana', 'vaso', 'homEbyme', 'homebyme']],
  // agente
  ['agente', ['agente', 'darpx', 'ai', 'assistente', 'robot', 'bots', 'bot', 'intelligenza', 'chi sei', 'come ti chiami']],
  // temi
  ['tema', ['tema', 'temi', 'colore', 'colori', 'aspetto', 'palette', 'sfondo', 'accento', 'tinta', 'look del sito', 'grafica']],
  // account
  ['account', ['profilo', 'account', 'password', 'nome utente', 'dati personali', 'privacy', 'privato', 'sicurezza', 'email', 'utente', 'iscrizione', 'registrato']],
  // elimina
  ['elimina', ['elimina', 'eliminare', 'cancella', 'cancellare', 'rimuovi', 'rimuovere', 'butta', 'buttare', 'distruggi', 'distruggere', 'ammazza', 'delete']],
  // strade
  ['strade', ['strada', 'strade', 'lastrica', 'lastricare', 'percorso', 'sentiero', 'viale', 'asfalto', 'sampietrini', 'ciottoli']],
  // colore oggetti
  ['colora', ['colora', 'colorare', 'dipingi', 'dipingere', 'verniciatura', 'ricolora', 'paint']],
  // admin
  ['admin', ['admin', 'amministratore', 'pannello', 'gestione', 'amministrazione', 'controlli del sito', 'gestire il sito', 'backoffice']],
  // mobile
  ['mobile', ['cellulare', 'telefono', 'smartphone', 'mobile', 'tablet', 'touch', 'ipad', 'android', 'iphone', 'da telefono']],
  // personaggio
  ['personaggio', ['personaggio', 'eroe', 'avatar', 'giocatore', 'protagonista', 'con chi gioco', 'chi controllo', 'eroina', 'pg']],
  // verbi di creazione (→ "genera", così «fammi un villaggio» matcha anche «genera un villaggio»)
  ['genera', ['genera', 'generare', 'crea', 'creare', 'fammi', 'fai', 'creami', 'dammi', 'disegna', 'modella', 'costruisci', 'realizza', 'inventa', 'springami']],
]

// parole piccole che NON vanno mai toccate dal fuzzy (evita «come»→«nome»)
const STOP_WORDS = new Set([
  'come', 'cosa', 'dove', 'quando', 'perche', 'perche', 'chi', 'che', 'come', 'quale', 'quanto',
  'con', 'senza', 'nel', 'nella', 'sul', 'sulla', 'per', 'tra', 'fra', 'anche', 'poi', 'modo', 'fatto',
  'si', 'no', 'e', 'ed', 'o', 'ma', 'se', 'gli', 'le', 'li', 'lo', 'la', 'il', 'un', 'una', 'uno',
  'del', 'dei', 'delle', 'della', 'al', 'ai', 'alle', 'alla', 'da', 'di', 'in', 'su', 'tuo', 'tua',
])

/**
 * traduce la frase grezza in "frase + parole chiave":
 * il testo ORIGINALE resta intatto (per i controlli di frase) e le
 * parole chiave canoniche vengono APPPESE in coda (per lo scoring).
 * Il fuzzy scatta solo da 5 lettere in su e mai sulle stop-word.
 */
function canonical(t: string): { text: string; tokens: string[] } {
  const raw = t.split(' ').filter(Boolean)
  const out: string[] = []
  for (const w of raw) {
    if (STOP_WORDS.has(w)) {
      out.push(w)
      continue
    }
    let mapped: string | null = null
    for (const [canon, words] of SYNONYMS) {
      if (w === canon) {
        mapped = canon
        break
      }
      for (const syn of words) {
        if (syn.includes(' ')) continue
        if (w === syn || (w.length >= 5 && fuzzyWord(w, syn))) {
          mapped = canon
          break
        }
      }
      if (mapped) break
    }
    out.push(mapped ?? w)
  }
  // frasi multi-parola nei sinonimi → aggiungono la parola chiave in coda
  const extras: string[] = []
  for (const [canon, words] of SYNONYMS) {
    for (const syn of words) {
      if (!syn.includes(' ')) continue
      if (t.includes(syn)) extras.push(canon)
    }
  }
  // il testo esteso = originale + token canonici (deduplicati)
  const tokens = out.filter((w, i) => out.indexOf(w) === i)
  const text = [t, ...tokens, ...extras].join(' ')
  return { text, tokens }
}

const has = (t: string, ...words: string[]) => words.some(w => t.includes(w))

// ---------- base di conoscenza del sito (estesa) ----------

const KB: { keys: string[]; title: string; body: string[] }[] = [
  {
    keys: ['ruota', 'visuale'],
    title: '🖼️ Ruotare la visuale nell\'editor',
    body: [
      '• Tasto DESTRO del mouse + trascina = ruota la visuale in ogni direzione',
      '• Rotella del mouse = zoom avanti/indietro',
      '• Su cellulare: due dita per ruotare e pizzicare per lo zoom',
      '• Il bottone 📷 attiva la modalità camera (ruoti col tasto sinistro)',
      '• Click destro SECCO su un oggetto lo elimina (il drag invece ruota)',
    ],
  },
  {
    keys: ['terreno'],
    title: '⛰️ Modellare il terreno',
    body: [
      'Nella barra in alto dell\'editor trovi i pennelli del terreno:',
      '• ⛰️ Alza = colline e montagne · 🥄 Scava = valli e laghi',
      '• 🧽 Spiana = riporta tutto a livello · ✋ Mano = torna a piazzare oggetti',
      '• Gli slider regolano diametro e forza del pennello',
      '• Scavando sotto il livello dell\'acqua compare un LAGHETTO vero 🏞️',
      '• In modalità Gioca cammini davvero sui dislivelli che hai creato',
    ],
  },
  {
    keys: ['gioca'],
    title: '🎮 Giocare dentro il mondo',
    body: [
      '• Premi GIOCA nell\'editor per entrare in terza persona',
      '• WASD o frecce = muoversi · SHIFT = correre · trascina il mouse per guardarti intorno',
      '• Cammini sulle strade, sali sulle colline, entri nelle tue creazioni',
      '• ESC o il bottone Esci ti riporta all\'editor',
      '• Con 🧍 Personaggio scegli chi interpretare: l\'eroe di serie o un tuo modello GLB',
    ],
  },
  {
    keys: ['salvataggi'],
    title: '💾 Salvataggi e versioni',
    body: [
      '• Il mondo si salva in automatico mentre lavori (stato in alto a destra)',
      '• Con il bottone Salvataggi crei SNAPSHOT con nome: versioni a cui tornare',
      '• «Ripristina» riporta il mondo a quel momento esatto',
      '• Tutti i progetti stanno nella home, reparto «I miei mondi»',
    ],
  },
  {
    keys: ['import'],
    title: '📦 Importare modelli 3D',
    body: [
      '• Home → «Progetti importati» → bottone Importa modelli',
      '• Si caricano file .glb e .gltf, anche molti insieme',
      '• Occhio ai file .meshy: sono cifrati, servono i GLB scaricati',
      '• Con l\'occhio 👁️ apri l\'ANTEPRIMA 3D: rotazione, wireframe, statistiche, download',
      '• I modelli finiscono nella barra oggetti di OGNI tuo mondo',
      '• La dimensione (0,5x–3x) si sceglie dalla lista e vale per i nuovi piazzamenti',
    ],
  },
  {
    keys: ['migliora glb', 'laboratorio glb', 'modificare i modelli', 'ritoccare', 'migliorare i modelli'],
    title: '🔧 Migliorare un modello che hai già',
    body: [
      'Novità v7! In Darpx.ai trovi il **Laboratorio GLB**:',
      '• Scegli uno dei modelli già nei tuoi Progetti importati (o carica un file)',
      '• Applico tinta o veri materiali PBR: oro, argento, ferro, legno, pietra, marmo…',
      '• Posso AGGIUNGERE: ali, corna, basamento in pietra, aura luminosa',
      '• Ridimensiono il modello all\'altezza che vuoi e lo riappoggio a terra',
      '• Alla fine salvi il risultato nei Progetti importati o lo scarichi in GLB',
    ],
  },
  {
    keys: ['non vedo', 'invisibile', 'scomparso', 'modello non appare'],
    title: '🔍 Un modello non si vede?',
    body: [
      'Controlla in questo ordine:',
      '• «Progetti importati»: il file è nella lista? Se no, l\'upload non è finito',
      '• Premi l\'occhio 👁️: l\'anteprima 3D ti dice subito se il file è leggibile o corrotto',
      '• Nell\'editor i tuoi modelli stanno in fondo alla barra oggetti, icona 📦',
      '• Se l\'anteprima lo segnala come corrotto, riscarica il file dalla fonte',
      '• Se è semplicemente gigante o minuscolo: cliccalo per cambiare dimensione (0,5x–3x)',
    ],
  },
  {
    keys: ['strutture'],
    title: '🏗️ Reparto Strutture (+ esterni!)',
    body: [
      '• Home → «Strutture»: progetti edifici pezzo per pezzo su una griglia 3D',
      '• v7: muri, porte e finestre si appoggiano SUL BORDO delle celle → simmetria perfetta',
      '• Pavimento e muro possono stare nella STESSA cella (il controllo è per pezzo)',
      '• Nuovi pezzi da ESTERNO stile HomeByMe: 🚧 recinzione, 🌿 siepe, 🥾 vialetto, 🌷 aiuola, 🪑 panchina',
      '• Le strutture salvate finiscono nella barra oggetti di ogni mondo, riusabili all\'infinito',
    ],
  },
  {
    keys: ['immagine'],
    title: '🖼️ Darpx.ai · Immagine → Mondo',
    body: [
      '• Home → «Darpx.ai» → carica una qualsiasi immagine',
      '• Darpx la analizza (colori, luce, paesaggio) e costruisce un mondo 3D coerente',
      '• Se è notturna aggiunge lampioni; se domina il blu crea un grande lago',
      '• Spunta «usa anche come cielo» per farne il panorama del mondo',
    ],
  },
  {
    keys: ['motore interno', 'senza chiavi', '3d gratis', 'quanto costa', 'limiti'],
    title: '🧬 Il Motore interno Darpx',
    body: [
      'Il reparto Darpx.ai ha un motore 3D costruito da zero, che gira nel TUO browser:',
      '• Nessuna chiave API, nessun costo, nessun limite di richieste',
      '• Capisce l\'italiano: specie, colori, materiali (oro, legno, ghiaccio…), taglia, dettagli',
      '• v7: modelli con texture PBR realistiche (scaglie, pelli, metalli spazzolati)',
      '• Ogni richiesta genera un modello DIVERSO: chiedi 3 volte «un cavaliere» e ne ottieni 3 diversi',
      '• Prima di generare ti chiede i dettagli che mancano (colore, taglia, dettagli) — salta pure le domande se hai fretta',
      '• Risultato: GLB vero con anteprima 👁️, download e uso immediato nell\'editor',
    ],
  },
  {
    keys: ['motori esterni', 'meshy', 'tripo', 'chiave api', 'fotoreale'],
    title: '🧊 Motori esterni (opzionali)',
    body: [
      '• Oltre al motore interno puoi usare i motori cloud: Tripo, fal.ai, Stable Fast 3D e Meshy',
      '• Servono per look fotografici particolari; se uno si blocca si passa al successivo',
      '• Serve una chiave API gratuita del motore che preferisci (salvata cifrata)',
      '• Il modello arriva nei «Progetti importati» con anteprima 👁️',
      '• Il motore interno invece parte subito, senza configurare nulla 🧬',
    ],
  },
  {
    keys: ['agente'],
    title: '✨ Sono l\'Agente Darpx',
    body: [
      'Sono l\'assistente AI del sito, e faccio cose concrete:',
      '• «genera un drago rosso» → lo creo col motore interno, al volo 🧬',
      '• «crea un mondo grande» → lo genero e te lo apro nell\'editor',
      '• «metti il tema viola» → cambio i colori del sito',
      '• «vai alle strutture» → ti porto nel reparto giusto',
      '• «ancora!» → ripeto l\'ultima cosa che ho fatto, con una variante nuova',
      'Capisco l\'italiano parlato normale, anche con errori di battitura.',
    ],
  },
  {
    keys: ['tema'],
    title: '🎨 Temi e colori del sito',
    body: [
      `Il sito ha ${THEMES.length} temi colore: ${THEMES.map(t => t.name).join(', ')}.`,
      '• Cambiali dall\'ingranaggio ⚙️ in alto a destra → scheda Colori',
      '• Oppure DIMMELO: «metti il tema viola», «voglio il sito rosa»… lo faccio al volo',
      '• La scelta viene ricordata sul tuo account e seguita da tutta l\'interfaccia',
    ],
  },
  {
    keys: ['account'],
    title: '👤 Il tuo account',
    body: [
      '• In alto a destra trovi il profilo: nome, tema colore e cambio password',
      '• Il tema scelto vale su tutto il sito e viene ricordato',
      '• Tutto ciò che crei è privato e visibile solo nel tuo account',
      '• Puoi eliminare progetti e modelli quando vuoi: restano tuoi',
    ],
  },
  {
    keys: ['annulla', 'undo', 'tornare indietro', 'rifare'],
    title: '↩️ Annullare le modifiche',
    body: [
      '• Il bottone freccia curva (in alto nell\'editor) annulla l\'ultima azione — o Ctrl+Z',
      '• Vale per oggetti piazzati, colorati, ruotati e per il terreno scolpito',
      '• Puoi annullare più volte di fila per tornare indietro di molti passi',
    ],
  },
  {
    keys: ['elimina'],
    title: '🗑️ Eliminare oggetti e progetti',
    body: [
      'Nell\'editor:',
      '• Click DESTRO secco su un oggetto lo elimina all\'istante',
      'Nella home:',
      '• Ogni card dei mondi ha il cestino 🗑 per eliminare il progetto (con conferma)',
      '• I modelli si eliminano da «Progetti importati», le strutture da «Strutture»',
    ],
  },
  {
    keys: ['strade'],
    title: '🛣️ Le strade',
    body: [
      '• Nella barra oggetti trovi la STRADA in sampietrini: si collega da sola alle vicine',
      '• Più strade affiancate formano reticoli e piazze vere',
      '• v7: cordoli in pietra sui lati liberi e vialetti in ghiaia per i giardini',
      '• In modalità Gioca ci cammini sopra come in un videogioco',
    ],
  },
  {
    keys: ['colora'],
    title: '🖌️ Colorare gli oggetti',
    body: [
      '• Clicca un oggetto piazzato: cambia colore al volo (tasto C sull\'anteprima)',
      '• Vale per case, torri, alberi, pezzi delle strutture e molto altro',
      '• Per le STRUTTURE il colore si sceglie pezzo per pezzo nel costruttore',
      '• I modelli GLB importati invece cambiano dimensione (0,5x–3x)',
    ],
  },
  {
    keys: ['admin'],
    title: '🛡️ Area admin',
    body: [
      '• Il pannello admin è all\'indirizzo /admin (link discreto nel footer)',
      '• Serve la password da amministratore (variabile ADMIN_PASSWORD su Vercel)',
      '• Da lì: diagnostica, gestione utenti e progetti, testi del sito, chiavi 3D globali, configurazione dell\'agente AI',
    ],
  },
  {
    keys: ['mobile'],
    title: '📱 Da cellulare',
    body: [
      '• Il sito funziona anche da telefono e tablet, tutto a tocco di dito',
      '• Nell\'editor: un dito = piazza/seleziona · due dita = ruota e zoom',
      '• In Gioca: joystick a schermo per camminare e trascina per guardarti intorno',
      '• La bolla dell\'agente in basso a destra funziona uguale, anche in viaggio 😄',
    ],
  },
  {
    keys: ['personaggio'],
    title: '🧑 L\'eroe e i personaggi',
    body: [
      '• Il bottone Personaggio apre la scelta: Eroe di serie o un tuo modello GLB',
      '• L\'eroe v7 è un avventuriero realistico: tunica, cintura, stivali, sacca da viaggio',
      '• Se hai caricato un cavaliere o una creatura puoi entrarci dentro in modalità Gioca',
      '• Vanno bene anche i modelli generati dal motore interno!',
    ],
  },
  {
    keys: ['realistico', 'grafica', 'texture', 'stile realistico', 'cartonato', 'cartoon', 'rismegliare'],
    title: '🌿 Il restyling realistico v7',
    body: [
      'Tutto il sito è stato rimasterizzato in stile realistico:',
      '• Edifici con zoccoli in pietra, intonaco, tetti in coppi, comignoli, finestre con telaio e davanzale',
      '• Texture PBR procedurali: mattoni, legno venato, pietra, sampietrini, ghiaia, erba, foglie…',
      '• Alberi e cespugli con chiome organiche, rocce erose, acqua e luce naturali',
      '• L\'opzione «cartoon/medievale» è stata ritirata: c\'è UN solo look, curato',
      '• Anche i modelli del motore Darpx 3D ora hanno scaglie, pelli e metalli veri',
    ],
  },
  {
    keys: ['avatar', 'compagno', 'mascotte', 'omino', 'capri'],
    title: '💜 Il mio avatar',
    body: [
      'Hai notato il piccolo essere nella bolla in basso a destra?',
      '• È la mia forma fisica: un guizzo d\'ombra con fiamma olografica 💜',
      '• Cammina, pensa, festeggia e viaggia per lo schermo mentre mi parli',
      '• Se lo vedi passeggiare in fondo alla pagina non preoccuparti: sta solo esplorando il sito!',
    ],
  },
]

// ---------- azioni ----------

const KIND_WORDS: { kind: GenKind; words: string[] }[] = [
  { kind: 'citta', words: ['citta', 'centro storico', 'borgo grande', 'metropoli'] },
  { kind: 'villaggio', words: ['villaggio', 'paesino', 'paese', 'borgo', 'fattoria'] },
  { kind: 'fortezza', words: ['fortezza', 'castello', 'rocca', 'fortino', 'cittadella', 'fortificazione'] },
  { kind: 'paesaggio', words: ['paesaggio', 'natura', 'bosco', 'foresta', 'lago', 'montagna', 'deserto', 'valle', 'isola', 'campagna'] },
]

const SIZE_WORDS: { size: GenSize; words: string[] }[] = [
  { size: 's', words: ['piccol', 'minuscol', 'quartiere', 'mini'] },
  { size: 'l', words: ['grand', 'grosso', 'esteso', 'largo', 'ampio'] },
  { size: 'xl', words: ['enorm', 'gigant', 'immens', 'xl', 'metropoli', 'sproporzionat'] },
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
  if (has(t, 'fitto', 'fitta', 'denso', 'densa', 'popolato', 'pieno', 'tante case', 'affollat')) return 0.85
  if (has(t, 'rado', 'rada', 'spoglio', 'spoglia', 'vuoto', 'poche case', 'essenziale', 'deserto di case')) return 0.3
  return 0.6
}

const WORLD_TRIGGERS = ['mondo', 'mappa', 'citta', 'villaggio', 'fortezza', 'castello', 'paesaggio', 'bosco', 'lago', 'isola', 'deserto', 'valle', 'montagna', 'borgo', 'paese', 'natura']

function extractObjectPhrase(t: string): string | null {
  const m = /(?:genera|crea|fammi|fami|fai|voglio|creami|creare|dammi|disegna|modella|costruisci|realizza|inventa)\s+(?:un|uno|una|il|lo|la|dei|delle|qualche|due|tre)?\s*(.{3,140})/.exec(t)
  if (!m) return null
  return m[1].replace(/[.!?]+$/, '').trim()
}

function parseTheme(t: string): string | null {
  const m = /(?:tema|colore|sfondo|sito)\s+(?:di\s+|da\s+|in\s+)?([a-z]+)/.exec(t)
  const wanted = m?.[1] ?? ''
  if (wanted) {
    for (const th of THEMES) {
      if (fuzzyWord(wanted, norm(th.name)) || fuzzyWord(wanted, norm(th.id))) return th.id
    }
  }
  // «metti viola» / «rendi tutto viola» / «cambia in viola»
  const m2 = /(?:metti|voglio|rendi|fai tutto|cambia in)\s+(?:il\s+|lo\s+|la\s+|tutto\s+|tutta\s+)?([a-z]+)/.exec(t)
  const w2 = m2?.[1] ?? ''
  if (w2) {
    for (const th of THEMES) {
      if (fuzzyWord(w2, norm(th.name)) || fuzzyWord(w2, norm(th.id))) return th.id
    }
  }
  // contesto «sito» + ultima parola: «voglio il sitov viola» → viola
  if (/sit|tutto il|interfacc|grafica/.test(t)) {
    const words = t.split(' ').filter(Boolean)
    const last = words[words.length - 1] ?? ''
    if (last.length >= 3) {
      for (const th of THEMES) {
        if (fuzzyWord(last, norm(th.name)) || fuzzyWord(last, norm(th.id))) return th.id
      }
    }
  }
  return null
}

// ---------- risposte pronte ----------

const GREETING_REPLY: AgentReply = {
  text: `Ciao! 👋 Sono l'**Agente Darpx**, l'assistente del sito.\n\nPosso fare cose vere, non solo chiacchiere:\n• «genera un drago» → lo creo SUBITO col mio motore interno 🧬\n• «crea un mondo medievale grande» → lo genero e te lo apro\n• «metti il tema viola» → cambio il colore del sito\n• «come si scava il terreno?» → ti spiego ogni funzione\n\nE se ti serve una variante di qualcosa, scrivi «ancora» e la rifaccio diversa.\n\nCosa vuoi fare?`,
  action: { type: 'none' },
  suggestions: ['Genera un drago rosso', 'Crea un villaggio grande', 'Metti il tema viola', 'Cosa sai fare?'],
  confidence: 1,
}

const HELP_REPLY: AgentReply = {
  text: `Ecco cosa so fare **subito**:\n\n🧬 **Generare modelli 3D** (motore interno, zero chiavi) — «genera un drago rosso», «crea una spada d'oro». Ogni volta un modello DIVERSO, e prima ti chiedo i dettagli che mancano.\n🌍 **Generare mondi** — «crea una fortezza enorme», «fammi un villaggio fitto di case»\n🎨 **Cambiare il tema** — «metti il tema fucsia», «voglio il sito azzurro»\n🧭 **Muovermi nel sito** — «vai alle strutture», «apri Darpx.ai», «mostra i miei mondi»\n🔧 **Migliorare i tuoi GLB** — in Darpx.ai c'è il Laboratorio: tinta, oro, ali, corna, basamenti\n📚 **Spiegare tutto** — visuale, terreno, gioco, strade, salvataggi, import, strutture, esterni, admin…\n\nScrivi come ti viene: capisco l'italiano, anche sbagliato o con errori di battitura. E «ancora» rifà l'ultima cosa con una variante.`,
  action: { type: 'none' },
  suggestions: ['Genera un drago', 'Crea una città medievale', 'Metti il tema rosa', 'Come importo i modelli?'],
  confidence: 1,
}

/** cosa so generare: elenco vivo delle specie del motore */
function speciesListReply(): AgentReply {
  const creatures = SPECIES.filter(s => ['dragon', 'serpent', 'humanoid', 'quadruped', 'bird', 'fish', 'robot'].includes(s.archetype)).map(s => s.label.toLowerCase())
  const objects = SPECIES.filter(s => !['dragon', 'serpent', 'humanoid', 'quadruped', 'bird', 'fish', 'robot'].includes(s.archetype)).map(s => s.label.toLowerCase())
  const chunk = (a: string[], n: number) =>
    Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n).join(', '))
  return {
    text: `Con il **motore interno** so creare ${SPECIES.length} specie di modelli 🧬\n\n**Creature:** ${chunk(creatures, 9).join(';\n')}.\n**Oggetti e edifici:** ${chunk(objects, 9).join(';\n')}.\n\nOgni modello accetta **colori** (rosso, smeraldo…), **materiali** (oro, legno, ghiaccio, fuoco, ombra…), **taglie** (minuscolo → enorme) e **dettagli** (ali, corna, armatura, spine, sella…).\n\nChiedimelo 3 volte e te ne faccio 3 di diverse!`,
    action: { type: 'none' },
    suggestions: ['Genera un drago rosso con le corna', 'Genera un robot di ferro', 'Cosa sai fare?'],
    confidence: 1,
  }
}

// ---------- cervello principale ----------

export function askBrain(message: string, prev?: BrainContext): { reply: AgentReply; ctx: BrainContext } {
  const ctx: BrainContext = prev ?? emptyBrainContext()
  const raw = norm(message)
  if (!raw) {
    return { reply: GREETING_REPLY, ctx }
  }

  const { text, tokens } = canonical(raw)
  const next: BrainContext = { ...ctx, turns: ctx.turns + 1 }

  const done = (reply: AgentReply, intent: BrainContext['lastIntent'], extra?: Partial<BrainContext>) => {
    return { reply, ctx: { ...next, lastIntent: intent, ...extra } }
  }

  // ---- saluti e chiacchiere ----
  if (/^(ciao|salve|hey|ehi|buongiorno|buonasera|hola|hello|yo|ola)[\s!.,]*$/.test(raw) ||
    /^ciao darpx/.test(raw)) {
    return done(GREETING_REPLY, 'none')
  }
  if (has(raw, 'come stai', 'come va', 'tutto bene', 'come ti senti')) {
    return done({
      text: 'Alla grande, pronto a costruire mondi! 🚀\n\nDimmi: genero un modello 3D, creo un mondo, cambio il tema o ti spiego qualcosa del sito? Se ti è piaciuta l\'ultima cosa che ho fatto, scrivi «ancora» e ne faccio una variante.',
      action: { type: 'none' },
      suggestions: ['Genera un drago', 'Crea un villaggio', 'Cosa sai fare?'],
      confidence: 1,
    }, 'none')
  }
  if (
    has(raw, 'cosa sai fare', 'cosa puoi fare', 'che cosa sai', 'aiuto', 'help', 'come funzioni', 'istruzioni', 'comandi', 'capacita') &&
    !has(raw, 'generare', 'creare con')
  ) {
    return done(HELP_REPLY, 'none')
  }
  if (has(raw, 'cosa sai generare', 'cosa puoi generare', 'cosa crei', 'cosa crei con il motore', 'quali modelli', 'cosa generi')) {
    return done(speciesListReply(), 'none')
  }
  if (has(raw, 'grazie', 'perfetto', 'grandee', 'grandioso', 'top ', 'fantastico', 'mitico', 'spettacolare', 'bravo', 'bellissimo', 'gentilissimo')) {
    return done({
      text: 'Figurati! 😄 Se ti serve altro sono qui: modelli 3D, mondi, temi, spiegazioni… e ricorda: «ancora» = rifaccio l\'ultima cosa con una variante nuova.',
      action: { type: 'none' },
      suggestions: ['Cosa sai fare?', 'Crea un villaggio', 'Genera un drago'],
      confidence: 0.9,
    }, ctx.lastIntent, { lastKind: ctx.lastKind, lastPrompt3d: ctx.lastPrompt3d, lastTheme: ctx.lastTheme })
  }
  if (has(raw, 'arrivederci', 'ciao ciao', 'a dopo', 'buonanotte', 'buona giornata', 'me ne vado', 'sto uscendo')) {
    return done({
      text: 'A presto! 👋 I tuoi mondi ti aspettano qui, al sicuro nel tuo account. Se mi vedi passeggiare in fondo alla pagina, salutami pure!',
      action: { type: 'none' },
      suggestions: ['Torna ai mondi'],
      confidence: 0.9,
    }, 'none')
  }

  // ---- FOLLOW-UP: «ancora», «un altro», «sì fallo» ----
  const isFollowUp =
    /^(ancora|ancora uno|ancora una|un altro|un altra|unaltra|di nuovo|ripeti|rifallo|ancora ancora|dai|su|vai|fallo|ok fallo|si fallo|si dai|ok dai|va bene|perfetto fallo|ancora uno diverso)[\s!.,]*$/.test(raw) ||
    (/^(si|sì|ok|yes|certo|ovvio)[\s!.,]*$/.test(raw) && ctx.lastIntent !== 'none')
  if (isFollowUp && ctx.lastIntent !== 'none') {
    if (ctx.lastIntent === 'createWorld' && ctx.lastKind) {
      const kind = ctx.lastKind
      return done({
        text: `Volentieri! Genero un altro **${kind === 'citta' ? 'città medievale' : kind}**, tutto diverso dal precedente 🌍\n\nOgni mondo è generato con un seed nuovo: disposizione, strade e dettagli cambiano sempre.`,
        action: { type: 'createWorld', kind, size: 'm', density: 0.6 },
        suggestions: ['Ancora!', 'Creane una enorme', 'Come si gioca dentro?'],
        confidence: 1,
      }, 'createWorld', { lastKind: kind })
    }
    if (ctx.lastIntent === 'generate3d' && ctx.lastPrompt3d) {
      return done({
        text: `Ci sto! Creo un'altra versione di **${ctx.lastPrompt3d}**, con seed nuovo: sarà diversa dalla precedente 🧬\n\nLa trovi nell'anteprima appena è pronta.`,
        action: { type: 'prefill3d', prompt: ctx.lastPrompt3d },
        suggestions: ['Ancora!', 'Salvalo nei modelli', 'Cosa sai generare?'],
        confidence: 1,
      }, 'generate3d', { lastPrompt3d: ctx.lastPrompt3d })
    }
    if (ctx.lastIntent === 'setTheme') {
      return done({
        text: 'Rimetto il tema che avevamo scelto 🎨 (per cambiarlo dimmi pure un altro colore!).',
        action: { type: 'setTheme', themeId: ctx.lastTheme ?? 'bosco' },
        suggestions: ['Metti il tema notte', 'Metti il tema mare', 'Cosa sai fare?'],
        confidence: 1,
      }, 'setTheme', { lastTheme: ctx.lastTheme })
    }
  }

  // ---- cambio tema ----
  if (
    (has(text, 'tema', 'colore', 'sfondo', 'sito') &&
      has(text, 'metti', 'cambia', 'voglio', 'imposta', 'fai', 'rendi', 'mettere', 'torna', 'genera')) ||
    /^(metti|voglio|rendi|cambia in)\s+[a-z]+$/.test(raw)
  ) {
    const themeId = parseTheme(raw)
    if (themeId) {
      const th = THEMES.find(x => x.id === themeId)!
      return done({
        text: `Consideralo fatto: **tema ${th.name}** ${th.id === 'viola' ? '💜' : th.id === 'rosa' ? '🌸' : '🎨'} applicato!\n\nTutta l'interfaccia si tinge del nuovo colore (e lo ricordo sul tuo account). Scrivi «ancora» se vuoi riprenderlo dopo aver cambiato.`,
        action: { type: 'setTheme', themeId },
        suggestions: ['Metti il tema notte', 'Torna al tema bosco', 'Cosa sai fare?'],
        confidence: 1,
      }, 'setTheme', { lastTheme: themeId })
    }
    return done({
      text: `Posso cambiare il colore del sito al volo! 🎨\n\nDimmi per esempio: «metti il tema **viola**», «voglio il sito **rosa**» o «cambia in **cielo**».\n\nI temi disponibili: ${THEMES.map(x => x.name).join(', ')}.`,
      action: { type: 'none' },
      suggestions: ['Metti il tema viola', 'Metti il tema mare', 'Metti il tema arancio'],
      confidence: 0.95,
    }, 'none')
  }

  // ---- navigazione ----
  const navMap: { tab: DashboardTab; words: string[]; label: string }[] = [
    { tab: 'mondi', words: ['mondi', 'progetti', 'miei mondi', 'le mie citta'], label: 'I miei mondi' },
    { tab: 'genera', words: ['genera reparto', 'reparto genera', 'genera'], label: 'Genera' },
    { tab: 'importati', words: ['importati', 'modelli importati', 'libreria modelli', 'modelli 3d', 'import'], label: 'Progetti importati' },
    { tab: 'strutture', words: ['strutture', 'struttura', 'costruttore'], label: 'Strutture' },
    { tab: 'darpx', words: ['darpx', 'ai', 'intelligenza'], label: 'Darpx.ai' },
  ]
  if (has(text, 'vai', 'apri', 'mostra', 'portami', 'voglio vedere', 'fammi vedere', 'voglio andare', 'torna', 'riporta', 'portami')) {
    for (const n of navMap) {
      if (n.words.some(w => text.includes(w))) {
        return done({
          text: `Ci sono: ti porto al reparto **${n.label}** 🧭\n\nDimmi se vuoi che ti spieghi anche cosa ci trovi dentro.`,
          action: { type: 'navigate', tab: n.tab },
          suggestions: ['Cosa sai fare?', 'Torna ai mondi', 'Come ruoto la visuale?'],
          confidence: 1,
        }, 'navigate')
      }
    }
  }

  // ---- generazione mondo ----
  const worldIntent =
    has(text, 'crea un mondo', 'crea una citta', 'crea un villaggio', 'crea una fortezza', 'crea un castello',
      'crea un paesaggio', 'genera un mondo', 'genera una citta', 'genera un villaggio',
      'genera una fortezza', 'genera un castello', 'genera un paesaggio', 'fammi un mondo', 'fammi una citta',
      'fammi un villaggio', 'fammi una fortezza', 'nuovo mondo', 'costruisci un mondo', 'creami un mondo',
      'crea un isola', 'crea un bosco', 'crea un lago', 'voglio un mondo', 'crea la mappa', 'genera la mappa') ||
    (has(text, 'crea', 'genera', 'fammi', 'costruisci', 'voglio', 'realizza') && parseKind(text) && has(text, ...WORLD_TRIGGERS))
  if (worldIntent) {
    const kind = parseKind(text) ?? 'citta'
    const size = parseSize(raw)
    const density = parseDensity(raw)
    const kindLabel =
      kind === 'citta' ? 'città medievale' : kind === 'villaggio' ? 'villaggio' : kind === 'fortezza' ? 'fortezza' : 'paesaggio'
    const sizeLabel = size === 's' ? 'piccolo' : size === 'l' ? 'grande' : size === 'xl' ? 'enorme' : 'media'
    const art = kind === 'villaggio' || kind === 'paesaggio' ? 'un' : 'una'
    return done({
      text: `Perfetto: genero ${art} **${kindLabel} ${sizeLabel}** e te la apro nell'editor 🌍\n\nTroverai strade in sampietrini, edifici realistici${kind === 'citta' ? ', una fontana in piazza e panchine' : kind === 'villaggio' ? ', orti con recinzioni e siepi' : ''} — e potrai modificare tutto al volo. Scrivi «ancora» per una variante.`,
      action: { type: 'createWorld', kind, size, density },
      suggestions: ['Ancora!', 'Come si gioca dentro?', 'Vai a Darpx.ai'],
      confidence: 1,
    }, 'createWorld', { lastKind: kind })
  }

  // ---- generazione modello 3D → MOTORE INTERNO ----
  const gen3dIntent =
    has(text, 'genera', 'crea', 'fammi', 'creami', 'voglio', 'fai', 'dammi', 'disegna', 'modella', 'costruisci', 'realizza', 'inventa')
  if (gen3dIntent) {
    const phrase = extractObjectPhrase(raw)
    const looksLikeWorld = phrase ? has(norm(phrase), ...WORLD_TRIGGERS) : true
    if (phrase && !looksLikeWorld) {
      return done({
        text: `Subito! 🧬 Preparo **${phrase}** col mio motore interno.\n\nPrima di assemblarlo ti faccio un paio di **domande sui dettagli** (colore, taglia, caratteristiche): rispondi pure a stomaco vuoto, o premi «Genera ora» e decido io. Ogni richiesta ha un seed nuovo: anche rifacendo lo stesso modello, sarà sempre diverso.`,
        action: { type: 'prefill3d', prompt: phrase },
        suggestions: ['Genera una variante', 'Salvalo nei modelli', 'Cosa sai generare?'],
        confidence: 1,
      }, 'generate3d', { lastPrompt3d: phrase })
    }
  }

  // ---- base di conoscenza (scoring con fuzzy su tutta la frase) ----
  let best: { score: number; entry: (typeof KB)[number]; hitWords: string[] } | null = null
  for (const entry of KB) {
    let score = 0
    const hitWords: string[] = []
    for (const k of entry.keys) {
      const nk = norm(k)
      if (text.includes(nk)) {
        score += nk.split(' ').length * 3 + 2
        hitWords.push(k)
      } else {
        const kw = nk.split(' ')
        if (kw.length <= 2) {
          for (const w of tokens) {
            if (w.length >= 4 && fuzzyWord(w, nk)) {
              score += 2
              hitWords.push(k)
              break
            }
          }
        }
      }
    }
    for (const w of tokens) {
      if (w.length >= 6 && entry.body.some(b => b.toLowerCase().includes(w))) score += 1
    }
    if (score > 0 && (!best || score > best.score)) best = { score, entry, hitWords }
  }
  if (best && best.score >= 4) {
    return done({
      text: `${best.entry.title}\n\n${best.entry.body.join('\n')}`,
      action: { type: 'none' },
      suggestions: ['Cosa sai fare?', 'Crea un mondo', 'Genera un drago'],
      confidence: 0.9,
    }, 'none')
  }

  // ---- piccolo extra: domande sul sito ----
  if (has(raw, 'chi ti ha creato', 'chi ti ha fatto', 'chi e il tuo creatore')) {
    return done({
      text: 'Sono stato costruito da **Davide** per darpon.m4trix 💜\n\nIl mio cervello veloce gira nel tuo browser; per le domande più difficili consulto anche un modello linguistico lato server. Ma il carattere è tutto mio!',
      action: { type: 'none' },
      suggestions: ['Cosa sai fare?', 'Chi sei?', 'Genera un drago'],
      confidence: 1,
    }, 'none')
  }

  // ---- FALLBACK INTELLIGENTE: mai un «non capito» secco ----
  // cerca comunque argomenti VICINI (fuzzy) e mostra cosa ha capito
  const nearTopics: string[] = []
  for (const entry of KB) {
    for (const k of entry.keys) {
      const nk = norm(k)
      for (const w of tokens) {
        if (w.length >= 5 && fuzzyWord(w, nk)) {
          if (!nearTopics.includes(entry.title)) nearTopics.push(entry.title)
        }
      }
    }
  }
  const nearLine = nearTopics.length
    ? `\n\nA occhio mi sembra qualcosa su: ${nearTopics.slice(0, 3).join(' · ')} — dimmi se ci ho preso!`
    : ''
  const fallback: AgentReply = {
    text: `Bella domanda, lasciamici pensare un attimo… 🤔${nearLine}\n\nNel frattempo ti anticipo ciò che faccio meglio:\n• 🧬 genero modelli 3D («genera un drago rosso con le corna»)\n• 🌍 creo mondi interi («crea un villaggio fitto»)\n• 🎨 cambio il tema («metti il tema viola»)\n• 📚 spiego ogni angolo del sito («come si scava il terreno?»)\n\nRiformula pure come preferisci: capisco anche le frasi storte. Ho chiesto anche al mio cervello grande di ragionarci sopra…`,
    action: { type: 'none' },
    suggestions: ['Cosa sai fare?', 'Come ruoto la visuale?', 'Crea un paesaggio', 'Genera un robot'],
    confidence: 0.3,
  }
  return { reply: fallback, ctx: next }
}

export const DEFAULT_SUGGESTIONS = [
  'Cosa sai fare?',
  'Genera un drago rosso',
  'Crea una città medievale',
  'Metti il tema viola',
]
