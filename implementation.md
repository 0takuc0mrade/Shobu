# Implement Beam EVM Multichain Architecture

This plan outlines the steps to replicate Shōbu’s core Starknet functionality on the Beam EVM network and upgrade the OpenServ AI agents to dynamically route bets between both blockchains. 

## User Review Required

> [!IMPORTANT]
> Since we are entering the EVM ecosystem, we need to decide how to handle user wallets on the frontend. The current Starknet implementation uses Cartridge Controller. We should consider adding **Privy** or **Wagmi/RainbowKit** for seamless Web2-style EVM onboarding to match our "frictionless" vision.
>
> Additionally, I will embed an EOA generated from a private key (stored in `.env`) for the agents to interact with the EVM, since `x402` and agent wallets require standard crypto keys.

## Proposed Changes

### EVM Smart Contracts (Foundry)
We will initialize a Foundry project to house the Solidity version of the protocol.

#### [NEW] src/beam/foundry.toml
#### [NEW] src/beam/src/Escrow.sol
Translate the core logic of `src/systems/actions.cairo` (create_pool, place_bet, settle_pool) into Solidity logic.
#### [NEW] src/beam/script/Deploy.s.sol
A deployment script pointed to the Beam testnet RPC.

### OpenServ Agent Adapters
We need to give the Agents the ability to execute EVM transactions natively.

#### [MODIFY] agents/package.json
Add `viem` and `ethers` alongside the current `starknet` dependencies.

#### [MODIFY] agents/src/orchestrator/agent.ts
Update the intent routing engine so the Orchestrator can discern if a user's prompt applies to a Starknet game (e.g., *Pistols at 10 Blocks*) or a Beam game (e.g., *Shrapnel*).

#### [NEW] agents/src/shared/evm-adapter.ts
A standalone typescript module to instantiate an EVM wallet for the agents using `viem` to write to the `Escrow.sol` contract deployed on Beam.

### Frontend Adaptations
Keep the UX identical, but add dynamic network connection switching.

#### [MODIFY] frontend/package.json
Add EVM libraries for the frontend users (`wagmi`, `viem`).

## Open Questions

> [!WARNING]
> 1. **Agent Wallet Setup:** Do you want me to simply generate a fresh Ethereum private key for the agents to use as their internal wallet, or use a specific MPC wallet service?
> 2. **Frontend Interaction:** Shall we add a standard WalletConnect/Wagmi button to the header so users can switch to an EVM wallet when dealing with Beam markets?

## Verification Plan

### Automated Tests
- Run `forge test` inside `src/beam` to verify `Escrow.sol` functionality (bet placement, settlement logic, cancellation).

### Manual Verification
- Deploy `Escrow.sol` to the Beam testnet.
- Run the local node Orchestrator and issue: `"Open a pool for Shrapnel"`.
- Observe the Orchestrator successfully triggering the `evm-adapter` and returning a valid Beam testnet tx hash.
