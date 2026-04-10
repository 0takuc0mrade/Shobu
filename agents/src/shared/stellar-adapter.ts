import { Keypair } from "@stellar/stellar-sdk";
import { Mppx } from "mppx/client";
import { stellar } from "@stellar/mpp/charge/client";

export class StellarAgentAdapter {
  private keypair: Keypair;

  constructor(secretKey: string) {
    // The Agent's dedicated Stellar wallet for paying micro-fees
    this.keypair = Keypair.fromSecret(secretKey);
    console.log(`🤖 Stellar Agent Initialized: ${this.keypair.publicKey()}`);

    // Initialize the MPP client to auto-handle 402 Payment Required responses
    // This polyfills the global fetch to automatically negotiate machine payments!
    Mppx.create({
      methods: [
        stellar.charge({
          keypair: this.keypair,
          mode: "pull", // The agent signs the auth entry, the server broadcasts
          onProgress(event) {
            console.log(`[MPP Micro-fee] ${event.type}`, event);
          },
        }),
      ],
    });
  }

  /**
   * Example: Agent calling a paid service (like an external AI or Oracle node)
   * The fetch is intercepted by Mppx, pays the 0.5 XLM natively, and returns the data.
   */
  async executePaidSettlementFetch(endpoint: string, payload: any) {
    try {
      // Because we initialized Mppx, this standard fetch will automatically 
      // handle the 402 status code, sign the transaction, and retry!
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Execution failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Agent payment flow failed:", error);
      throw error;
    }
  }

  /**
   * Invokes the `settle_pool` function on the Soroban Escrow contract.
   */
  async settlePool(
    networkDetails: { networkPassphrase: string; rpcUrl: string },
    escrowContractId: string,
    poolId: number,
    winnerAddress: string
  ) {
    const { rpcUrl, networkPassphrase } = networkDetails;
    
    // Using Server from @stellar/stellar-sdk
    const { SorobanRpc, TransactionBuilder, Contract, xdr, Address } = require('@stellar/stellar-sdk');
    const rpcServer = new SorobanRpc.Server(rpcUrl);
    
    // Get account info for the agent
    const accountInfo = await rpcServer.getAccount(this.keypair.publicKey());
    
    const contract = new Contract(escrowContractId);
    
    // Build the transaction
    const tx = new TransactionBuilder(accountInfo, {
      fee: "10000",
      networkPassphrase,
    })
      .addOperation(
        contract.call("settle_pool", 
          xdr.ScVal.scvU32(poolId),
          new Address(winnerAddress).toScVal()
        )
      )
      .setTimeout(30)
      .build();

    // Sign with agent's keypair
    tx.sign(this.keypair);

    console.log(`🚀 Broadcasting settle_pool for Pool ${poolId} to Soroban...`);
    
    // Send to Soroban RPC
    const response = await rpcServer.sendTransaction(tx);
    
    if (response.status === "ERROR") {
      throw new Error(`Soroban Transaction Failed: ${response.errorResultXdr}`);
    }

    return response;
  }
}
