#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATASET_DIR="${1:-${ROOT_DIR}/datasets/cifar100}"
RAW_DIR="${DATASET_DIR}/raw"
EXTRACT_DIR="${DATASET_DIR}/extracted"
ARCHIVE_PATH="${RAW_DIR}/cifar-100-python.tar.gz"
DATASET_URL="https://www.cs.toronto.edu/~kriz/cifar-100-python.tar.gz"

mkdir -p "${RAW_DIR}" "${EXTRACT_DIR}"

if [[ -f "${EXTRACT_DIR}/cifar-100-python/train" ]]; then
	echo "[cifar100] Dataset déjà présent: ${EXTRACT_DIR}"
	exit 0
fi

echo "[cifar100] Téléchargement..."
curl -fL "${DATASET_URL}" -o "${ARCHIVE_PATH}"

echo "[cifar100] Extraction..."
tar -xzf "${ARCHIVE_PATH}" -C "${EXTRACT_DIR}"

echo "[cifar100] Dataset téléchargé dans: ${EXTRACT_DIR}"