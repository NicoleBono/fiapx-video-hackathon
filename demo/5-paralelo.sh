#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
source ./_common.sh

echo "================================================"
echo " Disparando 3 uploads AO MESMO TEMPO"
echo " (olha no terminal do 6-logs.sh pra ver os 3"
echo "  processing-service trabalhando juntos)"
echo "================================================"
for f in "$D/2026-09-29 12-50-25.mp4" "$D/2026-09-29 12-59-28.mp4" "$D/2026-09-29 13-01-46.mp4"; do
  curl -s -X POST http://localhost:3000/videos/upload \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$f;type=video/mp4" &
done
wait
echo
echo "Prontos! Confere o terminal do 6-logs.sh"
