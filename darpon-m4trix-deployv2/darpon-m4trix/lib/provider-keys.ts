import { db, ensureSchemaOnce } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/encrypt'
import { PROVIDER_ORDER, type ProviderId } from '@/lib/providers3d'

// ============================================================
// Gestione delle chiavi dei motori 3D (SOLO SERVER).
// Ordine di risoluzione per ogni provider:
//   1. chiave personale dell'utente (User.providerKeys, cifrata)
//   2. chiave globale impostata dall'admin (SiteConfig "key3d:<p>", cifrata)
//   3. variabile d'ambiente su Vercel (es. TRIPO_API_KEY)
// Meshy mantiene anche il vecchio campo User.meshyKey.
// ============================================================

export type KeySource = 'personal' | 'site' | 'env'

export type ProviderStatus = {
  id: ProviderId
  hasKey: boolean
  source: KeySource | null
}

// ---- chiavi personali dell'utente ----

type KeyMap = Partial<Record<ProviderId, string>>

async function readUserKeys(userId: string): Promise<KeyMap> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { providerKeys: true, meshyKey: true },
  })
  const out: KeyMap = {}
  if (u?.providerKeys) {
    try {
      const raw = JSON.parse(u.providerKeys) as Record<string, string>
      for (const p of PROVIDER_ORDER) {
        const sealed = raw[p]
        if (sealed) {
          const k = decryptSecret(sealed)
          if (k) out[p] = k
        }
      }
    } catch {
      // JSON rotto: lo ignoriamo
    }
  }
  // retrocompatibilità: la vecchia chiave Meshy nel campo dedicato
  if (!out.meshy && u?.meshyKey) {
    const k = decryptSecret(u.meshyKey)
    if (k) out.meshy = k
  }
  return out
}

async function writeUserKey(userId: string, provider: ProviderId, key: string | null) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { providerKeys: true },
  })
  let raw: Record<string, string> = {}
  if (u?.providerKeys) {
    try {
      raw = JSON.parse(u.providerKeys) as Record<string, string>
    } catch {
      raw = {}
    }
  }
  if (key) raw[provider] = encryptSecret(key)
  else delete raw[provider]
  await db.user.update({
    where: { id: userId },
    data: { providerKeys: JSON.stringify(raw) },
  })
}

// ---- chiavi globali (admin) in SiteConfig ----

const siteKeyOf = (p: ProviderId) => `key3d:${p}`

async function readSiteKey(provider: ProviderId): Promise<string | null> {
  await ensureSchemaOnce().catch(() => {})
  const row = await db.siteConfig.findUnique({ where: { key: siteKeyOf(provider) } })
  if (!row) return null
  return decryptSecret(row.value)
}

export async function setSiteKey(provider: ProviderId, key: string | null) {
  await ensureSchemaOnce().catch(() => {})
  if (key) {
    await db.siteConfig.upsert({
      where: { key: siteKeyOf(provider) },
      update: { value: encryptSecret(key) },
      create: { key: siteKeyOf(provider), value: encryptSecret(key) },
    })
  } else {
    await db.siteConfig.deleteMany({ where: { key: siteKeyOf(provider) } })
  }
}

// ---- risoluzione ----

export async function resolveProviderKey(
  userId: string,
  provider: ProviderId
): Promise<{ key: string | null; source: KeySource | null }> {
  const userKeys = await readUserKeys(userId)
  if (userKeys[provider]) return { key: userKeys[provider]!, source: 'personal' }
  const siteKey = await readSiteKey(provider)
  if (siteKey) return { key: siteKey, source: 'site' }
  const envKey = process.env[envOf(provider)]
  if (envKey) return { key: envKey, source: 'env' }
  return { key: null, source: null }
}

export async function providerStatuses(
  userId: string
): Promise<ProviderStatus[]> {
  const userKeys = await readUserKeys(userId)
  const rows = await db.siteConfig
    .findMany({ where: { key: { startsWith: 'key3d:' } } })
    .catch(() => [] as { key: string; value: string }[])
  const siteKeys = new Set(rows.map(r => r.key.slice(6)))
  return PROVIDER_ORDER.map(p => {
    if (userKeys[p]) return { id: p, hasKey: true, source: 'personal' as KeySource }
    if (siteKeys.has(p)) return { id: p, hasKey: true, source: 'site' as KeySource }
    if (process.env[envOf(p)]) return { id: p, hasKey: true, source: 'env' as KeySource }
    return { id: p, hasKey: false, source: null }
  })
}

function envOf(p: ProviderId): string {
  return (
    {
      tripo: 'TRIPO_API_KEY',
      fal: 'FAL_API_KEY',
      stability: 'STABILITY_API_KEY',
      meshy: 'MESHY_API_KEY',
    } as const
  )[p]
}

export { readUserKeys, writeUserKey }
