#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
source ./_common.sh

if [ -z "$1" ]; then
  echo "Uso: ./3-download.sh <id-do-video>"
  echo "(o id aparece no resultado do 1-upload.sh ou do 2-status.sh)"
  exit 1
fi

echo "================================================"
echo " Baixando o zip com os frames"
echo "================================================"
curl -s -OJ "http://localhost:3000/videos/$1/download" -H "Authorization: Bearer $TOKEN"

ZIP=$(ls -t *frames.zip 2>/dev/null | head -1)
echo "Baixado: $ZIP"
echo
echo "Conteúdo:"
unzip -l "$ZIP"
