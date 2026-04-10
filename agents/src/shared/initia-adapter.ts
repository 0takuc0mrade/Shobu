import { RESTClient, Wallet, MsgExecute } from "@initia/initia.js";

export class InitiaAgentAdapter {
  private rest: RESTClient;
  private wallet: Wallet;

  constructor(rpcUrl: string, privateKeyHex: string) {
    this.rest = new RESTClient(rpcUrl);
    
    // In a real integration, we'd import RawKey from @initia/initia.js
    // and initialize the wallet properly.
    const { RawKey } = require("@initia/initia.js");
    const key = new RawKey(Buffer.from(privateKeyHex, "hex"));
    
    this.wallet = new Wallet(this.rest, key);
    
    console.log(`🤖 Initia Agent Initialized: ${this.wallet.key.accAddress}`);
  }

  /**
   * Invokes the `settle_pool` function on the Initia Escrow module/contract.
   */
  async settlePool(
    escrowContractAddress: string,
    poolId: number,
    winnerAddress: string
  ) {
    console.log(`🚀 Broadcasting settle_pool for Pool ${poolId} to Initia Appchain...`);
    
    // Example for Initia Move Module Execution
    const msg = new MsgExecute(
      this.wallet.key.accAddress,
      escrowContractAddress,  // Module address
      "escrow",               // Module name
      "settle_pool",          // Function name
      [],                     // Type arguments
      [poolId.toString(), winnerAddress] // Arguments
    );

    const tx = await this.wallet.createAndSignTx({
      msgs: [msg],
    });

    const result = await this.rest.tx.broadcast(tx);
    
    if ('code' in result && result.code !== 0) {
      throw new Error(`Initia Tx Failed: ${result.raw_log}`);
    }

    return result;
  }
}
