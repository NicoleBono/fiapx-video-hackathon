#!/usr/bin/env bash
# Não roda sozinho — é usado pelos outros scripts desta pasta.
EMAIL="nicole@fiapx.com"
SENHA="S3nhaForte!"
D="/home/nicole_martins/snap/obs-studio/common"

login() {
  curl -s -X POST http://localhost:3001/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}" \
    | sed -E 's/.*"accessToken":"([^"]+)".*/\1/'
}

TOKEN=$(login)

if [[ "$TOKEN" == *"{"* ]] || [ -z "$TOKEN" ]; then
  echo "(usuário ainda não existe, registrando...)"
  curl -s -X POST http://localhost:3001/register \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"nicole\",\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}" > /dev/null
  TOKEN=$(login)
fi

if [[ "$TOKEN" == *"{"* ]] || [ -z "$TOKEN" ]; then
  echo "!! Não consegui logar. O stack está rodando? Roda: docker compose ps"
  exit 1
fi
