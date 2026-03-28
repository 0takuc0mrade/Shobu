# Shobu

> Decentralized betting and escrow protocol for on-chain games, built with [Dojo](https://dojoengine.org) on Starknet.

Shobu lets anyone create permissionless betting pools around on-chain game outcomes. Players place bets on who will win a game, and the protocol settles automatically once the game finishes — either via direct game-world queries or EGS (denshokan session token) verification.

---

## Architecture

```
shobu/
├── src/                     # Cairo smart contracts (Dojo world)
│   ├── systems/actions.cairo    # Escrow contract — pool lifecycle
│   ├── models.cairo             # BettingPool, Bet, OddsSnapshot, etc.
│   ├── interfaces.cairo         # IGameWorld, IMinigameTokenData, IERC20
│   ├── odds.cairo               # On-chain odds calculation
│   └── tests/                   # Cairo unit tests
├── frontend/                # Next.js betting UI
│   ├── app/                     # App router pages
│   ├── components/              # Betting UI components
│   ├── providers/               # StarkZap + Cartridge Controller
│   └── lib/                     # Web3 config, utilities
└── agents/                  # OpenServ AI agents (TypeScript)
    └── src/
        ├── shared/              # Config, Starknet session, Torii queries
        ├── pool-creator/        # Automated pool creation from game feeds
        ├── settler/             # Automated game settlement
        ├── analyst/             # AI-powered odds & market analysis
        └── orchestrator/        # Full lifecycle coordinator
```

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

Scans open pools and attempts settlement for any whose games have finished. Settlement is permissionless — the on-chain call reverts if the game isn't done yet, so it's safe to try and skip.

- **Trigger**: Cron (every 2 minutes)
- **Capabilities**: `list_open_pools`, `check_game_status`, `settle_pool`, `auto_settle`

### Analyst

Provides on-demand odds analysis, individual pool insights, and full market overviews. Uses OpenServ's `generate()` for platform-delegated AI analysis — no LLM API keys needed.

- **Trigger**: Webhook
- **Capabilities**: `get_pool_odds`, `analyze_pool`, `market_overview`

### Orchestrator

Coordinates the full pool lifecycle in a single call: scan → create → settle → report. Generates AI-powered summaries of each management cycle.

- **Trigger**: Webhook
- **Capabilities**: `scan_and_create`, `settle_all`, `protocol_status`, `full_cycle`

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
| Smart Contracts | Cairo, Dojo Framework |
| Indexer | Torii (Dojo SDK) |
| Frontend | Next.js, StarkZap, Cartridge Controller |
| Agents | OpenServ SDK, TypeScript, Cartridge Sessions |
| Network | Starknet Sepolia |

---

## Roadmap

Shobu is evolving into a fully autonomous, cross-chain betting infrastructure. Our roadmap focuses on deep integration with the OpenServ ecosystem:

### Phase 1: Foundation & Observability
- **ERC-8004 Identity**: Register all agents on the Base blockchain for on-chain verifiability and discovery.
- **Cloud Deployment**: Transition from local tunneling to 24/7 managed hosting on OpenServ Cloud.
- **Protocol Audit Trails**: Implement structured logging and persistent file uploads for full operational transparency.
- **zkTLS Research & POC**: Study zkTLS (e.g., Reclaim) and prototype Web2 match settlement proofs for Starknet.

### Phase 2: Monetization & Ecosystem
- **x402 Paid Analysis**: Enable paid API calls for the Analyst agent to provide premium market intelligence.
- **Ideaboard Synergy**: List Shobu services on the OpenServ Ideaboard to foster multi-agent collaboration.
- **Multi-Agent Orchestration**: Implement declarative workflow edges for true, DAG-based autonomous coordination.

### Phase 3: Expansion & Optimization
- **Base Protocol Token**: Launch the SHOBU token on Base with Aerodrome concentrated liquidity.
- **Runless AI Optimization**: Pivot to platform-native runless capabilities to minimize agent overhead and cost.

---

## License

MIT
