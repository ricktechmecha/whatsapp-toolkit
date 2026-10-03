#!/usr/bin/env bash
# ============================================================================
# start_bridge.sh — Inicia el WhatsApp Bridge con store personalizado
# ============================================================================
# Uso:
#   ./start_bridge.sh                    # Store por defecto (store), puerto 8080, QR
#   ./start_bridge.sh store-lety 8081    # Store lety, puerto 8081
#   STORE_DIR=store PORT=8080 ./start_bridge.sh
#   PAIR_PHONE=521XXXXXXXXXX ./start_bridge.sh   # Pairing code en vez de QR
#
# Variables de entorno:
#   STORE_DIR  — Carpeta del store (default: store)
#   PORT       — Puerto del REST API (default: 8080)
#   PAIR_PHONE — Si se setea, usa código de 8 dígitos en vez de QR
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$SCRIPT_DIR/whatsapp-bridge"
BINARY="$BRIDGE_DIR/whatsapp-bridge"

# Argumentos posicionales
STORE_DIR="${1:-${STORE_DIR:-store}}"
PORT="${2:-${PORT:-8080}}"

# Verificar que el binario existe
if [ ! -f "$BINARY" ]; then
  echo "ERROR: No se encontró el binario $BINARY"
  echo "Compila con: cd $BRIDGE_DIR && go build -o whatsapp-bridge ."
  exit 1
fi

# Verificar que el store existe (si no, se crea automáticamente)
if [ ! -d "$BRIDGE_DIR/$STORE_DIR" ]; then
  echo "Store '$STORE_DIR' no existe. Se creará automáticamente (necesitarás escanear QR)."
fi

echo "============================================"
echo "  WhatsApp Bridge"
echo "  Store:  $STORE_DIR"
echo "  Puerto: $PORT"
if [ -n "${PAIR_PHONE:-}" ]; then
  echo "  Modo:   Pair Code ($PAIR_PHONE)"
else
  echo "  Modo:   QR Code"
fi
echo "============================================"
echo ""

cd "$BRIDGE_DIR"
export STORE_DIR
export PORT
export PAIR_PHONE

exec "$BINARY"
