#!/bin/bash
# Deploy Shōbu Escrow to HashKey Testnet (EVM)
set -e

# Load environment variables
if [ -f .env ]; then
  source .env
else
  echo ".env file not found! Please map your deployer private key."
  exit 1
fi

echo "🚀 Deploying Shōbu Escrow to HashKey Chain Testnet (133)..."

if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
  echo "Error: DEPLOYER_PRIVATE_KEY is missing in .env"
  exit 1
fi

# Fallback to standard Hashkey testnet RPC if not defined
RPC_URL=${HASHKEY_RPC_URL:-"https://hashkeychain-testnet.alt.technology"}

forge script src/beam/script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY

# Optional: Add verification step if required
# forge verify-contract <address> <contract> --verifier blockscout --verifier-url "https://hashkeychain-testnet-explorer.alt.technology/api"

echo "✅ Deployment to HashKey Testnet complete!"
