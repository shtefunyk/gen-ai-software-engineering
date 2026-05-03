#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[run.sh] Created .env from .env.example. Set GEMINI_API_KEY before using auto-classify."
fi
npm install
npm start
