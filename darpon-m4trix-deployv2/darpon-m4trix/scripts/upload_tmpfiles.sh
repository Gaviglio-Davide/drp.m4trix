#!/bin/bash
# Carica un file su tmpfiles.org ed estrae il link diretto tokenizzato (/dl/)
# Uso: bash upload_tmpfiles.sh <percorso-file>
set -e
FILE="$1"
[ -f "$FILE" ] || { echo "File non trovato: $FILE"; exit 1; }

# 1) upload API
RESP=$(curl -s -F "file=@${FILE}" https://tmpfiles.org/api/v1/upload)
echo "Risposta API: $RESP"

# 2) estrai URL pagina (https://tmpfiles.org/<id>/<token>/<name>)
PAGE=$(echo "$RESP" | rg -o 'https://tmpfiles.org/[^"\\ ]+' | head -1)
[ -n "$PAGE" ] || { echo "URL pagina non trovato nella risposta"; exit 1; }

# 3) scarica la pagina e cerca l'href con /dl/
HTML=$(curl -s "$PAGE")
DL=$(echo "$HTML" | rg -o '/dl/[A-Za-z0-9._/-]+' | head -1)
[ -n "$DL" ] || { echo "Link /dl/ non trovato nella pagina"; exit 1; }

echo "LINK_DIRETTO: https://tmpfiles.org${DL}"
