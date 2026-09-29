#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
source ./_common.sh

FILE="$D/video-invalido.mp4"
[ -f "$FILE" ] || head -c 200 /dev/urandom > "$FILE"

echo "================================================"
echo " Enviando um arquivo INVÁLIDO de propósito"
echo "================================================"
curl -s -X POST http://localhost:3000/videos/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$FILE;type=video/mp4" \
  | python3 -m json.tool

echo
echo ">> Agora roda ./2-status.sh em uns 5 segundos pra ver \"FAILED\""
echo ">> E abre http://localhost:8025 no navegador pra mostrar o e-mail de aviso"
