#!/bin/sh
# Downloads Gemma 4 and creates "phantom-architect", a preset that already
# knows the level JSON format. The preset shows up in Open WebUI's model list.
#
# MODE B (Docker):  docker compose exec ollama sh /setup/setup-model.sh
# MODE A (Mac app): sh ollama/setup-model.sh
set -e

MODEL="${GEMMA_MODEL:-gemma4:e4b-it-qat}"
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$DIR/prompt.txt" ]; then
  PROMPT="$DIR/prompt.txt"
else
  PROMPT="$DIR/../server/prompt.txt"
fi

echo ">> Pulling $MODEL (one-time download, needs internet)..."
ollama pull "$MODEL"

TMP="${TMPDIR:-/tmp}/phantom.Modelfile"
{
  echo "FROM $MODEL"
  echo "PARAMETER temperature 0.5"
  echo "PARAMETER num_ctx 8192"
  echo 'SYSTEM """'
  cat "$PROMPT"
  echo '"""'
} > "$TMP"

echo ">> Creating preset model phantom-architect..."
ollama create phantom-architect -f "$TMP"

echo ">> Done. Installed models:"
ollama list
