// ─── StarkZap Wallet Adapter ─────────────────────────────────────────
// Lazy-loaded to avoid pulling in the 742MB @hyperlane-xyz dep tree
// at compile time. All starkzap types are imported dynamically.
// ──────────────────────────────────────────────────────────────────────

import { RpcProvider } from "starknet";
import { web3Config } from "./web3-config";

const sharedRpcProvider = new RpcProvider({ nodeUrl: web3Config.rpcUrl });

function resolveChainIdValue(): string {
  return web3Config.chainId === "MAINNET" ? "MAINNET" : "SEPOLIA";
}

/**
 * A wallet adapter that wraps a starknet-react account for use with StarkZap.
 * Does NOT import `starkzap` at the top level — all starkzap-specific logic
 * is deferred to runtime via the lazy helpers.
 */
export class StarkzapAccountWallet {
  public readonly account: any;
  public readonly address: string;
  private readonly provider: RpcProvider;
  private readonly _chainId: string;

  constructor(account: any, provider: RpcProvider = sharedRpcProvider) {
    this.account = account;
    this.address = account.address;
    this.provider = provider;
    this._chainId = resolveChainIdValue();
  }

  async isDeployed(): Promise<boolean> {
    try {
      const classHash = await this.provider.getClassHashAt(this.address);
      return Boolean(classHash);
    } catch {
      return false;
    }
  }

  async ensureReady(_options?: any): Promise<void> {
    // Controller accounts handle deployment internally
  }

  async deploy(_options?: any): Promise<any> {
    throw new Error("Account deployment is not supported via StarkzapAccountWallet.");
  }

  async execute(calls: any[], _options?: any): Promise<any> {
    const result = await this.account.execute(calls);
    // Return a minimal tx-like object; the full Tx class is only needed 
    // if consumers actually use starkzap transaction tracking.
    return {
      transaction_hash: result.transaction_hash,
      provider: this.provider,
      chainId: this._chainId,
    };
  }

  async signMessage(typedData: any): Promise<any> {
    return this.account.signMessage(typedData);
  }

  async preflight(options: { calls: any[] }): Promise<{ ok: boolean; reason?: string }> {
    try {
      const estimator =
        this.account.estimateFee?.bind(this.account) ??
        this.account.estimateInvokeFee?.bind(this.account);
      if (!estimator) throw new Error("Account does not expose an estimate fee method.");
      await estimator(options.calls);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getAccount(): any {
    return this.account;
  }

  getProvider(): RpcProvider {
    return this.provider;
  }

  getChainId(): string {
    return this._chainId;
  }

  getFeeMode(): string {
    return "user_pays";
  }

  getClassHash(): string {
    return "0x0";
  }

  estimateFee(calls: any[]) {
    const estimator =
      this.account.estimateFee?.bind(this.account) ??
      this.account.estimateInvokeFee?.bind(this.account);
    if (!estimator) throw new Error("Account does not expose an estimate fee method.");
    return estimator(calls);
  }

  async disconnect(): Promise<void> {
    // Wallet lifecycle is managed by starknet-react/controller.
  }
}

export function createStarkzapWallet(account: any | null | undefined) {
  if (!account) return null;
  return new StarkzapAccountWallet(account);
}
