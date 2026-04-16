#!/bin/bash
# Deploy Shōbu Escrow to Stellar Testnet (Soroban)
set -e

# Load environment variables
if [ -f .env ]; then
  source .env
fi

echo "🚀 Building Soroban Escrow contract..."

# Move to the soroban crate and build
cd src/stellar/escrow
stellar contract build

echo "✅ Compilation successful. Deploying to Stellar Testnet..."

# Deploy the module to Stellar
# We use the default identity funded via curl
stellar contract deploy \
  --wasm target/wasm32v1-none/release/shobu_escrow_soroban.wasm \
  --source-account default \
  --network testnet \
  --network-passphrase "Test SDF Network ; September 2015" \
  --rpc-url "https://soroban-testnet.stellar.org:443"

echo "✅ Deployment to Stellar Testnet complete!"
