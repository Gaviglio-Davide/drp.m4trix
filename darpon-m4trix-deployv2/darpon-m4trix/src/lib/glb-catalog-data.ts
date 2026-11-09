// ============================================================
// Catalogo modelli GLB gratuiti (stile Meshy) — file DATI.
// Tutti i modelli sono scaricabili e utilizzabili gratis:
// licenze aperte (CC0 / CC-BY / MIT) di Khronos glTF Samples,
// three.js e modelviewer.dev. Nessuna gemma, nessun credito.
// Generato automaticamente — ogni URL è stato verificato (HTTP 200).
// ============================================================

export type GlbCatalogEntry = {
  id: string
  name: string
  category: string
  url: string
  size: number
  license: string
  animated?: boolean // v15: ha animazioni che si vedono nell'anteprima
}

export const GLB_CATALOG_CATEGORIES: {
  key: string
  emoji: string
  label: string
}[] = [
  { key: 'tutti', emoji: '✨', label: 'Tutti' },
  { key: "personaggi", emoji: "🧍", label: "Personaggi" },
  { key: "creature", emoji: "🐾", label: "Animali & Creature" },
  { key: "veicoli", emoji: "🚗", label: "Veicoli" },
  { key: "casa", emoji: "🛋️", label: "Casa & Mobili" },
  { key: "oggetti", emoji: "🍎", label: "Oggetti & Cibo" },
  { key: "moda", emoji: "👗", label: "Moda & Accessori" },
  { key: "fantasy", emoji: "🐉", label: "Fantasy & Sci-Fi" },
  { key: "citta", emoji: "🏙️", label: "Edifici & Città" },
  { key: "studio", emoji: "🧪", label: "Studio & Materiali" },
]

