#!/usr/bin/env bash
cd "$(dirname "$0")"
source ./_common.sh

echo "================================================"
echo " Status dos vídeos - atualiza sozinho a cada 2s"
echo " (aperta Ctrl+C pra sair quando quiser)"
echo "================================================"
while true; do
  clear
  echo "Atualizado às $(date +%T)"
  echo
  curl -s http://localhost:3000/videos -H "Authorization: Bearer $TOKEN" \
    | python3 -c "
import sys, json
for v in json.load(sys.stdin):
    frames = v.get('frameCount')
    print(f\"{v['originalFilename']:35} {v['status']:12} frames={frames}\")
"
  sleep 2
done
