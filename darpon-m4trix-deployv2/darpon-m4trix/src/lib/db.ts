import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  schemaReady: Promise<void> | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ---------------------------------------------------------------------------
// Auto-creazione delle tabelle al primo avvio (deploy su Vercel + Postgres):
// rende il sito funzionante senza alcun comando manuale. Su SQLite (sviluppo
// locale) le tabelle sono già gestite da `prisma db push`, quindi saltiamo.
// Idempotente: CREATE TABLE IF NOT EXISTS può girare più volte senza danni.
// ---------------------------------------------------------------------------
async function ensureSchema(): Promise<void> {
  const url = process.env.DATABASE_URL ?? ''
  if (!url || url.startsWith('file:')) return

  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "accentColor" TEXT,
    "meshyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
  )`)
  // migrazione leggera per installazioni esistenti: chiave Meshy cifrata (Darpx.ai)
  await db
    .$executeRawUnsafe(
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "meshyKey" TEXT`
    )
    .catch(() => {})
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`
  )

  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '{}',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
  )`)
  await db.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "Save" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "state" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Save_pkey" PRIMARY KEY ("id")
    )`
  )
  await db.$executeRawUnsafe(`DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Project_ownerId_fkey'
  ) THEN
    ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Save_projectId_fkey'
  ) THEN
    ALTER TABLE "Save" ADD CONSTRAINT "Save_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`)

  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SiteConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("key")
  )`)

  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ModelAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER,
    "scale" REAL DEFAULT 1,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelAsset_pkey" PRIMARY KEY ("id")
  )`)
  // migrazione leggera per installazioni esistenti: colonna scale
  await db
    .$executeRawUnsafe(
      `ALTER TABLE "ModelAsset" ADD COLUMN IF NOT EXISTS "scale" REAL DEFAULT 1`
    )
    .catch(() => {})
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ModelAsset_ownerId_idx" ON "ModelAsset"("ownerId")`
  )
  await db.$executeRawUnsafe(`DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ModelAsset_ownerId_fkey'
  ) THEN
    ALTER TABLE "ModelAsset" ADD CONSTRAINT "ModelAsset_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;`)
}

/** Esegue ensureSchema una sola volta per istanza (il risultato è in cache). */
export function ensureSchemaOnce(): Promise<void> {
  if (!globalForPrisma.schemaReady) {
    globalForPrisma.schemaReady = ensureSchema().catch((e) => {
      console.error('[db] ensureSchema failed:', e)
      globalForPrisma.schemaReady = undefined
      throw e
    })
  }
  return globalForPrisma.schemaReady
}
