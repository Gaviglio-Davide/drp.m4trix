/**
 * Fetch con retry automatico sul 401.
 *
 * Dopo login/signup il cookie di sessione può arrivare al browser una
 * frazione di secondo DOPO che la risposta è già stata consegnata a JS:
 * la fetch immediatamente successiva può quindi leggere 401 anche se
 * l'utente è loggato. Questo helper riprova più volte con piccole pause,
 * così il flusso regge anche su connessioni lente.
 */
export async function fetchAuth(
  input: string,
  init?: RequestInit,
  retries = 3
): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401 && retries > 0) {
    await new Promise(r => setTimeout(r, 500))
    return fetchAuth(input, init, retries - 1)
  }
  return res
}
