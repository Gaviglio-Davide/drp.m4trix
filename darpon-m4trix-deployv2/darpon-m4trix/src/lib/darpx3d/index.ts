// ============================================================
// Darpx3D — MOTORE DI GENERAZIONE 3D INTERNO DI darpon.m4trix
// ============================================================
// Testo → modello 3D, 100% nel browser dell'utente:
//   • NESSUNA API esterna (niente Meshy, Tripo, fal.ai, Stability)
//   • NESSUNA chiave da configurare
//   • NESSUN limite di richieste
//   • costi zero, privacy totale
//
// Come funziona: il prompt in italiano viene analizzato
// (parse.ts) → il generatore assembla anatomie organiche e
// oggetti parametrici (anatomy.ts, objects.ts) con materiali
// PBR derivati dalle parole (materials.ts) → il tutto viene
// normalizzato, rifinito e serializzato in GLB (build.ts,
// export.ts), lo stesso formato dei modelli importati.
// ============================================================

export { parsePrompt, normPrompt, PROMPT_SUGGESTIONS } from './parse'
export type { GenSpec, ArchetypeId, SizeClass } from './parse'
export { generateModel, generateVariant } from './build'
export type { BuiltModel, ModelStats } from './build'
export { exportGlb, exportGlbBlob, exportGlbFile } from './export'
export { makeRng, hashSeed, randomSeed } from './rng'
