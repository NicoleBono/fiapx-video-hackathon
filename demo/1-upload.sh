#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
source ./_common.sh

echo "================================================"
echo " Enviando 1 vídeo pro video-service (upload)"
echo "================================================"
curl -s -X POST http://localhost:3000/videos/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$D/2026-09-29 13-01-46.mp4;type=video/mp4" \
  | python3 -m json.tool

echo
echo ">> Copia o valor de \"id\" aí em cima, vai precisar dele no passo do download."
