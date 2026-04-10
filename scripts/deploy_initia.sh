#!/bin/bash
# Deploy Shōbu Escrow to Initia Testnet (Move)
set -e

# Load environment variables
if [ -f .env ]; then
  source .env
fi

echo "🚀 Compiling Initia Move module..."

# Replace this with your exact Initia move module path if adjusted.
MODULE_PATH="src/initia/escrow"

if [ ! -d "$MODULE_PATH" ]; then
  echo "⚠️ Initia Move module source not found at $MODULE_PATH. Please compile manually."
  exit 1
fi

cd "$MODULE_PATH"
initia move compile

echo "✅ Move Module compiled. Publishing to Initia Initiation-2 Testnet..."

if [ -z "$INITIA_deployer_name" ]; then
  DEPLOYER="deployer"
else
  DEPLOYER="$INITIA_deployer_name"
fi

RPC_URL=${INITIA_RPC_URL:-"https://rpc-testnet.initia.xyz"}

# Dispatch the execution to publish the Move module
initiad tx mvm publish \
  --from "$DEPLOYER" \
  --gas auto \
  --gas-adjustment 1.5 \
  --fees 1000uinit \
  --chain-id initiation-2 \
  --node "$RPC_URL" \
  -y

echo "✅ Deployment to Initia Appchain Testnet complete!"
