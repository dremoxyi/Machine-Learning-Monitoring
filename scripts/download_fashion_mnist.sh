#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATASET_DIR="${1:-${ROOT_DIR}/datasets/fashion-mnist}"
RAW_DIR="${DATASET_DIR}/raw"
EXTRACT_DIR="${DATASET_DIR}/extracted"
BASE_URL="https://github.com/zalandoresearch/fashion-mnist/raw/master/data/fashion"

mkdir -p "${RAW_DIR}" "${EXTRACT_DIR}"

if [[ -f "${EXTRACT_DIR}/train-images-idx3-ubyte" && -f "${EXTRACT_DIR}/train-labels-idx1-ubyte" && -f "${EXTRACT_DIR}/t10k-images-idx3-ubyte" && -f "${EXTRACT_DIR}/t10k-labels-idx1-ubyte" ]]; then
  echo "[fashion-mnist] Dataset déjà présent: ${EXTRACT_DIR}"
  exit 0
fi

FILES=(
  "train-images-idx3-ubyte.gz"
  "train-labels-idx1-ubyte.gz"
  "t10k-images-idx3-ubyte.gz"
  "t10k-labels-idx1-ubyte.gz"
)

for file in "${FILES[@]}"; do
  echo "[fashion-mnist] Téléchargement..."
  curl --retry 5 --retry-delay 2 --retry-all-errors -fL "${BASE_URL}/${file}" -o "${RAW_DIR}/${file}"

done

for file in "${FILES[@]}"; do
  echo "[fashion-mnist] Extraction..."
  gzip -dc "${RAW_DIR}/${file}" > "${EXTRACT_DIR}/${file%.gz}"
done

echo "[fashion-mnist] Dataset téléchargé dans: ${EXTRACT_DIR}"
