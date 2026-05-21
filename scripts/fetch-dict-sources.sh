#!/usr/bin/env bash
# Fetch open-source pinyin data into .dict-tmp/ for the dict builder.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.dict-tmp"
mkdir -p "$OUT"

curl -sL -o "$OUT/chars.txt"    https://raw.githubusercontent.com/mozillazg/pinyin-data/master/pinyin.txt
curl -sL -o "$OUT/words.txt"    https://raw.githubusercontent.com/mozillazg/phrase-pinyin-data/master/pinyin.txt
curl -sL -o "$OUT/essay.txt"    https://raw.githubusercontent.com/rime/rime-essay/master/essay.txt
curl -sL -o "$OUT/ts-chars.txt" https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/TSCharacters.txt

echo "Fetched:"
ls -lh "$OUT"
