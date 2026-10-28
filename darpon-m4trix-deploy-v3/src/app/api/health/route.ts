import { NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Diagnostica pubblica (usata dalla landing per spiegare cosa manca
// nella configurazione del deploy e dall'area admin)
export async function GET() {
  await ensureSchemaOnce().catch(() => {})
  let dbOk = false
  let counts: { users?: number; projects?: number } = {}
  try {
    await db.$queryRaw`SELECT 1`
    dbOk = true
    counts = {
      users: await db.user.count(),
      projects: await db.project.count(),
    }
  } catch {
    dbOk = false
  }
  return NextResponse.json({
    db: dbOk,
    counts,
    env: {
      databaseUrl: Boolean(process.env.DATABASE_URL),
      authSecret: Boolean(process.env.AUTH_SECRET),
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      adminPassword: Boolean(process.env.ADMIN_PASSWORD),
    },
  })
}
