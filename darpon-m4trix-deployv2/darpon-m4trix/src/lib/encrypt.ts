import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

// ============================================================
// Cifratura simmetrica per i segreti dell'utente (es. API key
// di Meshy per Darpx.ai). AES-256-GCM con chiave derivata da
// AUTH_SECRET: la key non è mai leggibile dal client.
// ============================================================

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'darpon-matrix-dev-secret'
  return scryptSync(secret, 'darpon.matrix.kdf.salt', 32)
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`
}

export function decryptSecret(sealed: string): string | null {
  try {
    const [ivB, tagB, dataB] = sealed.split('.')
    if (!ivB || !tagB || !dataB) return null
    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB, 'base64'))
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB, 'base64')),
      decipher.final(),
    ])
    return dec.toString('utf8')
  } catch {
    return null
  }
}
