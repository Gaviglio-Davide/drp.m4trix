// Importa i dati da prisma/seed-export.json (esportati dal vecchio SQLite)
// nel database PostgreSQL corrente. Gli ID vengono preservati, quindi
// account, progetti e relativi link continuano a funzionare.
// Uso: bun scripts/import-data.ts [percorso-json-opzionale]
import { readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'

const file = process.argv[2] ?? '/home/z/my-project/prisma/seed-export.json'
const data = JSON.parse(readFileSync(file, 'utf-8'))
const db = new PrismaClient()

async function main() {
  let u = 0, p = 0, s = 0
  for (const user of data.users) {
    const uData = {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      name: user.name,
      accentColor: user.accentColor,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    }
    await db.user.upsert({
      where: { id: user.id },
      update: {
        email: uData.email,
        passwordHash: uData.passwordHash,
        name: uData.name,
        accentColor: uData.accentColor,
      },
      create: uData,
    })
    u++
  }
  for (const proj of data.projects) {
    const pData = {
      id: proj.id,
      name: proj.name,
      state: proj.state,
      ownerId: proj.ownerId,
      createdAt: new Date(proj.createdAt),
      updatedAt: new Date(proj.updatedAt),
    }
    await db.project.upsert({
      where: { id: proj.id },
      update: {
        name: pData.name,
        state: pData.state,
        ownerId: pData.ownerId,
        updatedAt: pData.updatedAt,
      },
      create: pData,
    })
    p++
  }
  for (const save of data.saves) {
    const exists = await db.save.findUnique({ where: { id: save.id } })
    if (!exists) {
      await db.save.create({
        data: { ...save, createdAt: new Date(save.createdAt) },
      })
      s++
    }
  }
  console.log(`Import completato: ${u} utenti, ${p} progetti, ${s} salvataggi`)
}

main()
  .catch(e => {
    console.error('Import FALLITO:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
