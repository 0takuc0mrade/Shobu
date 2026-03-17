#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# deploy_sepolia.sh — Deploy Shobu to Starknet Sepolia
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# ── RPC endpoint ──────────────────────────────────────────────
DEFAULT_RPC_URL="https://api.cartridge.gg/x/starknet/sepolia"
STARKNET_RPC_URL="${STARKNET_RPC_URL:-$DEFAULT_RPC_URL}"
export STARKNET_RPC_URL

# Optional RPC headers (comma-separated): "Name:Value,Other:Value"
STARKNET_RPC_HEADERS="${STARKNET_RPC_HEADERS:-}"
RPC_HEADER_ARGS=()
CURL_HEADER_ARGS=()
if [ -n "$STARKNET_RPC_HEADERS" ]; then
  IFS=',' read -r -a _RPC_HEADERS <<< "$STARKNET_RPC_HEADERS"
  for hdr in "${_RPC_HEADERS[@]}"; do
    hdr="${hdr#"${hdr%%[![:space:]]*}"}"
    hdr="${hdr%"${hdr##*[![:space:]]}"}"
    if [ -n "$hdr" ]; then
      RPC_HEADER_ARGS+=(--rpc-header "$hdr")
      CURL_HEADER_ARGS+=(--header "$hdr")
    fi
  done
fi

# ── Prompt for credentials ────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
echo "   Shobu — Sepolia Deployment"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "RPC URL: $STARKNET_RPC_URL"
if [ ${#RPC_HEADER_ARGS[@]} -gt 0 ]; then
  echo "RPC headers: set via STARKNET_RPC_HEADERS"
fi
echo ""

read -rp "Enter your Starknet account address: " DOJO_ACCOUNT_ADDRESS
if [ -z "$DOJO_ACCOUNT_ADDRESS" ]; then
  echo "Error: Account address cannot be empty."
  exit 1
fi
export DOJO_ACCOUNT_ADDRESS

echo ""
read -rsp "Enter your private key (hidden): " DOJO_PRIVATE_KEY
echo ""
if [ -z "$DOJO_PRIVATE_KEY" ]; then
  echo "Error: Private key cannot be empty."
  exit 1
fi
export DOJO_PRIVATE_KEY

# ── Cleanup trap ──────────────────────────────────────────────
cleanup_env() {
  echo ""
  echo "Cleaning up environment variables..."
  unset STARKNET_RPC_URL
  unset STARKNET_RPC_HEADERS
  unset DOJO_ACCOUNT_ADDRESS
  unset DOJO_PRIVATE_KEY
  echo "Environment variables cleared."
}
trap cleanup_env EXIT

# ── Verify RPC connectivity ───────────────────────────────────
echo ""
echo "Verifying RPC connectivity..."
CHAIN_HEX=$(curl -s --location "$STARKNET_RPC_URL" \
  --header 'Content-Type: application/json' \
  "${CURL_HEADER_ARGS[@]}" \
  --data '{"id":0,"jsonrpc":"2.0","method":"starknet_chainId","params":{}}' \
  | grep -o '"result":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CHAIN_HEX" ]; then
  echo "Error: Could not connect to RPC at $STARKNET_RPC_URL"
  exit 1
fi

CHAIN_NAME=$(echo -n "$CHAIN_HEX" | xxd -r -p 2>/dev/null || echo "unknown")
echo "Connected to chain: $CHAIN_NAME ($CHAIN_HEX)"

if [ "$CHAIN_NAME" != "SN_SEPOLIA" ]; then
  echo "Warning: Expected SN_SEPOLIA but got $CHAIN_NAME"
  read -rp "Continue anyway? (y/N): " CONTINUE
  if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
    exit 1
  fi
fi

USE_BLAKE2S_CASM=()
if [ "$CHAIN_NAME" = "SN_SEPOLIA" ]; then
  if [[ "$STARKNET_RPC_URL" != *sepolia* && "$STARKNET_RPC_URL" != *testnet* ]]; then
    USE_BLAKE2S_CASM=(--use-blake2s-casm-class-hash)
    echo "Using --use-blake2s-casm-class-hash (RPC URL does not include sepolia/testnet)"
  fi
fi

# ── Build ─────────────────────────────────────────────────────
echo ""
echo "Building the project..."
sozo -P sepolia build

# ── Migrate ───────────────────────────────────────────────────
echo ""
echo "Deploying to Sepolia..."
MIGRATE_OUTPUT=$(sozo -P sepolia migrate "${USE_BLAKE2S_CASM[@]}" "${RPC_HEADER_ARGS[@]}" 2>&1 | tee /dev/stderr)

# ── Configure Denshokan ───────────────────────────────────────
echo ""
DENSHOKAN_DEFAULT_TOKEN="0x0142712722e62a38f9c40fcc904610e1a14c70125876ecaaf25d803556734467"
read -rp "Enter the Denshokan token contract address [${DENSHOKAN_DEFAULT_TOKEN}]: " DENSHOKAN_TOKEN
DENSHOKAN_TOKEN="${DENSHOKAN_TOKEN:-$DENSHOKAN_DEFAULT_TOKEN}"

echo ""
echo "Configuring Denshokan token..."
sozo -P sepolia execute "${USE_BLAKE2S_CASM[@]}" "${RPC_HEADER_ARGS[@]}" --wait shobu-Escrow configure_denshokan "$DENSHOKAN_TOKEN" 1

# ── Parse World Address ───────────────────────────────────────
WORLD_ADDRESS=$(echo "$MIGRATE_OUTPUT" | grep -oP 'world at address \K0x[0-9a-fA-F]+' || true)

if [ -z "$WORLD_ADDRESS" ]; then
  WORLD_ADDRESS=$(echo "$MIGRATE_OUTPUT" | grep -oP 'World deployed.*address[:\s]+\K0x[0-9a-fA-F]+' || true)
fi

if [ -z "$WORLD_ADDRESS" ]; then
  echo ""
  echo "Warning: Could not automatically parse the World Address."
  echo "Check the output above and manually note it."
  echo ""
  read -rp "Paste the World Address here (or press Enter to skip): " WORLD_ADDRESS
fi

# ── Parse deployed block ─────────────────────────────────────
DEPLOYED_BLOCK=$(echo "$MIGRATE_OUTPUT" | grep -oP 'deployed at block \K[0-9]+' || true)

# ── Write sepolia_config.json ─────────────────────────────────
CONFIG_FILE="sepolia_config.json"
cat > "$CONFIG_FILE" <<EOF
{
  "world_address": "${WORLD_ADDRESS}",
  "rpc_url": "${STARKNET_RPC_URL}",
  "chain_id": "SN_SEPOLIA",
  "deployed_block": "${DEPLOYED_BLOCK}",
  "deployed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "account_address": "${DOJO_ACCOUNT_ADDRESS}"
}
EOF

echo ""
echo "═══════════════════════════════════════════════════════"
echo "   Deployment Complete!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  World Address:  ${WORLD_ADDRESS:-'(not parsed)'}"
echo "  Deployed Block: ${DEPLOYED_BLOCK:-'(not parsed)'}"
echo "  RPC URL:        ${STARKNET_RPC_URL}"
echo "  Config saved:   ${CONFIG_FILE}"
echo ""

if [ -n "$WORLD_ADDRESS" ]; then
  echo "Next steps:"
  echo "  1. Update dojo_sepolia.toml [env] with:"
  echo "     world_address = \"${WORLD_ADDRESS}\""
  if [ -n "$DEPLOYED_BLOCK" ]; then
    echo "     world_block = ${DEPLOYED_BLOCK}"
  fi
  echo "  2. Start Torii indexer:"
  echo "     torii --world ${WORLD_ADDRESS} --rpc ${STARKNET_RPC_URL}"
  echo "  3. Update your frontend to use the Sepolia RPC and world address."
  echo ""
fi
