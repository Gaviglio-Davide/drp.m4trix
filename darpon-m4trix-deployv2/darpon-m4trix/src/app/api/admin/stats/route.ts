import { NextResponse } from 'next/server'
import { db, ensureSchemaOnce } from '@/lib/db'
import { requireAdmin, usingDefaultAdminPassword } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  await ensureSchemaOnce().catch(() => {})

  const [users, projects, saves, configRows] = await Promise.all([
    db.user.count(),
    db.project.count(),
    db.save.count(),
    db.siteConfig.count(),
  ])

  // verifica connessione + versione database
  let dbInfo = 'collegato'
  try {
    if (process.env.DATABASE_URL?.startsWith('file:')) {
      dbInfo = 'SQLite (sviluppo locale)'
    } else {
      const v = await db.$queryRawUnsafe<{ version?: string }[]>(
        'SELECT version() AS version'
      )
      dbInfo = v?.[0]?.version?.split(',')[0] ?? 'PostgreSQL'
    }
  } catch {
    dbInfo = 'errore di connessione'
  }

  return NextResponse.json({
    counts: { users, projects, saves, siteTexts: configRows },
    env: {
      databaseUrl: Boolean(process.env.DATABASE_URL),
      authSecret: Boolean(process.env.AUTH_SECRET),
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      adminPasswordCustom: !usingDefaultAdminPassword(),
    },
    dbInfo,
  })
}
