# Shōbu Compliance & Regulatory Boundaries

This document outlines the regulatory posture, KYC/AML boundaries, and risk mitigation strategies for the Shōbu prediction market protocol as it transitions from a testnet/play-to-earn environment to real financial markets on mainnet.

## 1. Current State: Testnet & Play-to-Earn

Currently, Shōbu operates strictly as an experimental, play-to-earn simulation. 
- **Assets:** The platform utilizes Stellar Testnet XLM and Starknet Sepolia STRK. These tokens hold zero economic value.
- **Regulatory Posture:** Because there is no exchange of real monetary value, the protocol falls outside the purview of financial regulators (such as the SEC or CFTC in the United States, or the FCA in the UK) regarding unregulated derivatives or gambling.
- **Access:** Global access is permitted for testing and development purposes.

## 2. Mainnet Transition Risks

Transitioning to mainnet and supporting real financial assets (Mainnet XLM, USDC, etc.) fundamentally alters the regulatory classification of the platform.

Depending on the jurisdiction, prediction markets are frequently classified as:
- **Binary Options / Swaps:** In the US, the Commodity Futures Trading Commission (CFTC) regulates prediction markets. Unregistered markets offering event contracts to retail are generally prohibited.
- **Gambling/Sports Betting:** In many EU and Asian jurisdictions, betting on the outcome of esports (like Riot Games matches) requires strict licensing and consumer protection compliance.

## 3. Mandatory Compliance Boundaries

To operate legally and protect the protocol's developers and interfaces, the following boundaries **must** be implemented prior to any mainnet launch involving real-world value:

### A. Geoblocking (Frontend & API)
The Shōbu frontend interfaces and open-source agent endpoints must implement IP-based geoblocking to restrict access from high-risk jurisdictions.
- **Prohibited Jurisdictions:** United States (US), United Kingdom (UK), and any countries currently under comprehensive OFAC sanctions (e.g., Iran, North Korea, Syria).
- **Enforcement:** Vercel Edge Functions or Cloudflare Workers should be utilized to intercept and block geographic traffic before it hits the application logic.

### B. KYC/AML Integration (Token/Asset Level)
While smart contracts themselves are permissionless, the assets interacting with them do not have to be. Shōbu should leverage Stellar's built-in ecosystem features to enforce KYC:
- **Regulated Anchors:** Instead of using native XLM for betting, Shōbu should denominate pools in a fiat-backed stablecoin (like USDC) issued by a regulated Stellar Anchor. 
- **Stellar SEP-8 (Regulated Assets):** If necessary, the protocol can mandate the use of a custom betting token that utilizes Stellar's `SEP-8: Regulated Assets` standard. This requires the issuer to approve the transaction, acting as an automated compliance check ensuring both the sender and receiver have passed KYC checks through a centralized portal before bets are placed.

### C. Agent Liability and Non-Custodial Operations
The AI autonomous agents in Shōbu (such as the `shobu-pool-creator` and `shobu-settler`) execute state transitions but **must never take custody of user funds**.
- Agents should only act as data transmitters (oracles) and transaction initiators based on public API data (e.g., Riot Games API).
- Settlement logic must remain entirely on-chain, dictating that funds flow directly from the Escrow contract to the verified winning address, bypassing any agent-controlled wallets.

## 4. Disclaimer

*This document is a technical boundary roadmap and does not constitute legal advice. Operational deployment of Shōbu on mainnet requires review by qualified legal counsel specializing in DeFi, derivatives, and gaming law in the targeted operating jurisdictions.*
