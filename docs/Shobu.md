# Shōbu on Stellar — WA Residency Application

## 1. Team & Background

**Team Overview:**
Shōbu is being engineered by a solo full-stack Web3 developer (my full contributions and history can be verified via my [linked GitHub profile](https://github.com/0takuc0mrade)). I am responsible for the end-to-end architecture of the protocol, which includes:
* Developing the core `shobu-escrow-soroban` smart contracts in Rust.
* Building the AI-driven autonomous agent swarm in TypeScript using OpenServ and the Stellar SDK.
* Integrating the Next.js frontend with the Freighter wallet for client-side transaction signing.

As a solo founder, I maintain a lean, highly technical approach to protocol design, allowing for rapid iteration and architecture shifts—such as the recent pivot to a fully verifiable, zero-sum PvP Web3 economy.

---

## 2. Prior Art — What's Already Built

The following work has been completed on Stellar Testnet and is publicly verifiable:

| Component | Status | Evidence |
|-----------|--------|----------|
| Soroban escrow contract (Rust) | ✅ Deployed | [`src/stellar/escrow/src/lib.rs`](https://github.com/0takuc0mrade/Shobu/blob/main/src/stellar/escrow/src/lib.rs) — 410 lines, 8 unit tests |
| Persistent storage architecture | ✅ Live | Instance storage (config) + persistent storage with 30-day TTL (pools/bets) |
| AI settler agent (Soroban) | ✅ Running | Autonomous scan → cancel loop on testnet with cooldown and deadline detection |
| Ghost seeding (dual keypair) | ✅ Operational | SHA-256 derived keypair seeds YES/NO liquidity on every new pool |
| MPP integration | ✅ Integrated | `mppx@0.5.10` + `@stellar/mpp@0.4.0` for autonomous 402 payment flows |
| Soroban native indexer | ✅ Live | Direct RPC reads via `getLedgerEntries()` with in-memory TTL cache |
| Freighter wallet integration | ✅ Working | Client-side Soroban transaction construction and signing |
| Frontend data pipeline | ✅ Complete | Pool reader, portfolio hook, pool overlay, SGS game discovery |
| Testnet contract | ✅ Deployed | `CAVMUYF3S54QSPSNWN5LUI3YEPRFIRPFWSULNIWBSHA4IPPPGSSCCOPB` |

This prior art demonstrates that the core protocol is technically sound and operational. **The residency budget is focused entirely on the forward-looking work required to take Shōbu from testnet to a production-grade, mainnet-ready protocol with real users.**

---

## 3. Milestones & Budget Breakdown

**Total Requested Budget:** $10,000 USD
**Hourly Rate Calculation:** $100/hr × 100 hours

---

### 🔒 Milestone 1: Security Hardening & Mainnet Contract Deployment
**Objective:** Production-harden the Soroban escrow contract and deploy to Stellar Mainnet.
**Deliverables:**
* Independent security review and remediation of the `shobu-escrow-soroban` contract, including formal verification of the payout math, reentrancy-equivalent analysis for Soroban, and access control audit.
* Implementation of an admin-gated emergency pause mechanism (`pause_pool` / `unpause`) for incident response.
* Gas/fee optimization pass — minimize resource footprint for high-frequency `place_bet` and `settle_pool` invocations.
* Mainnet deployment with a hardened `init()` call, verified admin/manager keypairs, and documented deployment run-book.
* **Verification:** Published audit report (or self-audit checklist with findings), mainnet contract address on [stellar.expert](https://stellar.expert), and deployment run-book in `/docs`.
* **Budget:** 30 hours ($3,000)

---

### 🏦 Milestone 2: SEP-8 Regulated Asset Migration & Compliance Implementation
**Objective:** Migrate from testnet native XLM to a compliant, regulated asset for mainnet wagering.
**Deliverables:**
* Integration with a Stellar-native regulated asset (e.g., USDC via Circle's Stellar anchor) as the default pool token, replacing testnet XLM.
* Architecture documentation and prototype for `SEP-8: Regulated Assets` integration — requiring issuer approval on each `place_bet` transfer, enabling automated KYC enforcement.
* Implementation of IP-based geoblocking via Vercel Edge Functions for prohibited jurisdictions (US, UK, OFAC-sanctioned countries) as documented in `COMPLIANCE.md`.
* Edge-function middleware with structured logging for audit trails.
* **Verification:** Working USDC-denominated pool on mainnet (or testnet with mainnet-equivalent anchor), active geoblocking on the frontend deployment, and updated `COMPLIANCE.md` with implementation details.
* **Budget:** 25 hours ($2,500)

---

### 📈 Milestone 3: User Acquisition & Stellar Community Growth
**Objective:** Onboard the first cohort of real users and establish Shōbu as a visible Stellar ecosystem project.
**Deliverables:**
* Deploy the production frontend to a public URL (Vercel) fully connected to Stellar Mainnet.
* Create comprehensive user-facing documentation: "How to bet on Shōbu" guide, Freighter setup walkthrough, and FAQ.
* Record and publish an end-to-end protocol demo video (pool creation → betting → settlement → claim).
* Integrate with at least 2 active games on the Stellar Game Studio Game Hub for real pool discovery.
* Community outreach: Stellar Discord engagement, at least 3 forum/social posts introducing Shōbu, and feedback collection from early users.
* **Adoption targets:**
  * 10 unique bettors placing real bets on Stellar Mainnet within 60 days of launch.
  * 5 pools settled autonomously by the AI agent on mainnet.
  * Public dashboard or log showing agent activity (pools created, settled, cancelled).
* **Verification:** Public deployment URL, demo video link, forum post links, and on-chain transaction history showing unique bettor addresses.
* **Budget:** 30 hours ($3,000)

---

### 🛡️ Milestone 4: Post-Grant Maintenance & Sustainability
**Objective:** Ensure the protocol remains operational, secure, and maintained beyond the grant period.
**Deliverables:**
* 6-month maintenance commitment covering:
  * Soroban contract TTL extensions (persistent storage entries require periodic renewal).
  * Agent uptime monitoring and restart procedures.
  * Dependency updates for `soroban-sdk`, `@stellar/stellar-sdk`, `mppx`, and `@stellar/mpp`.
  * Bug fixes and security patches for critical issues.
* Documented operational run-book: how to monitor the agent, renew TTLs, upgrade the contract, and handle incidents.
* Implementation of a lightweight health-check endpoint that reports agent status, last settle cycle, and pool count.
* Sustainability plan: protocol fee (2.5% on settled pools) funds ongoing operations; document the break-even analysis (estimated pools/month needed to cover RPC and hosting costs).
* **Verification:** Published run-book in `/docs`, health-check endpoint live, and monthly status update posts in the Stellar community for 3 months post-launch.
* **Budget:** 15 hours ($1,500)

---

## 4. Stellar Ecosystem Alignment

Shōbu is not a port — it is built *for* Stellar. The protocol leverages capabilities unique to the Stellar ecosystem:

| Stellar Capability | How Shōbu Uses It |
|---------------------|-------------------|
| **Soroban persistent storage** | Pool and bet data with 30-day TTL extensions — avoids the 64KB instance storage ceiling |
| **Machine Payments Protocol (MPP)** | Agent autonomously pays for oracle data via `mppx` — true machine-to-machine settlement |
| **Freighter wallet** | Client-side Soroban transaction construction — no backend signing required |
| **SEP-8 Regulated Assets** | Planned mainnet token — automated KYC compliance at the asset transfer level |
| **Stellar Game Studio** | Native game discovery from the SGS Game Hub contract for automatic pool creation |
| **Low-cost transactions** | Sub-cent fees enable micro-betting markets unviable on high-gas chains |

---

## 5. Maintenance Plan

**During the grant period (Months 1–4):**
* Active development across all milestones.
* Weekly agent uptime monitoring and contract state verification.
* Immediate response to security issues or contract bugs.

**Post-grant commitment (Months 5–10):**
* 6-month maintenance window for TTL renewals, dependency updates, and critical bug fixes.
* Monthly status updates posted to the Stellar community (Discord / forum).
* Protocol fee revenue (2.5% on settled pools) funds ongoing RPC costs, hosting, and agent compute.

**Long-term sustainability:**
* The 2.5% protocol fee creates a self-sustaining revenue model once organic volume reaches ~$2,000/month in settled pools (covering ~$50/month in infrastructure costs).
* All contract code is open-source and MIT-licensed — community contributors can submit improvements.
* If the developer becomes unavailable, the admin key can transfer contract ownership to a new maintainer.
