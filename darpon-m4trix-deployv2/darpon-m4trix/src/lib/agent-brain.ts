'use client'

// ============================================================
// Agente Darpx — cervello locale (CLIENT, istantaneo, zero costi)
// v6: riconoscimento fuzzy (Levenshtein), base di conoscenza
// raddoppiata, comando cambio tema, generazione 3D col MOTORE
// INTERNO (nessuna chiave), risposte più elaborate.
// Per le domande davvero difficili passa la palla al LLM server.
// ============================================================

import type { GenKind, GenSize } from '@/lib/worldgen'
import type { DashboardTab } from '@/lib/ui-store'
import { THEMES } from '@/lib/themes'

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

/** distanza di Levenshtein (piccola, per il fuzzy) */
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

/** parola simile? (1-2 errori di battitura per parole ≥5 lettere) */
function fuzzyWord(word: string, target: string): boolean {
  if (word === target) return true
  if (target.length >= 5 && word.length >= 4) {
    return lev(word, target) <= (target.length >= 8 ? 2 : 1)
  }
  return false
}

// ---------- base di conoscenza del sito ----------

const KB: { keys: string[]; title: string; body: string[] }[] = [
  {
    keys: ['ruota la visuale', 'ruotare la visuale', 'girare la visuale', 'girare la camera', 'visuale', 'camera', 'punto di vista', 'camera dell editor'],
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
    keys: ['terreno', 'collina', 'montagna alza', 'scavare', 'scava', 'lago', 'valle', 'spiana', 'sculptare', 'modellare il terreno'],
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
    keys: ['giocare', 'gioca', 'modalita giocatore', 'esplorare', 'in prima persona', 'camminare', 'modalita di gioco', 'entrare nel mondo'],
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
    keys: ['salvare', 'salvataggio', 'salva', 'snapshot', 'versioni', 'autosalvataggio', 'autosave', 'dove finiscono i mondi'],
    title: '💾 Salvataggi',
    body: [
      '• Il mondo si salva in automatico mentre lavori (vedi lo stato in alto)',
      '• Con il bottone Cronologia/Salvataggi crei SNAPSHOT con nome: versioni a cui tornare quando vuoi',
      '• I progetti sono tutti nella home, reparto «I miei mondi»',
    ],
  },
  {
    keys: ['importare modello', 'importare un modello', 'caricare modello', 'caricare un modello', 'importa', 'glb', 'gltf', 'file 3d', 'modelli importati', 'progetti importati', 'caricare i modelli'],
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
    keys: ['non vedo', 'non si vede', 'invisibile', 'scomparso', 'non trovo il modello', 'modello non appare', 'modello invisibile'],
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
    keys: ['struttura', 'strutture', 'costruttore di case', 'pezzi', 'strutturelab', 'costruire case pezzo per pezzo', 'progettare edifici'],
    title: '🏗️ Reparto Strutture',
    body: [
      '• Home → «Strutture»: progetti edifici pezzo per pezzo su una griglia 3D',
      '• Pavimenti, muri, tetti, porte e finestre colorabili, su più piani',
      '• Le strutture salvate finiscono nella barra oggetti di ogni mondo come oggetti unici',
      '• Puoi duplicarle, rinominarle e riutilizzarle quanti volte vuoi',
    ],
  },
  {
    keys: ['immagine', 'foto', 'dalla foto', 'mondo da un immagine', 'mondo da una immagine', 'world labs', 'trasformare foto in mondo'],
    title: '🖼️ Darpx.ai · Immagine → Mondo',
    body: [
      '• Home → «Darpx.ai» → carica una qualsiasi immagine',
      '• Darpx la analizza (colori, luce, paesaggio) e costruisce un mondo 3D coerente: colline, laghi, boschi',
      '• Se l\'immagine è notturna aggiunge lampioni; se è dominata dal blu fa un lago grande',
      '• Spunta «usa anche come cielo» per farne il panorama del mondo',
    ],
  },
  {
    keys: ['motore interno', 'senza chiavi', 'senza api', 'genera da solo', 'creare 3d gratis', '3d gratis', 'quanto costa generare', 'limiti generazione', 'quanti modelli posso'],
    title: '🧬 Il Motore interno Darpx (novità!)',
    body: [
      'Il reparto Darpx.ai ora ha un motore 3D **integrale**, costruito da zero:',
      '• Genera nel TUO browser: nessuna chiave API, nessun limite, costo zero',
      '• Capisce l\'italiano: colori, materiali (oro, legno, ghiaccio…), taglia, dettagli',
      '• Sa creare: draghi, cavalieri, maghi, cavalli, lupi, aquile, serpenti, robot, spade, scudi, navi, case, torri, castelli, alberi, pozioni, cristalli, forzieri…',
      '• Ogni generazione è un GLB vero: anteprima 👁️, download, uso nell\'editor',
      '• «Genera variante» crea una versione diversa dello stesso prompt',
      'Chiedimi «genera un drago» e lo faccio subito! 🐉',
    ],
  },
  {
    keys: ['testo', 'creare un personaggio', 'personaggio 3d', 'mostro', '3d da testo', 'meshy', 'tripo', 'hunyuan', 'stable fast', 'chiave api', 'motore 3d', 'motori esterni', 'fotoreale'],
    title: '🧊 Motori esterni (opzionali)',
    body: [
      '• Oltre al motore interno puoi usare i motori cloud: Tripo, fal.ai (Hunyuan 3D), Stable Fast 3D e Meshy',
      '• Servono per look fotorealistici: se uno si blocca, passa al successivo in automatico',
      '• Serve una chiave API gratuita del motore che preferisci (salvata cifrata nel database)',
      '• Il modello finisce in «Progetti importati» con anteprima 👁️ e nella barra oggetti dell\'editor',
      'Il motore interno invece parte subito, senza nulla da configurare 🧬',
    ],
  },
  {
    keys: ['chi sei', 'cos e darpx', 'cos e darpx', 'darpx', 'agente', 'come ti chiami', 'chi ti ha creato', 'sei un robot', 'sei una ia', 'sei un ai'],
    title: '✨ Sono l\'Agente Darpx',
    body: [
      'Sono l\'assistente AI integrato nel sito: rispondo e faccio cose concrete:',
      '• «crea un mondo medievale grande» → lo genero e te lo apro',
      '• «genera un drago» → lo creo SUBITO col motore interno 🧬',
      '• «metti il tema viola» → cambio il colore del sito',
      '• «vai alle strutture» → cambio reparto per te',
      '• «come si ruota la visuale?» → ti spiego tutto del sito',
    ],
  },
  {
    keys: ['tema', 'colore del sito', 'accento', 'cambiare colore', 'colore', 'colori del sito', 'aspetto del sito', 'personalizzare il sito'],
    title: '🎨 Temi e colori del sito',
    body: [
      'Il sito ha 16 temi colore: Bosco, Mare, Cielo, Notte, Lavanda, Viola, Fucsia, Rosa, Ciliegia, Terracotta, Arancio, Miele, Lime, Menta, Caffè e Ardesia.',
      '• Puoi cambiarli dall\'ingranaggio ⚙️ in alto a destra → scheda Colori',
      '• Oppure DIMMILO: «metti il tema viola», «voglio il sito rosa»… lo faccio al volo!',
      '• La scelta viene ricordata sul tuo account e seguita da tutta l\'interfaccia',
    ],
  },
  {
    keys: ['profilo', 'cambiare nome', 'password', 'account', 'cambio password', 'dati personali', 'privacy', 'privato'],
    title: '👤 Il tuo account',
    body: [
      '• In alto a destra trovi il tuo profilo: nome, tema colore e cambio password',
      '• Il tema scelto vale su tutto il sito e viene ricordato',
      '• Tutto ciò che crei è privato e visibile solo nel tuo account',
    ],
  },
  {
    keys: ['undo', 'annulla', 'ctrl z', 'rifare', 'rimediare', 'tornare indietro'],
    title: '↩️ Annullare le modifiche',
    body: [
      '• Il bottone freccia curva (in alto nell\'editor) annulla l\'ultima azione',
      '• Vale per oggetti piazzati, spostati, colorati e per il terreno scolpito',
      '• Puoi annullare più volte per tornare indietro di molti passi',
    ],
  },
  {
    keys: ['eliminare', 'cancellare', 'rimuovere', 'cancellare oggetto', 'eliminare oggetto', 'buttare via', 'distruggere'],
    title: '🗑️ Eliminare oggetti e progetti',
    body: [
      'Nell\'editor:',
      '• Click DESTRO secco su un oggetto lo elimina all\'istante',
      'Nella home:',
      '• Ogni card dei mondi ha il bottone 🗑 per eliminare il progetto (con conferma)',
      '• I modelli si eliminano da «Progetti importati» e le strutture da «Strutture»',
    ],
  },
  {
    keys: ['strade', 'strada', 'lastricare', 'percorso', 'collegare le case', 'via'],
    title: '🛣️ Le strade',
    body: [
      '• Nella barra oggetti dell\'editor trovi la STRADA: si stende seguendo il terreno',
      '• Clicca più punti in sequenza per un percorso curvo, doppio click per chiudere',
      '• Le strade si agganciano tra loro e formano reticoli veri',
      '• In modalità Gioca ci cammini sopra come in un videogioco',
    ],
  },
  {
    keys: ['colore degli oggetti', 'colorare', 'dipingere', 'cambiare colore oggetto', 'verniciare', 'tinta'],
    title: '🖌️ Colorare gli oggetti',
    body: [
      '• Seleziona l\'oggetto piazzato e usa il pannello colore: cambia al volo',
      '• Vale per case, torri, alberi, pezzi delle strutture e molto altro',
      '• Per le tue STRUTTURE il colore si sceglie pezzo per pezzo nel costruttore',
    ],
  },
  {
    keys: ['admin', 'amministratore', 'pannello di controllo', 'gestire il sito', 'gestione utenti'],
    title: '🛡️ Area admin',
    body: [
      '• Il pannello admin è all\'indirizzo /admin (link discreto nel footer)',
      '• Serve la password da amministratore (impostata su Vercel come ADMIN_PASSWORD)',
      '• Da lì: diagnostica del sito, gestione utenti, progetti, modelli, testi del sito, chiavi 3D globali e configurazione dell\'agente AI',
    ],
  },
  {
    keys: ['cellulare', 'telefono', 'mobile', 'tablet', 'da smartphone', 'touch'],
    title: '📱 Da cellulare',
    body: [
      '• Il sito funziona anche da telefono e tablet, tutto si tocca col dito',
      '• Nell\'editor: un dito = piazza/seleziona · due dita = ruota e zoom',
      '• In Gioca: joystick a schermo per camminare e trascina per guardarsi intorno',
    ],
  },
  {
    keys: ['personaggio', 'eroe', 'con chi gioco', 'giocatore', 'avatar', 'scegliere personaggio'],
    title: '🧑 L\'eroe e il personaggio',
    body: [
      '• Nell\'editor, il bottone Personaggio apre la scelta: Eroe classico o uno dei TUOI modelli GLB',
      '• Se hai caricato un cavaliere o una creatura, puoi entrarci dentro in modalità Gioca',
      '• Anche i modelli generati dal motore interno vanno bene come personaggio!',
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

const WORLD_TRIGGERS = ['mondo', 'mappa', 'citta', 'villaggio', 'fortezza', 'castello', 'paesaggio', 'bosco', 'lago', 'isola', 'deserto']

function extractObjectPhrase(t: string): string | null {
  // "genera un drago verde con le ali" → "un drago verde con le ali"
  const m = /(?:genera|crea|fammi|fami|fai|voglio|creami|creare|dammi)\s+(?:un|uno|una|il|lo|la|dei|delle|qualche)?\s*(.{3,120})/.exec(t)
  if (!m) return null
  return m[1].replace(/[.!?]+$/, '').trim()
}

/** trova il tema richiesto («metti il tema viola», «voglio il sito rosa») */
function parseTheme(t: string): string | null {
  const m = /(?:tema|colore|sfondo|sito)\s+(?:di\s+|da\s+|in\s+)?([a-z]+)|voglio il sito ([a-z]+)/.exec(t)
  if (!m) return null
  const wanted = m[1] ?? m[2] ?? ''
  if (!wanted) return null
  for (const th of THEMES) {
    if (fuzzyWord(wanted, norm(th.name)) || fuzzyWord(wanted, norm(th.id))) return th.id
  }
  return null
}

// ---------- risposte pronte ----------

const GREETING_REPLY: AgentReply = {
  text: `Ciao! 👋 Sono l'**Agente Darpx**, l'assistente del sito.\n\nPosso fare cose vere, non solo chiacchiere:\n• «genera un drago» → lo creo SUBITO col mio motore interno 🧬\n• «crea un mondo medievale grande» → lo genero e lo apro\n• «metti il tema viola» → cambio il colore del sito\n• «come si scava il terreno?» → spiego ogni funzione\n\nCosa vuoi fare?`,
  action: { type: 'none' },
  suggestions: ['Genera un drago rosso', 'Crea un villaggio grande', 'Metti il tema viola', 'Cosa sai fare?'],
  confidence: 1,
}

const HELP_REPLY: AgentReply = {
  text: `Ecco cosa so fare **subito**:\n\n🧬 **Generare modelli 3D** (motore interno, senza chiavi) — «genera un drago rosso», «crea una spada d'oro», «un robot di ferro»\n🌍 **Generare mondi** — «crea una fortezza enorme», «fammi un villaggio fitto di case»\n🎨 **Cambiare il tema** — «metti il tema fucsia», «voglio il sito azzurro»\n🧭 **Muovermi nel sito** — «vai alle strutture», «apri Darpx.ai», «mostra i miei mondi»\n📚 **Spiegare tutto** — visuale, terreno, gioco, strade, salvataggi, import, strutture, chiavi 3D…\n\nScrivi quello che vuoi: capisco l'italiano, anche con errori di battitura.`,
  action: { type: 'none' },
  suggestions: ['Genera un drago', 'Crea una città medievale', 'Metti il tema rosa', 'Come importo i modelli?'],
  confidence: 1,
}

const FALLBACK_REPLY: AgentReply = {
  text: `Hmm, questa non la conosco a fondo 😅\n\nMa posso darti una mano con:\n• 🧬 generare modelli 3D con il mio motore interno («genera un drago»)\n• 🌍 creare mondi interi («crea un villaggio»)\n• 🎨 cambiare il tema del sito («metti il tema mare»)\n• 📚 spiegarti ogni angolo del sito\n\nProva a riformulare, oppure usa un suggerimento qui sotto.`,
  action: { type: 'none' },
  suggestions: ['Cosa sai fare?', 'Come ruoto la visuale?', 'Crea un paesaggio', 'Genera un robot'],
  confidence: 0.3,
}

// ---------- cervello principale ----------

export function askBrain(message: string): AgentReply {
  const t = norm(message)
  if (!t) return FALLBACK_REPLY

  // saluti
  if (
    /^(ciao|salve|hey|ehi|buongiorno|buonasera|hola|hello|yo|ola)[\s!.,]*$/.test(t) ||
    t === 'ciao darpx' ||
    t === 'ciao darpx come stai'
  ) {
    return GREETING_REPLY
  }

  // come stai
  if (has(t, 'come stai', 'come va', 'tutto bene')) {
    return {
      text: 'Alla grande, pronto a costruire mondi! 🚀\n\nDimmi: genero un modello 3D, creo un mondo o ti spiego qualcosa del sito?',
      action: { type: 'none' },
      suggestions: ['Genera un drago', 'Crea un villaggio', 'Cosa sai fare?'],
      confidence: 1,
    }
  }

  // aiuto / capacità
  if (
    has(t, 'cosa sai fare', 'cosa puoi fare', 'che cosa sai', 'aiuto', 'help', 'come funzioni', 'istruzioni', 'comandi') &&
    !has(t, 'come si usa')
  ) {
    return HELP_REPLY
  }

  // cambio tema
  if (has(t, 'tema', 'colore') && has(t, 'metti', 'cambia', 'voglio', 'imposta', 'fai', 'rendi', 'mettere') ) {
    const themeId = parseTheme(t)
    if (themeId) {
      const th = THEMES.find(x => x.id === themeId)!
      return {
        text: `Consideralo fatto: **tema ${th.name}** ${th.id === 'viola' ? '💜' : '🎨'} applicato!\n\nTutta l'interfaccia si tinge del nuovo colore (e lo ricordo sul tuo account).`,
        action: { type: 'setTheme', themeId },
        suggestions: ['Metti il tema notte', 'Torna al tema bosco', 'Cosa sai fare?'],
        confidence: 1,
      }
    }
    // colore non riconosciuto → spiega
    return {
      text: `Posso cambiare il colore del sito al volo! 🎨\n\nDimmi per esempio: «metti il tema **viola**», «voglio il sito **rosa**» o «cambia in **cielo**».\n\nI temi disponibili: ${THEMES.map(x => x.name).join(', ')}.`,
      action: { type: 'none' },
      suggestions: ['Metti il tema viola', 'Metti il tema mare', 'Metti il tema arancio'],
      confidence: 0.95,
    }
  }

  // navigazione
  const navMap: { tab: DashboardTab; words: string[] }[] = [
    { tab: 'mondi', words: ['i miei mondi', 'mondi', 'progetti', 'le mie citta'] },
    { tab: 'genera', words: ['genera', 'reparto genera'] },
    { tab: 'importati', words: ['importati', 'modelli importati', 'libreria modelli', 'modelli 3d'] },
    { tab: 'strutture', words: ['strutture', 'struttura', 'costruttore'] },
    { tab: 'darpx', words: ['darpx', 'ai', 'intelligenza artificiale'] },
  ]
  if (has(t, 'vai', 'apri', 'mostra', 'portami', 'voglio vedere', 'fammi vedere', 'voglio andare', 'torna', 'riporta')) {
    for (const n of navMap) {
      if (n.tab !== 'genera' && n.words.some(w => fuzzyWord(t, w) || t.includes(w))) {
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
      'crea un paesaggio', 'genera un mondo', 'genera una citta', 'genera un villaggio',
      'genera una fortezza', 'genera un castello', 'genera un paesaggio', 'fammi un mondo', 'fammi una citta',
      'fammi un villaggio', 'fammi una fortezza', 'nuovo mondo', 'costruisci un mondo', 'creami un mondo',
      'crea un isola', 'crea un bosco', 'crea un lago', 'voglio un mondo') ||
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

  // generazione modello 3D → MOTORE INTERNO
  if (has(t, 'genera', 'crea', 'fammi', 'creami', 'voglio', 'fai', 'dammi', 'disegna', 'modella')) {
    const phrase = extractObjectPhrase(t)
    const looksLikeWorld = phrase ? has(norm(phrase), ...WORLD_TRIGGERS) : true
    if (phrase && !looksLikeWorld) {
      return {
        text: `Subito! 🧬 Il mio **motore interno** crea **${phrase}** in questo preciso momento — senza chiavi, senza attese.\n\nAppena pronto trovi il modello nell'anteprima 3D: puoi salvarlo nei Progetti importati, scaricarlo o chiedere una **variante**.`,
        action: { type: 'prefill3d', prompt: phrase },
        suggestions: ['Genera una variante', 'Salvalo nei modelli', 'Cosa sai generare?'],
        confidence: 1,
      }
    }
  }

  // base di conoscenza (con fuzzy scoring)
  let best: { score: number; entry: (typeof KB)[number] } | null = null
  const words = t.split(' ')
  for (const entry of KB) {
    let score = 0
    for (const k of entry.keys) {
      const nk = norm(k)
      if (t.includes(nk)) {
        score += nk.split(' ').length * 3 + 2
      } else {
        // fuzzy: ogni parola della frase vicina a una parola chiave lunga
        const kw = nk.split(' ')
        if (kw.length <= 2) {
          for (const w of words) {
            if (w.length >= 4 && fuzzyWord(w, nk)) {
              score += 2
              break
            }
          }
        }
      }
    }
    // testo interno: le parole della domanda compaiono nel corpo?
    for (const w of words) {
      if (w.length >= 6 && entry.body.some(b => b.toLowerCase().includes(w))) score += 1
    }
    if (score > 0 && (!best || score > best.score)) best = { score, entry }
  }
  if (best && best.score >= 4) {
    return {
      text: `${best.entry.title}\n\n${best.entry.body.join('\n')}`,
      action: { type: 'none' },
      suggestions: best.entry.keys[0]?.includes('tema')
        ? ['Metti il tema viola', 'Metti il tema mare', 'Cosa sai fare?']
        : ['Cosa sai fare?', 'Crea un mondo', 'Genera un drago'],
      confidence: 0.9,
    }
  }

  // ringraziamenti
  if (has(t, 'grazie', 'perfetto', 'grandee', 'top', 'fantastico', 'bello', 'mitico', 'spettacolare', 'bravo')) {
    return {
      text: 'Figurati! 😄 Se ti serve altro sono qui: modelli 3D, mondi, temi, spiegazioni… chiedi pure!',
      action: { type: 'none' },
      suggestions: ['Cosa sai fare?', 'Crea un villaggio', 'Genera un drago'],
      confidence: 0.85,
    }
  }

  // congedo
  if (has(t, 'arrivederci', 'ciao ciao', 'a dopo', 'buonanotte', 'buona giornata', 'esco', 'vado')) {
    return {
      text: 'A presto! 👋 I tuoi mondi ti aspettano qui, al sicuro nel tuo account.',
      action: { type: 'none' },
      suggestions: ['Torna ai mondi'],
      confidence: 0.9,
    }
  }

  // domanda generica → lascia spazio al LLM
  return FALLBACK_REPLY
}

export const DEFAULT_SUGGESTIONS = [
  'Cosa sai fare?',
  'Genera un drago rosso',
  'Crea una città medievale',
  'Metti il tema viola',
]
