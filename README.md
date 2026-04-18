# Shobu

> Decentralized betting and escrow protocol for on-chain games, built with [Dojo](https://dojoengine.org) on Starknet.

Shobu lets anyone create permissionless betting pools around on-chain game outcomes. Players place bets on who will win a game, and the protocol settles automatically once the game finishes — either via direct game-world queries or EGS (denshokan session token) verification.

---

## 🌌 Stellar / Soroban Integration

Shōbu runs natively on **Stellar Soroban** as a first-class deployment target alongside Starknet. The Stellar integration delivers a complete prediction market pipeline — from autonomous pool creation to settlement — with zero dependency on the Starknet indexer.

### Soroban Escrow Contract

The [`shobu-escrow-soroban`](src/stellar/escrow/src/lib.rs) contract implements the full betting lifecycle in Rust:

| Function | Description |
|----------|-------------|
| `create_pool` | Create a new YES/NO prediction market |
| `place_bet` | Bet on an outcome (token transferred to contract) |
| `settle_pool` | Manager declares winner, protocol fee deducted |
| `claim_winnings` | Winners claim proportional payout |
| `cancel_pool` | Cancel an unresolvable market |
| `claim_refund` | Full refund from cancelled pools |
| `get_pool` / `get_bet` | Read-only queries for pool and bet state |

**Storage architecture**: Admin, Manager, and PoolCounter live in instance storage (singleton config). Pool, Bet, and ProtocolFee data use persistent storage with 30-day TTL extensions, preventing the silent 64KB instance storage limit from crashing the contract as pools accumulate.

### 🌱 Ghost Seeding — Autonomous Liquidity

The AI agent swarm autonomously seeds every new Soroban pool with balanced YES/NO liquidity using two keypairs:
- **Primary agent keypair** → bets YES (predicted_winner = player1)
- **Derived ghost keypair** (SHA-256 of agent secret) → bets NO (predicted_winner = player2)

This prevents cold-start 0/0 pools and gives immediate odds for the frontend UI.

### 🔭 Freighter Wallet

Stellar users connect via [Freighter](https://www.freighter.app/) browser extension. The frontend auto-detects Freighter, builds Soroban transactions client-side, and uses Freighter's `signTransaction()` for user signatures.

### 🤖 Machine Payments (MPP)

The agent uses [Stellar MPP](https://www.stellar.org/blog/developers/introducing-mpp) (`mppx` + `@stellar/mpp`) to automatically handle 402 Payment Required responses from paid oracle services — enabling fully autonomous machine-to-machine settlement.

### Soroban Architecture

```
src/stellar/escrow/       # Soroban smart contract (Rust)
agents/src/shared/
  ├── stellar-adapter.ts     # Agent → Soroban transaction builder
  └── soroban-indexer.ts     # Native Soroban pool reader (RPC)
frontend/
  ├── lib/stellar-pool-reader.ts   # Frontend Soroban data fetcher
  └── hooks/use-stellar-portfolio.ts  # Portfolio hook for Stellar bets
```

### Deploy on Soroban

```bash
cd src/stellar/escrow
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/shobu_escrow_soroban.wasm \
  --source <YOUR_SECRET_KEY> \
  --network testnet
```

---

## Architecture

```
shobu/
├── src/                     # Smart contracts
│   ├── systems/actions.cairo    # Starknet Escrow — pool lifecycle (Dojo)
│   ├── models.cairo             # BettingPool, Bet, OddsSnapshot, etc.
│   ├── interfaces.cairo         # IGameWorld, IMinigameTokenData, IERC20
│   ├── odds.cairo               # On-chain odds calculation
│   ├── tests/                   # Cairo unit tests
│   └── beam/                    # EVM Escrow (Foundry / Solidity)
│       ├── src/Escrow.sol          # Beam Testnet betting contract
│       └── script/Deploy.s.sol     # Forge deployment script
├── frontend/                # Next.js betting UI
│   ├── app/                     # App router pages
│   ├── components/              # Betting UI components
│   ├── providers/               # Privy (EVM) + Cartridge (Starknet)
│   └── lib/                     # Web3 config, StarkZap v2 SDK, utilities
└── agents/                  # OpenServ AI agents (TypeScript)
    └── src/
        ├── shared/              # Config, Starknet session, EVM adapter, Torii
        ├── pool-creator/        # Automated pool creation from game feeds
        ├── settler/             # Automated game settlement
        ├── analyst/             # AI-powered odds & market analysis
        └── orchestrator/        # Full lifecycle coordinator (chain-aware)
```

---

## ⛓️ Beam EVM & Shrapnel Integration

Shōbu leverages the **Beam EVM** to bring AAA extraction shooters like **Shrapnel** directly onto the decentralized betting protocol.

Rather than relying on slow interoperability bridges, Shōbu's AI agent swarm acts as an instant off-chain settlement highway between isolated subnets:
- **Read Layer (Avalanche Subnet)**: The `Settler` agent securely polls the Shrapnel AVAX Subnet for native `ExtractionSuccessful` smart contract logs to verify if a player survived the match and deposited Sigma.
- **Write Layer (Beam Testnet)**: Upon mathematical verification, the agent instantly drops the Avalanche connection, hot-swaps to the Beam RPC, and securely signs the payout directly onto the Beam `Escrow` pool.

This sub-second settlement model unlocks high-frequency prop-betting that traditional bridging protocols simply cannot support.

---

## Smart Contracts

The core `Escrow` contract manages the entire betting lifecycle:

| Function | Description |
|----------|-------------|
| `create_pool` | Create a direct-settlement pool for an on-chain game |
| `create_egs_pool` | Create a pool using EGS/denshokan session tokens |
| `place_bet` | Bet on player 1 or player 2 |
| `settle_pool` | Permissionless settlement — queries game result on-chain |
| `claim_winnings` | Winners claim proportional share of the pot |
| `cancel_pool` | Cancel a pool (creator or protocol admin) |
| `get_odds` / `get_adjusted_odds` | Query current implied odds |

### Settlement Modes

- **Direct**: Calls `IGameWorld.game_state()` on the game's contract to determine the winner
- **EGS**: Calls `IMinigameTokenData.game_over()` and `score()` on denshokan session tokens to determine the winner

### Models

| Model | Purpose |
|-------|---------|
| `BettingPool` | Pool state: players, pot, status, deadline, settlement mode |
| `Bet` | Individual bet: bettor, predicted winner, amount |
| `OddsSnapshot` | Implied probabilities for each player |
| `ProtocolConfig` | Fee rate and admin settings |
| `DenshokanConfig` | EGS token contract configuration |

---

## AI Agents

Four [OpenServ](https://openserv.ai) agents automate protocol operations, authenticated via **Cartridge Controller session keys**.

### Pool Creator

Monitors game feeds from the [denshokan API](https://denshokan-api-production.up.railway.app/games?network=sepolia), compares against existing on-chain pools via Torii, and creates new betting pools for games that don't have one.

- **Trigger**: Cron (every 5 minutes)
- **Capabilities**: `auto_scan`, `create_pool`, `create_egs_pool`

### Settler

Scans open pools and attempts settlement for any whose games have finished. Settlement is permissionless on Starknet. For **Shrapnel (EVM)**, the Settler acts as an off-chain cross-subnet highway: reading events from the Avalanche subnet and instantly signing payouts onto the Beam EVM Escrow, bypassing slow bridges!

- **Trigger**: Cron (every 2 minutes)
- **Capabilities**: `list_open_pools`, `check_game_status`, `settle_pool`, `auto_settle`, `settle_extraction_pool`

### Analyst

Provides on-demand odds analysis, individual pool insights, and full market overviews. Uses OpenServ's `generate()` for platform-delegated AI analysis — no LLM API keys needed.

- **Trigger**: Webhook
- **Capabilities**: `get_pool_odds`, `analyze_pool`, `market_overview`

### Orchestrator

Coordinates the full pool lifecycle in a single call: scan → create → settle → report. Generates AI-powered summaries of each management cycle.

- **Trigger**: Webhook
- **Capabilities**: `scan_and_create`, `settle_all`, `protocol_status`, `full_cycle`


---

## 👁️ The V2 Vision: A Multimodal Agentic Pipeline

Shōbu is pioneering the concept of an **aICM (agentic Internet Capital Market)** by eliminating human intervention in market creation and settlement. 

In V1, the `Settler` agent resolves Web2 matches (like Riot Games) by pinging official APIs. In **V2**, Shōbu completely bypasses centralized, rate-limited APIs through a custom **Computer Vision Pipeline**.

1. **Stream Ingestion**: The `Settler` agent spawns a headless browser (Puppeteer) and navigates to the live Twitch or YouTube stream of the match.
2. **Visual Sampling**: Every 10 seconds, it extracts a 1080p frame of the broadcast.
3. **Multimodal Extraction**: The frame is sent to a lightweight OCR model (or a frontier model like Gemini Pro Vision) tasked with reading the UI/scoreboard state (e.g., Kills, Gold Difference, Objectives).
4. **Agentic Verification**: Once the visual state matches the betting pool's conditions (e.g., "Will Faker get 10 kills?"), the `Settler` agent autonomously formats the cryptographic proof and executes the settlement algorithm on Starknet using its Cartridge session key.

This ensures the protocol remains fully decentralized, capable of creating micro-betting markets on *any* visual broadcast without needing official API access.

---

## Getting Started

### Prerequisites

- [Dojo](https://dojoengine.org) (v1.8.0+) for building and deploying contracts
- [Node.js](https://nodejs.org) (v18+) for the frontend and agents
- A Cartridge Controller account on Starknet Sepolia

### Deploy Contracts

```bash
# Build
sozo build

# Deploy to Sepolia
sozo migrate --profile sepolia
```

### Run the Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local: set NEXT_PUBLIC_WORLD_ADDRESS, NEXT_PUBLIC_ESCROW_ADDRESS, etc.
npm run dev
```

### Run the Agents

```bash
cd agents
npm install
cp .env.example .env
# Edit .env: set ESCROW_ADDRESS

# Bootstrap Cartridge session (one-time — opens browser for authorization)
ALLOW_INTERACTIVE_AUTH=true EXIT_AFTER_SESSION=true npm run pool-creator

# Run any agent (session reused from disk)
npm run pool-creator    # automated pool creation
npm run settler         # automated settlement
npm run analyst         # odds & market analysis
npm run orchestrator    # full lifecycle coordination
```

> **Note**: The session bootstrap only needs to run once. All agents share the same `.cartridge-agent-session/` directory and Cartridge Controller session.

---

## Network Configuration

The protocol is deployed on **Starknet Sepolia**:

| Config | Value |
|--------|-------|
| RPC URL | `https://api.cartridge.gg/x/starknet/sepolia` |
| World Address | `0x06d1f1bc162ec84e592e4e2e3a69978440f8611224a61b88d8855ff4718c3aca` |
| Pool Token | STRK (`0x04718f5a...938d`) |
| Game Feed | [denshokan API](https://denshokan-api-production.up.railway.app/games?network=sepolia) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts (Starknet) | Cairo, Dojo Framework |
| Smart Contracts (EVM) | Solidity, Foundry, OpenZeppelin |
| Indexer | Torii (Dojo SDK) |
| Frontend | Next.js, Privy (EVM auth), Cartridge Controller (Starknet auth) |
| SDK | StarkZap v2 (wallets, swaps, confidential transfers) |
| Agents | OpenServ SDK, TypeScript, Cartridge Sessions, viem |
| Networks | Starknet Sepolia, Beam Testnet (chain 13337) |

---

## Roadmap

Shobu is evolving into a fully autonomous, cross-chain betting infrastructure. Our roadmap focuses on deep integration with the OpenServ ecosystem:

### Phase 1: Foundation & Observability
- **ERC-8004 Identity**: Register all agents on the Base blockchain for on-chain verifiability and discovery.
- **Cloud Deployment**: Transition from local tunneling to 24/7 managed hosting on OpenServ Cloud.
- **Protocol Audit Trails**: Implement structured logging and persistent file uploads for full operational transparency.
- **zkTLS Research & POC**: Study zkTLS (e.g., Reclaim) and prototype Web2 match settlement proofs for Starknet.

### Phase 2: Multichain & StarkZap Integration
- **Beam EVM Escrow**: Deploy Solidity escrow contract on Beam Testnet for EVM-native betting pools. ✅
- **Privy Auth Migration**: Dual login (email/social via Privy + Cartridge for Starknet degens). ✅
- **Chain-Aware Agent Routing**: Orchestrator dynamically routes to Starknet or Beam based on game. ✅
- **StarkZap v2 SDK**: Scaffold wallet onboarding, token transfers, swaps, and confidential transfers.
  - Wallet onboarding (Privy, Cartridge, raw signers) ✅
  - Token transfers & balances (STRK, ETH, USDC, BTC)
  - Confidential transfers via Tongo (Shielded Bets testing complete) ✅
  - Ethereum bridging (via `ethers`)
  - Swaps, staking, DCA, lending
- **Future StarkZap Use for Shōbu**:
  - Shield high-roller FOCG betting amounts on Starknet
  - Gasless token approvals for Dojo escrow interactions

### Phase 3: Monetization & Ecosystem
- **x402 Paid Analysis**: Enable paid API calls for the Analyst agent to provide premium market intelligence.
- **Ideaboard Synergy**: List Shobu services on the OpenServ Ideaboard to foster multi-agent collaboration.
- **Multi-Agent Orchestration**: Implement declarative workflow edges for true, DAG-based autonomous coordination.

### Phase 4: Expansion & Optimization
- **Base Protocol Token**: Launch the SHOBU token on Base with Aerodrome concentrated liquidity.
- **Runless AI Optimization**: Pivot to platform-native runless capabilities to minimize agent overhead and cost.

---

## License

MIT
