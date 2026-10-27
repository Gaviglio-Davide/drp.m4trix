# 🚀 Guida Deploy — porta darpon.m4trix online GRATIS con Vercel

Questa guida ti porta il tuo sito online in ~15 minuti, **senza pagare nulla**
(niente carta di credito richiesta). Alla fine avrai un indirizzo tipo:

```
https://darpon-m4trix.vercel.app
```

accessibile da qualsiasi dispositivo, con account, progetti, salvataggi e
upload dei modelli 3D funzionanti per sempre (piano gratuito "Hobby").

---

## Cosa ti serve

| Cosa | Dove | Costo |
|------|------|-------|
| Account **GitHub** | https://github.com/signup | Gratis, nessuna carta |
| Account **Vercel** | https://vercel.com/signup | Gratis, nessuna carta |

> Il piano gratuito di Vercel (Hobby) include hosting, database Postgres e
> storage Blob per i modelli 3D. Più che sufficiente per iniziare.

---

## Passo 1 — Estrai lo zip

Scarica **darpon-m4trix-deploy.zip** ed estrailo (tasto destro → "Estrai tutto").
Otterrai una cartella `darpon-m4trix` con dentro il sito.

---

## Passo 2 — Carica il codice su GitHub

1. Vai su **https://github.com/new** (accedi col tuo account)
2. Nome repository: `darpon-m4trix` → lascia **Public** → NON spuntare nessuna
   opzione (niente README, niente .gitignore)
3. Clicca **Create repository**
4. Nella pagina che appare, clicca il link **«uploading an existing file»**
5. Apri la cartella estratta, seleziona **TUTTO il contenuto** (Ctrl+A) e
   **trascinalo** nella pagina di GitHub
6. Aspetta che finisca il caricamento (i file sono ~200, il cavaliere 3D è il
   più pesante) → clicca **Commit changes**

---

## Passo 3 — Crea il progetto su Vercel

1. Vai su **https://vercel.com** → **Sign Up** → **Continue with GitHub**
2. Clicca **Add New… → Project**
3. Trova il repository `darpon-m4trix` → clicca **Import**
4. Non toccare nulla: Framework Preset sarà **Next.js** automaticamente
5. Clicca **Deploy**
6. Dopo ~2 minuti il sito è online! (funziona già, ma manca ancora il
   database: finisci i prossimi passi)

---

## Passo 4 — Attiva il database Postgres (gratis)

1. Nel tuo progetto su Vercel, apri il tab **Storage**
2. **Create Database** → scegli **Postgres** (di Neon) → conferma il piano
   **Hobby (gratuito)** → nome: `darpon-m4trix-db` → **Create**
3. Nella schermata successiva clicca **Connect Project** (o `.env.local`
   tab → connect): Vercel collega da solo la variabile `DATABASE_URL` ✅

## Passo 5 — Attiva lo storage dei modelli 3D (gratis)

1. Sempre nel tab **Storage**: **Create Database** → **Blob** → nome
   `darpon-m4trix-blob` → **Create**
2. **Connect Project**: Vercel aggiunge da solo `BLOB_READ_WRITE_TOKEN` ✅

## Passo 6 — Aggiungi il segreto delle sessioni

1. Tab **Settings → Environment Variables**
2. Aggiungi una variabile:
   - **Key**: `AUTH_SECRET`
   - **Value**:
   ```
   ad91a73ba85d8d02e603a2c50b7a36aa26afdbf966c8cd16bef31db94334fc58
   ```
3. **Save**

## Passo 7 — Redeploy finale

1. Tab **Deployments** → sull'ultimo deploy clicca il menu **⋯** →
   **Redeploy** → conferma
2. Al termine, apri il sito: **Registrati** e costruisci il tuo primo mondo! 🏰

---

## Domande frequenti

**Quanto costa?**
Zero. Il piano Hobby di Vercel include hosting + database + storage. Quando il
sito diventerà famoso potrai passare a un piano a pagamento, ma per iniziare
non serve nulla.

**Il database viene creato da solo?**
Sì: al primo avvio le tabelle si creano automaticamente. Se qualcosa andasse
storto, da terminale (per esperti): `npx prisma db push`.

**Posso recuperare i progetti che ho creato qui in anteprima?**
Sì, nello zip c'è `prisma/seed-export.json` con i tuoi dati attuali. Per
esperti: imposta `DATABASE_URL` del tuo Vercel Postgres ed esegui
`npx tsx scripts/import-data.ts`. Se preferisci, riparti da zero: basta
registrarsi di nuovo con la tua email.

**E il dominio darpon.m4trix?**
Il nome del sito è già darpon.m4trix ovunque. Se vuoi anche l'indirizzo web
personalizzato (es. `darponm4trix.com`), lo compri (~10€/anno) e lo colleghi da
**Settings → Domains** su Vercel. Fino ad allora usi gratis
`darpon-m4trix.vercel.app`.

**Limiti del piano gratuito**: banda 100GB/mese, 256MB database, 5GB Blob —
per un sito personale è tantissimo.

---

## Problemi comuni

| Problema | Soluzione |
|----------|-----------|
| Deploy rosso | Controlla di aver caricato TUTTI i file (la cartella `prisma` è fondamentale) |
| "Non autorizzato" al login | Manca `AUTH_SECRET`: rifai il Passo 6 + Redeploy |
| Upload modelli non va | Manca lo store Blob: rifai il Passo 5 + Redeploy |
| Errore database | Verifica il Passo 4: `DATABASE_URL` deve esistere in Environment Variables |
