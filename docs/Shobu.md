# Shobu on Stellar

## 1. Team & Background Section

**Team Overview:**
Shōbu is being engineered by a solo full-stack Web3 developer (my full contributions and history can be verified via my linked GitHub profile). I am responsible for the end-to-end architecture of the protocol, which includes:
* Developing the core `shobu-escrow-soroban` smart contracts in Rust.
* Building the AI-driven autonomous agent swarm in TypeScript using OpenServ and the Stellar SDK.
* Integrating the Next.js frontend with the Freighter wallet for client-side transaction signing.

As a solo founder, I maintain a lean, highly technical approach to protocol design, allowing for rapid iteration and architecture shifts—such as the recent pivot to a fully verifiable, zero-sum PvP Web3 economy.

---

## 2. Milestones & Budget Breakdown

**Total Requested Budget:** $10,000 USD
**Hourly Rate Calculation:** $100/hr x 100 hours

### 🛠️ Milestone 1: Soroban Smart Contract & Storage Architecture
**Objective:** Finalize and deploy the core prediction market escrow engines native to Soroban.
**Deliverables:**
* Complete Rust implementation of `shobu-escrow-soroban`.
* Implementation of the YES/NO binary pool state machine.
* Complex storage optimization: Segregating configuration into Instance Storage while utilizing Persistent Storage with TTL extensions for high-volume Pool/Bet arrays to avoid Soroban's 64KB limits.
* **Verification:** Open-source GitHub repository link, and deployed Stellar Testnet contract address.
* **Budget:** 30 hours ($3,000)

### 🤖 Milestone 2: AI Agent Swarm & Machine Payments (MPP)
**Objective:** Build the off-chain autonomous infrastructure that drives the protocol without human intervention.
**Deliverables:**
* "Ghost Seeding" architecture: Agents autonomously seed new pools with derived keypairs to solve the prediction market cold-start problem.
* Integration of Stellar Machine-to-Machine Payments (MPP) using `mppx` to autonomously handle 402 Payment Required challenges when fetching external oracle/match data.
* **Verification:** Open-source GitHub repository containing the `pool-creator` and `settler` agent logic utilizing the Stellar SDK.
* **Budget:** 30 hours ($3,000)

### 🌐 Milestone 3: Client Interface & Freighter Integration
**Objective:** Deliver a production-ready interface for users to connect and wager.
**Deliverables:**
* Next.js application tailored for the Stellar ecosystem.
* Freighter browser extension integration for wallet authentication, balance fetching, and client-side Soroban transaction construction/signing.
* Data surfacing of the Soroban indexer to display live odds.
* **Verification:** Deployed staging URL (e.g., Vercel) fully connected to the Stellar Testnet.
* **Budget:** 25 hours ($2,500)

### ⚖️ Milestone 4: Compliance Engine & Mainnet Readiness
**Objective:** Establish the regulatory boundaries and documentation required before Shōbu handles real-world value.
**Deliverables:**
* Implementation of IP-based geoblocking at the network edge for prohibited jurisdictions.
* Finalized architecture documentation for migrating from testnet native tokens to Stellar `SEP-8: Regulated Assets` (e.g., compliant USDC) for mainnet deployment.
* Comprehensive protocol walkthrough video and developer docs.
* **Verification:** `COMPLIANCE.md` published to repo, recorded MVP demo video, and active Edge-function IP blocks on the frontend.
* **Budget:** 15 hours ($1,500)
