#!/usr/bin/env bash
# OPCIONAL: só roda isso se quiser começar a gravação com a lista de vídeos
# vazia (apaga TODOS os dados: banco, MinIO, etc). Se não se importar de
# aparecer vídeo de teste antigo na lista, pode pular esse script.
set -e
cd "$(dirname "$0")/.."

read -p "Isso vai APAGAR todos os dados e subir tudo de novo. Confirma? (digite sim) " ok
if [ "$ok" != "sim" ]; then
  echo "Cancelado."
  exit 0
fi

sudo docker compose down -v
sudo docker compose up -d --build --scale processing-service=3
echo "Pronto. Espera uns 15s pra tudo ficar saudável antes de gravar."
