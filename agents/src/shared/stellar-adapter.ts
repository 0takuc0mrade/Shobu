import { Keypair, rpc as SorobanRpc, TransactionBuilder, Contract, xdr, Address, nativeToScVal } from "@stellar/stellar-sdk";
import { createHash } from "crypto";
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

    // Soroban transactions require simulation to calculate fees and footprints
    const preparedTx = await rpcServer.prepareTransaction(tx);

    // Sign with agent's keypair
    preparedTx.sign(this.keypair);

    console.log(`🚀 Broadcasting settle_pool for Pool ${poolId} to Soroban...`);
    
    // Send to Soroban RPC
    const response = await rpcServer.sendTransaction(preparedTx);
    
    if (response.status === "ERROR") {
      throw new Error(`Soroban Transaction Failed: ${JSON.stringify(response.errorResult)}`);
    }

    return response;
  }

  /**
   * Invokes the `cancel_pool` function on the Soroban Escrow contract.
   */
  async cancelPool(
    networkDetails: { networkPassphrase: string; rpcUrl: string },
    escrowContractId: string,
    poolId: number
  ) {
    const { rpcUrl, networkPassphrase } = networkDetails;
    
    const rpcServer = new SorobanRpc.Server(rpcUrl);
    
    const accountInfo = await rpcServer.getAccount(this.keypair.publicKey());
    
    const contract = new Contract(escrowContractId);
    
    const tx = new TransactionBuilder(accountInfo, {
      fee: "10000",
      networkPassphrase,
    })
      .addOperation(
        contract.call("cancel_pool", 
          xdr.ScVal.scvU32(poolId)
        )
      )
      .setTimeout(30)
      .build();

    const preparedTx = await rpcServer.prepareTransaction(tx);
    preparedTx.sign(this.keypair);

    console.log(`🚀 Broadcasting cancel_pool for Pool ${poolId} to Soroban...`);
    
    const response = await rpcServer.sendTransaction(preparedTx);
    
    if (response.status === "ERROR") {
      throw new Error(`Soroban Transaction Failed: ${JSON.stringify(response.errorResult)}`);
    }

    return response;
  }

  /**
   * Invokes the `create_pool` function on the Soroban Escrow contract.
   */
  async createPool(
    networkDetails: { networkPassphrase: string; rpcUrl: string },
    escrowContractId: string,
    tokenAddress: string,
    player1Address: string,
    player2Address: string,
    deadline: number
  ): Promise<{ hash: string; stellarPoolId: number | null }> {
    const { rpcUrl, networkPassphrase } = networkDetails;
    
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
        contract.call("create_pool", 
          new Address(tokenAddress).toScVal(),
          new Address(player1Address).toScVal(),
          new Address(player2Address).toScVal(),
          nativeToScVal(deadline, { type: 'u64' })
        )
      )
      .setTimeout(30)
      .build();

    // Soroban transactions require simulation to calculate fees and footprints
    const preparedTx = await rpcServer.prepareTransaction(tx);

    // Sign with agent's keypair
    preparedTx.sign(this.keypair);

    console.log(`🚀 Broadcasting create_pool to Soroban...`);
    
    // Send to Soroban RPC
    let response = await rpcServer.sendTransaction(preparedTx);
    
    if (response.status === "ERROR") {
      throw new Error(`Soroban Transaction Failed: ${JSON.stringify(response.errorResult)}`);
    }

    // Soroban transactions require waiting for inclusion and parsing the return value
    let stellarPoolId: number | null = null;

    if (response.status === "PENDING") {
       let txStatus: any;
       while (true) {
         await new Promise(resolve => setTimeout(resolve, 2000));
         txStatus = await rpcServer.getTransaction(response.hash);
         if (txStatus.status !== "NOT_FOUND") break;
       }
       if (txStatus && txStatus.status === "FAILED") {
         throw new Error(`Soroban Transaction Failed on-chain`);
       }
       // Parse the return value (u32 pool_id) from the transaction result
       if (txStatus && txStatus.status === "SUCCESS" && txStatus.returnValue) {
         try {
           const retVal = txStatus.returnValue;
           if (retVal.switch().name === 'scvU32') {
             stellarPoolId = retVal.u32();
             console.log(`[stellar] Pool ID returned from contract: ${stellarPoolId}`);
           }
         } catch (parseErr) {
           console.warn('[stellar] Could not parse pool ID from return value:', parseErr);
         }
       }
    }

    return { hash: response.hash, stellarPoolId };
  }

  /**
   * Instantly injects seed liquidity into both the YES and NO sides of
   * the prediction market to prevent a 0/0 cold-start on the frontend.
   *
   * Because the Soroban contract enforces "Cannot switch sides" (one
   * bettor can only back one outcome), we use TWO distinct keypairs:
   *   - Primary agent keypair → bets YES (predicted_winner = player1)
   *   - Derived ghost keypair → bets NO  (predicted_winner = player2)
   *
   * The derived keypair is SHA-256(agent_secret_raw). Fund it once with
   * the pool token and it will work for every future ghost seed.
   */
  async ghostSeedStellarPool(
    networkDetails: { networkPassphrase: string; rpcUrl: string },
    escrowContractId: string,
    poolId: number,
    yesAddress: string,
    noAddress: string,
    seedAmount: string
  ) {
    const { rpcUrl, networkPassphrase } = networkDetails;
    
    // Parse seed amount to BigInt
    let seedValue;
    try {
      seedValue = BigInt(seedAmount);
    } catch {
      seedValue = 5000000n; // fallback to 0.5
    }

    // Derive a second keypair for the NO side from the agent's raw secret
    const ghostSeedBytes = createHash('sha256')
      .update(this.keypair.rawSecretKey())
      .digest();
    const ghostKeypair = Keypair.fromRawEd25519Seed(ghostSeedBytes);
    console.log(`🌱 Ghost Seeder #2 (NO side): ${ghostKeypair.publicKey()}`);

    const rpcServer = new SorobanRpc.Server(rpcUrl);
    const contract = new Contract(escrowContractId);

    // ── YES bet (primary agent keypair) ──────────────────────────────
    console.log(`🌱 Injecting Ghost Seed (YES) for Soroban Pool #${poolId}...`);
    
    const accountInfoYes = await rpcServer.getAccount(this.keypair.publicKey());
    const txYes = new TransactionBuilder(accountInfoYes, { fee: "10000", networkPassphrase })
      .addOperation(
        contract.call("place_bet",
          xdr.ScVal.scvU32(poolId),
          new Address(this.keypair.publicKey()).toScVal(),
          new Address(yesAddress).toScVal(),
          nativeToScVal(seedValue, { type: 'u128' })
        )
      )
      .setTimeout(30)
      .build();

    const preparedTxYes = await rpcServer.prepareTransaction(txYes);
    preparedTxYes.sign(this.keypair);

    const responseYes = await rpcServer.sendTransaction(preparedTxYes);
    if (responseYes.status === "ERROR") {
      console.error(`⚠️ Soroban Ghost Seeding (YES) Failed: ${JSON.stringify(responseYes.errorResult)}`);
      return null;
    }
    
    // Wait for YES to be included before submitting NO
    if (responseYes.status === "PENDING") {
       while (true) {
         await new Promise(resolve => setTimeout(resolve, 2000));
         let txStatus = await rpcServer.getTransaction(responseYes.hash);
         if (txStatus.status !== "NOT_FOUND") break;
       }
    }

    // ── NO bet (derived ghost keypair) ───────────────────────────────
    console.log(`🌱 Injecting Ghost Seed (NO) for Soroban Pool #${poolId}...`);

    const accountInfoNo = await rpcServer.getAccount(ghostKeypair.publicKey());
    const txNo = new TransactionBuilder(accountInfoNo, { fee: "10000", networkPassphrase })
      .addOperation(
        contract.call("place_bet",
          xdr.ScVal.scvU32(poolId),
          new Address(ghostKeypair.publicKey()).toScVal(),
          new Address(noAddress).toScVal(),
          nativeToScVal(seedValue, { type: 'u128' })
        )
      )
      .setTimeout(30)
      .build();

    const preparedTxNo = await rpcServer.prepareTransaction(txNo);
    preparedTxNo.sign(ghostKeypair);

    const responseNo = await rpcServer.sendTransaction(preparedTxNo);
    if (responseNo.status === "ERROR") {
      console.error(`⚠️ Soroban Ghost Seeding (NO) Failed: ${JSON.stringify(responseNo.errorResult)}`);
      return null;
    }

    console.log(`✅ Ghost Seed complete for Pool #${poolId} — YES tx: ${responseYes.hash}, NO tx: ${responseNo.hash}`);
    return responseNo.hash;
  }
}
