#!/usr/bin/env bash
# Deixa isso rodando num terminal SEPARADO, aberto na tela,
# ANTES de rodar o 5-paralelo.sh no outro terminal.
cd "$(dirname "$0")/.."
sudo docker compose logs -f processing-service
