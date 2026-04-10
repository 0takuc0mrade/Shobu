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
# Note: Ensure you have initialized your deployment identity using:
# stellar keys generate --network testnet deployer

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/shobu_escrow_soroban.wasm \
  --source-account deployer \
  --network testnet

echo "✅ Deployment to Stellar Testnet complete!"
