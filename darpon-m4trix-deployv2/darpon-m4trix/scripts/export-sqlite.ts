// Esporta tutti i dati dal vecchio DB SQLite (per migrarli su PostgreSQL
// e per il pacchetto di deploy Vercel). Uso: bun scripts/export-sqlite.ts
import { Database } from 'bun:sqlite'
import { writeFileSync } from 'fs'

const dbPath = process.argv[2] ?? '/home/z/my-project/db/custom.db'
const outPath = process.argv[3] ?? '/home/z/my-project/prisma/seed-export.json'

const d = new Database(dbPath, { readonly: true })
const data = {
  exportedAt: new Date().toISOString(),
  users: d.prepare('SELECT id, email, passwordHash, name, accentColor, createdAt, updatedAt FROM User').all(),
  projects: d.prepare('SELECT id, name, state, ownerId, createdAt, updatedAt FROM Project').all(),
  saves: d.prepare('SELECT id, name, state, projectId, createdAt FROM Save').all(),
}
writeFileSync(outPath, JSON.stringify(data, null, 1))
console.log(
  `OK -> ${outPath}\n  users: ${data.users.length}\n  projects: ${data.projects.length}\n  saves: ${data.saves.length}`
)