export const GLB_CATALOG: GlbCatalogEntry[] = [
  { id: "Astronaut", name: "Astronauta", category: "personaggi", url: "https://modelviewer.dev/shared-assets/models/Astronaut.glb", size: 2744041, license: "CC-BY (Google)" },
  { id: "RiggedFigure", name: "Manichino Animato", category: "personaggi", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/RiggedFigure/glTF-Binary/RiggedFigure.glb", size: 50116, license: "CC-BY 4.0", animated: true },
  { id: "RobotExpressive", name: "Robot Ballerino", category: "personaggi", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/RobotExpressive/RobotExpressive.glb", size: 463988, license: "MIT (three.js)", animated: true },
  { id: "RecursiveSkeletons", name: "Scheletro Animato", category: "personaggi", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/RecursiveSkeletons/glTF-Binary/RecursiveSkeletons.glb", size: 561620, license: "CC-BY 4.0", animated: true },
  { id: "Soldier", name: "Soldato Animato", category: "personaggi", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/Soldier.glb", size: 2160468, license: "MIT (three.js)" },
  { id: "BrainStem", name: "Umanoide Animato", category: "personaggi", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BrainStem/glTF-Binary/BrainStem.glb", size: 3194848, license: "MIT", animated: true },
  { id: "CesiumMan", name: "Uomo Animato", category: "personaggi", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb", size: 438044, license: "CC-BY 4.0", animated: true },
  { id: "Horse", name: "Cavallo al Galoppo", category: "creature", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/Horse.glb", size: 181808, license: "MIT (three.js)", animated: true },
  { id: "Stork", name: "Cicogna Volante", category: "creature", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/Stork.glb", size: 76852, license: "MIT (three.js)", animated: true },
  { id: "Flamingo", name: "Fenicottero Volante", category: "creature", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/Flamingo.glb", size: 77428, license: "MIT (three.js)", animated: true },
  { id: "Duck", name: "Paperella", category: "creature", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb", size: 120484, license: "Uso libero" },
  { id: "Parrot", name: "Pappagallo Volante", category: "creature", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/Parrot.glb", size: 97024, license: "MIT (three.js)", animated: true },
  { id: "BarramundiFish", name: "Pesce Barramundi", category: "creature", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb", size: 12488144, license: "CC0" },
  { id: "Fox", name: "Volpe Animata", category: "creature", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb", size: 162852, license: "CC0", animated: true },
  { id: "CarConcept", name: "Auto Concept", category: "veicoli", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb", size: 11778688, license: "CC-BY 4.0" },
  { id: "ToyCar", name: "Auto Giocattolo", category: "veicoli", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ToyCar/glTF-Binary/ToyCar.glb", size: 5422412, license: "CC0" },
  { id: "CesiumMilkTruck", name: "Camion del Latte", category: "veicoli", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb", size: 369980, license: "CC-BY 4.0" },
  { id: "PotOfCoalsAnimationPointer", name: "Braciere Animato", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/PotOfCoalsAnimationPointer/glTF-Binary/PotOfCoalsAnimationPointer.glb", size: 6326684, license: "CC-BY 4.0", animated: true },
  { id: "PotOfCoals", name: "Braciere Ardente", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/PotOfCoals/glTF-Binary/PotOfCoals.glb", size: 4696240, license: "CC-BY 4.0" },
  { id: "GlassHurricaneCandleHolder", name: "Candelabro in Vetro", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/GlassHurricaneCandleHolder/glTF-Binary/GlassHurricaneCandleHolder.glb", size: 2705400, license: "CC-BY 4.0" },
  { id: "GlamVelvetSofa", name: "Divano di Velluto", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/GlamVelvetSofa/glTF-Binary/GlamVelvetSofa.glb", size: 3149844, license: "CC-BY 4.0" },
  { id: "SheenWoodLeatherSofa", name: "Divano Pelle e Legno", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SheenWoodLeatherSofa/glTF-Binary/SheenWoodLeatherSofa.glb", size: 10107912, license: "CC0" },
  { id: "GlassBrokenWindow", name: "Finestra Rotta", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/GlassBrokenWindow/glTF-Binary/GlassBrokenWindow.glb", size: 1076624, license: "CC-BY 4.0" },
  { id: "CommercialRefrigerator", name: "Frigorifero Commerciale", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CommercialRefrigerator/glTF-Binary/CommercialRefrigerator.glb", size: 10131180, license: "CC-BY 4.0" },
  { id: "LightsPunctualLamp", name: "Lampada Colorata", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/LightsPunctualLamp/glTF-Binary/LightsPunctualLamp.glb", size: 4341320, license: "CC-BY 4.0" },
  { id: "AnisotropyBarnLamp", name: "Lampada da Fienile", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnisotropyBarnLamp/glTF-Binary/AnisotropyBarnLamp.glb", size: 7833440, license: "CC-BY 4.0" },
  { id: "IridescenceLamp", name: "Lampada Iridescente", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescenceLamp/glTF-Binary/IridescenceLamp.glb", size: 4083912, license: "CC-BY 4.0" },
  { id: "Lantern", name: "Lanterna Magica", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Lantern/glTF-Binary/Lantern.glb", size: 9564264, license: "CC0" },
  { id: "DiffuseTransmissionPlant", name: "Pianta di Vetro", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DiffuseTransmissionPlant/glTF-Binary/DiffuseTransmissionPlant.glb", size: 5759100, license: "CC0" },
  { id: "SheenChair", name: "Poltrona di Seta", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SheenChair/glTF-Binary/SheenChair.glb", size: 4125648, license: "CC0" },
  { id: "ClearcoatWicker", name: "Poltrona di Vimini", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ClearcoatWicker/glTF-Binary/ClearcoatWicker.glb", size: 1299752, license: "CC0" },
  { id: "SpecularSilkPouf", name: "Pouf di Seta", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SpecularSilkPouf/glTF-Binary/SpecularSilkPouf.glb", size: 4632512, license: "CC-BY 4.0" },
  { id: "ChairDamaskPurplegold", name: "Sedia Damasco Oro", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ChairDamaskPurplegold/glTF-Binary/ChairDamaskPurplegold.glb", size: 2028924, license: "CC-BY 4.0" },
  { id: "GlassVaseFlowers", name: "Vaso di Fiori", category: "casa", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/GlassVaseFlowers/glTF-Binary/GlassVaseFlowers.glb", size: 1819824, license: "CC0" },
  { id: "Avocado", name: "Avocado", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb", size: 8110040, license: "CC0" },
  { id: "WaterBottle", name: "Bottiglietta d'Acqua", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/WaterBottle/glTF-Binary/WaterBottle.glb", size: 8966700, license: "CC0" },
  { id: "RiggedSimple", name: "Braccio Meccanico", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/RiggedSimple/glTF-Binary/RiggedSimple.glb", size: 15104, license: "CC-BY 4.0", animated: true },
  { id: "IridescenceAbalone", name: "Conchiglia Iridescente", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescenceAbalone/glTF-Binary/IridescenceAbalone.glb", size: 9300744, license: "CC-BY 4.0" },
  { id: "TrafficCone", name: "Cono Stradale", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/TrafficCone/glTF-Binary/TrafficCone.glb", size: 1922464, license: "CC0" },
  { id: "AntiqueCamera", name: "Macchina Fotografica Antica", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AntiqueCamera/glTF-Binary/AntiqueCamera.glb", size: 17540348, license: "CC0" },
  { id: "PlaysetLightTest", name: "Parco Giochi", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/PlaysetLightTest/glTF-Binary/PlaysetLightTest.glb", size: 16434220, license: "CC-BY-NC 4.0 (no commerciale)" },
  { id: "IridescentDishWithOlives", name: "Piatto di Olive", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescentDishWithOlives/glTF-Binary/IridescentDishWithOlives.glb", size: 5742828, license: "CC-BY 4.0" },
  { id: "BoomBox", name: "Radio Boombox", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoomBox/glTF-Binary/BoomBox.glb", size: 10614184, license: "CC0" },
  { id: "Shishkebab", name: "Spiedino", category: "oggetti", url: "https://modelviewer.dev/shared-assets/models/shishkebab.glb", size: 306571, license: "CC-BY (Google)" },
  { id: "DiffuseTransmissionTeacup", name: "Tazza da Tè", category: "oggetti", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DiffuseTransmissionTeacup/glTF-Binary/DiffuseTransmissionTeacup.glb", size: 4795028, license: "CC0" },
  { id: "Corset", name: "Corsetto", category: "moda", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Corset/glTF-Binary/Corset.glb", size: 13491364, license: "CC0" },
  { id: "SunglassesKhronos", name: "Occhiali da Sole", category: "moda", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SunglassesKhronos/glTF-Binary/SunglassesKhronos.glb", size: 371188, license: "CC-BY 4.0" },
  { id: "ChronographWatch", name: "Orologio Cronografo", category: "moda", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ChronographWatch/glTF-Binary/ChronographWatch.glb", size: 7446368, license: "CC-BY 4.0" },
  { id: "MaterialsVariantsShoe", name: "Sneaker (3 Colori)", category: "moda", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb", size: 7833592, license: "CC-BY 4.0" },
  { id: "DamagedHelmet", name: "Casco da Combattimento", category: "fantasy", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb", size: 3773916, license: "CC-BY-NC 4.0 (no commerciale)" },
  { id: "DragonAttenuation", name: "Drago 3D", category: "fantasy", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DragonAttenuation/glTF-Binary/DragonAttenuation.glb", size: 6401616, license: "CC0" },
  { id: "DragonDispersion", name: "Drago di Cristallo", category: "fantasy", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DragonDispersion/glTF-Binary/DragonDispersion.glb", size: 6401724, license: "CC0" },
  { id: "ScatteringSkull", name: "Teschio di Cristallo", category: "fantasy", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ScatteringSkull/glTF-Binary/ScatteringSkull.glb", size: 8959044, license: "CC0" },
  { id: "MosquitoInAmber", name: "Zanzara nell'Ambra", category: "fantasy", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/MosquitoInAmber/glTF-Binary/MosquitoInAmber.glb", size: 24229904, license: "CC-BY 4.0" },
  { id: "VirtualCity", name: "Città Virtuale", category: "citta", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/VirtualCity/glTF-Binary/VirtualCity.glb", size: 3085416, license: "Uso libero" },
  { id: "AnisotropyRotationTest", name: "Anelli Metallici", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnisotropyRotationTest/glTF-Binary/AnisotropyRotationTest.glb", size: 832340, license: "CC-BY 4.0" },
  { id: "BoxAnimated", name: "Cassa Animata", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoxAnimated/glTF-Binary/BoxAnimated.glb", size: 11944, license: "CC-BY 4.0", animated: true },
  { id: "BoxVertexColors", name: "Cassa Colorata", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoxVertexColors/glTF-Binary/BoxVertexColors.glb", size: 1924, license: "CC0" },
  { id: "BoxTextured", name: "Cassa con Texture", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoxTextured/glTF-Binary/BoxTextured.glb", size: 5956, license: "CC-BY 4.0" },
  { id: "BoxInterleaved", name: "Cassa Tecnica", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoxInterleaved/glTF-Binary/BoxInterleaved.glb", size: 1632, license: "CC-BY 4.0" },
  { id: "BoxTexturedNonPowerOfTwo", name: "Cassa Texture Pro", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoxTexturedNonPowerOfTwo/glTF-Binary/BoxTexturedNonPowerOfTwo.glb", size: 4696, license: "CC-BY 4.0" },
  { id: "SpecGlossVsMetalRough", name: "Confronto Materiali", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SpecGlossVsMetalRough/glTF-Binary/SpecGlossVsMetalRough.glb", size: 9984544, license: "CC-BY 4.0" },
  { id: "XmpMetadataRoundedCube", name: "Cubo Arrotondato", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/XmpMetadataRoundedCube/glTF-Binary/XmpMetadataRoundedCube.glb", size: 105936, license: "CC-BY 4.0" },
  { id: "AnimatedColorsCube", name: "Cubo Colorato Animato", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnimatedColorsCube/glTF-Binary/AnimatedColorsCube.glb", size: 15184, license: "CC0", animated: true },
  { id: "CubeVisibility", name: "Cubo con Luce", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CubeVisibility/glTF-Binary/CubeVisibility.glb", size: 3284, license: "CC0" },
  { id: "AnimatedMorphCube", name: "Cubo Morfing Animato", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnimatedMorphCube/glTF-Binary/AnimatedMorphCube.glb", size: 6752, license: "CC0", animated: true },
  { id: "AnisotropyDiscTest", name: "Disco Metallico", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnisotropyDiscTest/glTF-Binary/AnisotropyDiscTest.glb", size: 242128, license: "CC0" },
  { id: "SimpleInstancing", name: "Griglia di Cubi", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SimpleInstancing/glTF-Binary/SimpleInstancing.glb", size: 7356, license: "CC0" },
  { id: "EmissiveStrengthTest", name: "Neon Luminoso", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/EmissiveStrengthTest/glTF-Binary/EmissiveStrengthTest.glb", size: 10668, license: "CC-BY 4.0" },
  { id: "USDShaderBallForGltf", name: "Palla Shader", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/USDShaderBallForGltf/glTF-Binary/USDShaderBallForGltf.glb", size: 1319652, license: "CC-BY 4.0" },
  { id: "CarbonFibre", name: "Rete in Fibra di Carbonio", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarbonFibre/glTF-Binary/CarbonFibre.glb", size: 429880, license: "CC-BY 4.0" },
  { id: "IridescenceSuzanne", name: "Scimmia Iridescente", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescenceSuzanne/glTF-Binary/IridescenceSuzanne.glb", size: 507608, license: "CC0" },
  { id: "MetalRoughSpheres", name: "Sfere di Metallo", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/MetalRoughSpheres/glTF-Binary/MetalRoughSpheres.glb", size: 11221356, license: "CC-BY 4.0" },
  { id: "AnisotropyStrengthTest", name: "Sfere Spazzolate", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnisotropyStrengthTest/glTF-Binary/AnisotropyStrengthTest.glb", size: 94444, license: "CC0" },
  { id: "InterpolationTest", name: "Test Animazioni", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/InterpolationTest/glTF-Binary/InterpolationTest.glb", size: 7952, license: "CC0", animated: true },
  { id: "AttenuationTest", name: "Test Lampada Lontana", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AttenuationTest/glTF-Binary/AttenuationTest.glb", size: 57532, license: "CC-BY 4.0" },
  { id: "MultiUVTest", name: "Test Texture Doppia", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/MultiUVTest/glTF-Binary/MultiUVTest.glb", size: 43004, license: "CC-BY 4.0" },
  { id: "AlphaBlendModeTest", name: "Test Trasparenze", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AlphaBlendModeTest/glTF-Binary/AlphaBlendModeTest.glb", size: 2978812, license: "CC-BY 4.0" },
  { id: "AnimationPointerUVs", name: "Texture Animata", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnimationPointerUVs/glTF-Binary/AnimationPointerUVs.glb", size: 7980492, license: "CC-BY 4.0" },
  { id: "ClearCoatCarPaint", name: "Vernice Auto", category: "studio", url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ClearCoatCarPaint/glTF-Binary/ClearCoatCarPaint.glb", size: 116948, license: "CC0" },
  // ---- v15: nuovi modelli verificati (tutti con URL testato 200 OK) ----
  { id: "LittlestTokyo", name: "Tokyo Miniatura Animata", category: "citta", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/LittlestTokyo.glb", size: 4133072, license: "MIT (three.js)", animated: true },
  { id: "Xbot", name: "Robot Combattente Animato", category: "personaggi", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/Xbot.glb", size: 2930032, license: "MIT (three.js)", animated: true },
  { id: "Michelle", name: "Ballerina Animata", category: "personaggi", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/Michelle.glb", size: 3276888, license: "MIT (three.js)", animated: true },
  { id: "facecap", name: "Volto Espressivo Animato", category: "personaggi", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/facecap.glb", size: 332808, license: "MIT (three.js)", animated: true },
  { id: "kira", name: "Kira Animata", category: "personaggi", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/kira.glb", size: 12173128, license: "MIT (three.js)", animated: true },
  { id: "ferrari", name: "Auto Sportiva Rossa", category: "veicoli", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/ferrari.glb", size: 1681572, license: "MIT (three.js)" },
  { id: "PrimaryIonDrive", name: "Motore Ionico Animato", category: "fantasy", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/PrimaryIonDrive.glb", size: 5800408, license: "MIT (three.js)", animated: true },
  { id: "coffeemat", name: "Macchina del Caffe", category: "casa", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/coffeemat.glb", size: 4780672, license: "MIT (three.js)" },
  { id: "collision-world", name: "Arena di Gioco", category: "citta", url: "https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/collision-world.glb", size: 94556, license: "MIT (three.js)" },
]
