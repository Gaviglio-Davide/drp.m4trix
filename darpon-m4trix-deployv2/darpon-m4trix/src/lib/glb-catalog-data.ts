// ============================================================
// Catalogo modelli GLB gratuiti — file DATI.
// Tutti i modelli sono scaricabili e utilizzabili gratis:
// licenze aperte (CC0 / CC-BY / MIT) di Khronos glTF Samples,
// three.js e modelviewer.dev. Nessuna gemma, nessun credito.
// v16: catalogo ripulito — solo modelli belli e utilizzabili,
// con una categoria Personaggi ricca di modelli ANIMATI.
// Ogni URL è stato verificato (HTTP 200).
// ============================================================

export type GlbCatalogEntry = {
  id: string
  name: string
  category: string
  url: string
  size: number
  license: string
  animated?: boolean // ha animazioni che si vedono nell'anteprima
  desc?: string // v16: a cosa serve nella scena
}

export const GLB_CATALOG_CATEGORIES: {
  key: string
  emoji: string
  label: string
}[] = [
  { key: 'tutti', emoji: '✨', label: 'Tutti' },
  { key: 'personaggi', emoji: '🧍', label: 'Personaggi' },
  { key: 'creature', emoji: '🐾', label: 'Animali & Creature' },
  { key: 'veicoli', emoji: '🚗', label: 'Veicoli' },
  { key: 'casa', emoji: '🛋️', label: 'Casa & Mobili' },
  { key: 'oggetti', emoji: '🍎', label: 'Oggetti & Cibo' },
  { key: 'moda', emoji: '👗', label: 'Moda & Accessori' },
  { key: 'fantasy', emoji: '🐉', label: 'Fantasy & Sci-Fi' },
  { key: 'citta', emoji: '🏙️', label: 'Edifici & Città' },
]

const KH = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models'
const TJ = 'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf'

