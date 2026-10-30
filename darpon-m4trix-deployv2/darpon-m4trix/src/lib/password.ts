import bcrypt from 'bcryptjs'

// ============================================================
// Helper condivisi per le password (signup + admin reset).
// Regola del sito: almeno 6 caratteri.
// ============================================================

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export function validatePassword(pwd: string): { ok: boolean; error?: string } {
  if (pwd.length < 6) {
    return { ok: false, error: 'La password deve avere almeno 6 caratteri' }
  }
  if (pwd.length > 200) {
    return { ok: false, error: 'Password troppo lunga' }
  }
  return { ok: true }
}
