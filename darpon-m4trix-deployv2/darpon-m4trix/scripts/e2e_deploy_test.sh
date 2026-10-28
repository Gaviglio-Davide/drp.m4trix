#!/bin/bash
# E2E test del pacchetto deploy: server standalone + Postgres VUOTO
# Simula esattamente l'ambiente Vercel: DB vuoto -> ensureSchema -> flussi app
set -e
BASE=http://localhost:3100
JAR=/tmp/e2e-cookies.txt
GLB=/home/z/my-project/download/Medieval_Knight_Rigged_Armature.glb
rm -f "$JAR"

echo "=== 1. Health: GET / ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/")
echo "GET / -> $CODE (atteso 200)"
[ "$CODE" = "200" ] || exit 1

echo "=== 2. Signup (DB vuoto: deve creare le tabelle da solo) ==="
RES=$(curl -s -w "\n%{http_code}" -c "$JAR" -X POST "$BASE/api/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{"email":"deploy-e2e@drpm4trix.test","password":"password123","name":"E2E Deploy"}')
CODE=$(echo "$RES" | tail -1)
echo "POST /api/auth/signup -> $CODE"
if [ "$CODE" = "409" ]; then
  echo "(account già esistente da un run precedente -> login)"
  RES=$(curl -s -w "\n%{http_code}" -c "$JAR" -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"deploy-e2e@drpm4trix.test","password":"password123"}')
  CODE=$(echo "$RES" | tail -1)
  echo "POST /api/auth/login -> $CODE"
fi
[ "$CODE" = "200" ] || { echo "FALLITO: autenticazione"; exit 1; }

echo "=== 3. Me (sessione) ==="
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" "$BASE/api/auth/me")
CODE=$(echo "$RES" | tail -1)
echo "GET /api/auth/me -> $CODE: $(echo "$RES" | head -1 | head -c 150)"
[ "$CODE" = "200" ] || exit 1

echo "=== 4. Crea progetto ==="
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" -X POST "$BASE/api/projects" \
  -H 'Content-Type: application/json' -d '{"name":"Mondo Deploy E2E"}')
CODE=$(echo "$RES" | tail -1)
echo "POST /api/projects -> $CODE"
[ "$CODE" = "200" ] || exit 1
PID=$(echo "$RES" | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['project']['id'])")
echo "project id: $PID"

echo "=== 5. Lista progetti ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/projects")
echo "GET /api/projects -> $CODE"
[ "$CODE" = "200" ] || exit 1

echo "=== 6. Upload GLB (modalita' locale) ==="
RES=$(curl -s -w "\n%{http_code}" -b "$JAR" -X POST "$BASE/api/upload" \
  -F "file=@$GLB;type=model/gltf-binary")
CODE=$(echo "$RES" | tail -1)
echo "POST /api/upload -> $CODE"
[ "$CODE" = "200" ] || { echo "$RES" | head -1; exit 1; }
URL=$(echo "$RES" | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")
echo "asset url: $URL"

echo "=== 7. File caricato su disco? (NOTA: lo standalone indicizza public/ all'avvio,
    quindi un file caricato DOPO il boot risponde 404 via HTTP; su Vercel si usa
    la modalità Blob con CDN diretta, quindi lì questo problema non esiste) ==="
UPFILE="/home/z/my-project/build-test/app-test/.next/standalone/build-test/app-test/public$URL"
if [ -f "$UPFILE" ]; then echo "file su disco OK ($(stat -c%s "$UPFILE") byte) ✓"; else echo "file NON trovato su disco"; exit 1; fi
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$URL" || true)
echo "GET $URL -> $CODE (404 atteso e documentato in standalone)"

echo "=== 8. Autosave stato con oggetto custom ==="
STATE=$(python3 -c "
import json
print(json.dumps({'state': json.dumps({'objects':[{'id':'o1','type':'custom','assetId':'c_1','url':'$URL','pos':[0,0,0],'rot':0,'scale':1}],'customAssets':[{'id':'c_1','name':'Cavaliere test','url':'$URL'}]})}))")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X PATCH "$BASE/api/projects/$PID" \
  -H 'Content-Type: application/json' -d "$STATE")
echo "PATCH /api/projects/$PID -> $CODE (atteso 200)"
[ "$CODE" = "200" ] || exit 1

echo "=== 9. Snapshot salvato ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -X POST "$BASE/api/projects/$PID/saves" \
  -H 'Content-Type: application/json' -d '{"name":"snapshot e2e","state":"{\"objects\":[]}"}')
echo "POST saves -> $CODE (atteso 200)"
[ "$CODE" = "200" ] || exit 1

echo "=== 10. Verifica tabelle create da solo nel DB vuoto ==="
cd /home/z/my-project/build-test/app-test
export DATABASE_URL="postgresql://drp@localhost:5433/postgres"
bun -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const t = await p.\$queryRawUnsafe(\"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1\");
  console.log('Tabelle nel DB:', t.map(x => x.tablename).join(' '));
  const c = await p.\$queryRawUnsafe('SELECT (SELECT count(*) FROM \"User\") AS u, (SELECT count(*) FROM \"Project\") AS pr, (SELECT count(*) FROM \"Save\") AS s');
  console.log('Righe: User=' + c[0].u + ' Project=' + c[0].pr + ' Save=' + c[0].s);
  await p.\$disconnect();
})().catch(e => { console.error('VERIFICA FALLITA:', e.message); process.exit(1); });
"

echo ""
echo "###############################################"
echo "#  E2E COMPLETATO: tutto funziona su DB vuoto  #"
echo "###############################################"