export const GLB_CATALOG: GlbCatalogEntry[] = [
  // ---------- PERSONAGGI (tutti con movimenti pronti) ----------
  { id: 'Soldier', name: 'Soldato in Marcia', category: 'personaggi', url: `${TJ}/Soldier.glb`, size: 2160468, license: 'MIT (three.js)', animated: true, desc: 'Cammina, corre e si mette in guardia: perfetto come eroe o soldato.' },
  { id: 'Xbot', name: 'Guerriero Robot', category: 'personaggi', url: `${TJ}/Xbot.glb`, size: 2930032, license: 'MIT (three.js)', animated: true, desc: 'Robot da combattimento: corre, colpisce e si mette in posa.' },
  { id: 'RobotExpressive', name: 'Robot Compagno', category: 'personaggi', url: `${TJ}/RobotExpressive/RobotExpressive.glb`, size: 463988, license: 'MIT (three.js)', animated: true, desc: 'Saluta, balla, salta e ride: la spalla comica della squadra.' },
  { id: 'Michelle', name: 'Ballerina', category: 'personaggi', url: `${TJ}/Michelle.glb`, size: 3276888, license: 'MIT (three.js)', animated: true, desc: 'Danza con movimenti fluidi: ottima per taverne e feste.' },
  { id: 'kira', name: 'Kira Avventuriera', category: 'personaggi', url: `${TJ}/kira.glb`, size: 12173128, license: 'MIT (three.js)', animated: true, desc: 'Eroina animata pronta per le grandi avventure.' },
  { id: 'BrainStem', name: 'Umanoide Animato', category: 'personaggi', url: `${KH}/BrainStem/glTF-Binary/BrainStem.glb`, size: 3194848, license: 'MIT', animated: true, desc: 'Umanoide che cammina: base perfetta per PNG.' },
  { id: 'CesiumMan', name: 'Viandante Animato', category: 'personaggi', url: `${KH}/CesiumMan/glTF-Binary/CesiumMan.glb`, size: 438044, license: 'CC-BY 4.0', animated: true, desc: 'Camminatore classico, leggero e affidabile.' },
  { id: 'RiggedFigure', name: 'Manichino Animato', category: 'personaggi', url: `${KH}/RiggedFigure/glTF-Binary/RiggedFigure.glb`, size: 50116, license: 'CC-BY 4.0', animated: true, desc: 'Scheletro in movimento: utile per test e pose.' },
  { id: 'RecursiveSkeletons', name: 'Scheletro Animato', category: 'personaggi', url: `${KH}/RecursiveSkeletons/glTF-Binary/RecursiveSkeletons.glb`, size: 561620, license: 'CC-BY 4.0', animated: true, desc: 'Scheletri che si animano: i guardiani dei dungeon.' },
  { id: 'Astronaut', name: 'Astronauta', category: 'personaggi', url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', size: 2744041, license: 'CC-BY (Google)', desc: 'Tuta spaziale completa: pronto per pianeti lontani.' },
  { id: 'RiggedSimple', name: 'Braccio Meccanico', category: 'personaggi', url: `${KH}/RiggedSimple/glTF-Binary/RiggedSimple.glb`, size: 15104, license: 'CC-BY 4.0', animated: true, desc: 'Braccio che si muove: una macchina da lavoro.' },

  // ---------- CREATURE ----------
  { id: 'Horse', name: 'Cavallo al Galoppo', category: 'creature', url: `${TJ}/Horse.glb`, size: 181808, license: 'MIT (three.js)', animated: true, desc: 'Galoppa in cerchio: pronto per le cariche.' },
  { id: 'Fox', name: 'Volpe Animata', category: 'creature', url: `${KH}/Fox/glTF-Binary/Fox.glb`, size: 162852, license: 'CC0', animated: true, desc: 'Cammina, corre e fa il bello: compagna selvatica.' },
  { id: 'Stork', name: 'Cicogna Volante', category: 'creature', url: `${TJ}/Stork.glb`, size: 76852, license: 'MIT (three.js)', animated: true, desc: 'Vola con le ali larghe.' },
  { id: 'Flamingo', name: 'Fenicottero Volante', category: 'creature', url: `${TJ}/Flamingo.glb`, size: 77428, license: 'MIT (three.js)', animated: true, desc: 'Rosa e in volo: colore nei cieli.' },
  { id: 'Parrot', name: 'Pappagallo Volante', category: 'creature', url: `${TJ}/Parrot.glb`, size: 97024, license: 'MIT (three.js)', animated: true, desc: 'Sbatta le ali e vola via.' },

  // ---------- VEICOLI ----------
  { id: 'ferrari', name: 'Auto Sportiva Rossa', category: 'veicoli', url: `${TJ}/ferrari.glb`, size: 1681572, license: 'MIT (three.js)', desc: 'La rossa che tutti sognano.' },
  { id: 'CesiumMilkTruck', name: 'Camion del Latte', category: 'veicoli', url: `${KH}/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb`, size: 369980, license: 'CC-BY 4.0', desc: 'Camion vintage per le consegne.' },
  { id: 'ToyCar', name: 'Auto Giocattolo', category: 'veicoli', url: `${KH}/ToyCar/glTF-Binary/ToyCar.glb`, size: 5422412, license: 'CC0', desc: 'Piccola, lucida, con ruote vere.' },
  { id: 'CarConcept', name: 'Auto Concept', category: 'veicoli', url: `${KH}/CarConcept/glTF-Binary/CarConcept.glb`, size: 11778688, license: 'CC-BY 4.0', desc: 'Prototipo futuristico da salone.' },

  // ---------- CASA & MOBILI ----------
  { id: 'GlamVelvetSofa', name: 'Divano di Velluto', category: 'casa', url: `${KH}/GlamVelvetSofa/glTF-Binary/GlamVelvetSofa.glb`, size: 3149844, license: 'CC-BY 4.0', desc: 'Divano elegante per il salotto del castello.' },
  { id: 'ClearcoatWicker', name: 'Poltrona di Vimini', category: 'casa', url: `${KH}/ClearcoatWicker/glTF-Binary/ClearcoatWicker.glb`, size: 1299752, license: 'CC0', desc: 'Poltrona intrecciata da veranda.' },
  { id: 'ChairDamaskPurplegold', name: 'Sedia Damasco Oro', category: 'casa', url: `${KH}/ChairDamaskPurplegold/glTF-Binary/ChairDamaskPurplegold.glb`, size: 2028924, license: 'CC-BY 4.0', desc: 'Sedia regale con tessuto damasco.' },
  { id: 'GlassVaseFlowers', name: 'Vaso di Fiori', category: 'casa', url: `${KH}/GlassVaseFlowers/glTF-Binary/GlassVaseFlowers.glb`, size: 1819824, license: 'CC0', desc: 'Vetro e fiori per decorare ogni stanza.' },
  { id: 'PotOfCoals', name: 'Braciere Ardente', category: 'casa', url: `${KH}/PotOfCoals/glTF-Binary/PotOfCoals.glb`, size: 4696240, license: 'CC-BY 4.0', desc: 'Il fuoco del fabbro: carboni ardenti pronti per la forgia.' },
  { id: 'coffeemat', name: 'Macchina del Caffè', category: 'casa', url: `${TJ}/coffeemat.glb`, size: 4780672, license: 'MIT (three.js)', desc: 'Bar da città: il caffè non manca mai.' },
  { id: 'Lantern', name: 'Lanterna Magica', category: 'casa', url: `${KH}/Lantern/glTF-Binary/Lantern.glb`, size: 9564264, license: 'CC0', desc: 'Lanterna dettagliata per percorsi illuminati.' },
  { id: 'AnisotropyBarnLamp', name: 'Lampada da Fienile', category: 'casa', url: `${KH}/AnisotropyBarnLamp/glTF-Binary/AnisotropyBarnLamp.glb`, size: 7833440, license: 'CC-BY 4.0', desc: 'Lampada rustica per stalle e laboratori.' },

  // ---------- OGGETTI ----------
  { id: 'Shishkebab', name: 'Spiedino', category: 'oggetti', url: 'https://modelviewer.dev/shared-assets/models/shishkebab.glb', size: 306571, license: 'CC-BY (Google)', desc: 'Cibo pronto per le taverne.' },
  { id: 'IridescentDishWithOlives', name: 'Piatto di Olive', category: 'oggetti', url: `${KH}/IridescentDishWithOlives/glTF-Binary/IridescentDishWithOlives.glb`, size: 5742828, license: 'CC-BY 4.0', desc: 'Piatto appariscente per banchetti.' },
  { id: 'TrafficCone', name: 'Cono Stradale', category: 'oggetti', url: `${KH}/TrafficCone/glTF-Binary/TrafficCone.glb`, size: 1922464, license: 'CC0', desc: 'Cantiere? Serve sempre.' },
  { id: 'Avocado', name: 'Avocado', category: 'oggetti', url: `${KH}/Avocado/glTF-Binary/Avocado.glb`, size: 8110040, license: 'CC0', desc: 'Frutto super dettagliato.' },
  { id: 'WaterBottle', name: "Bottiglietta d'Acqua", category: 'oggetti', url: `${KH}/WaterBottle/glTF-Binary/WaterBottle.glb`, size: 8966700, license: 'CC0', desc: 'Idratazione garantita.' },
  { id: 'BoomBox', name: 'Radio Boombox', category: 'oggetti', url: `${KH}/BoomBox/glTF-Binary/BoomBox.glb`, size: 10614184, license: 'CC0', desc: 'Musica a tutto volume.' },

  // ---------- MODA ----------
  { id: 'SunglassesKhronos', name: 'Occhiali da Sole', category: 'moda', url: `${KH}/SunglassesKhronos/glTF-Binary/SunglassesKhronos.glb`, size: 371188, license: 'CC-BY 4.0', desc: 'Stile da spiaggia.' },
  { id: 'ChronographWatch', name: 'Orologio Cronografo', category: 'moda', url: `${KH}/ChronographWatch/glTF-Binary/ChronographWatch.glb`, size: 7446368, license: 'CC-BY 4.0', desc: 'Tempo di lavorazione: cronometrato.' },
  { id: 'MaterialsVariantsShoe', name: 'Sneaker (3 Colori)', category: 'moda', url: `${KH}/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb`, size: 7833592, license: 'CC-BY 4.0', desc: 'Tre colorazioni in un modello.' },

  // ---------- FANTASY & SCI-FI ----------
  { id: 'DragonAttenuation', name: 'Drago 3D', category: 'fantasy', url: `${KH}/DragonAttenuation/glTF-Binary/DragonAttenuation.glb`, size: 6401616, license: 'CC0', desc: 'Il dragone statuario: imponente sulla montagna.' },
  { id: 'DragonDispersion', name: 'Drago di Cristallo', category: 'fantasy', url: `${KH}/DragonDispersion/glTF-Binary/DragonDispersion.glb`, size: 6401724, license: 'CC0', desc: 'Cristallo puro: guarisce chi lo tocca.' },
  { id: 'ScatteringSkull', name: 'Teschio di Cristallo', category: 'fantasy', url: `${KH}/ScatteringSkull/glTF-Binary/ScatteringSkull.glb`, size: 8959044, license: 'CC0', desc: 'Reliquia misteriosa per i dungeon.' },
  { id: 'PrimaryIonDrive', name: 'Motore Ionico', category: 'fantasy', url: `${TJ}/PrimaryIonDrive.glb`, size: 5800408, license: 'MIT (three.js)', animated: true, desc: 'Spazioastrazione animata per le astronavi.' },
  { id: 'DamagedHelmet', name: 'Casco da Combattimento', category: 'fantasy', url: `${KH}/DamagedHelmet/glTF-Binary/DamagedHelmet.glb`, size: 3773916, license: 'CC-BY-NC 4.0 (no commerciale)', desc: 'La guerra lascia i segni.' },

  // ---------- EDIFICI & CITTÀ ----------
  { id: 'LittlestTokyo', name: 'Tokyo Miniatura Animata', category: 'citta', url: `${TJ}/LittlestTokyo.glb`, size: 4133072, license: 'MIT (three.js)', animated: true, desc: 'Un intero isolato in miniatura, con ingranaggi che girano.' },
  { id: 'VirtualCity', name: 'Città Virtuale', category: 'citta', url: `${KH}/VirtualCity/glTF-Binary/VirtualCity.glb`, size: 3085416, license: 'Uso libero', desc: 'Skyline completo per gli sfondi urbani.' },
]
