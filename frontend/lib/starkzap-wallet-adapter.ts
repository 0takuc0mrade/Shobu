import { BaseWallet, ChainId, Tx, type FeeMode } from "starkzap";
import type {
  Address,
  DeployOptions,
  EnsureReadyOptions,
  ExecuteOptions,
  PreflightOptions,
  PreflightResult,
} from "starkzap";
import { RpcProvider } from "starknet";
import { web3Config } from "./web3-config";

const sharedRpcProvider = new RpcProvider({ nodeUrl: web3Config.rpcUrl });

function resolveChainId(): ChainId {
  if (web3Config.chainId === "MAINNET") return ChainId.MAINNET;
  return ChainId.SEPOLIA;
}

export class StarkzapAccountWallet extends BaseWallet {
  public readonly account: any;
  private readonly provider: RpcProvider;
  private readonly chainId: ChainId;

  constructor(account: any, provider: RpcProvider = sharedRpcProvider) {
    super(account.address as Address, undefined);
    this.account = account;
    this.provider = provider;
    this.chainId = resolveChainId();
  }

  async isDeployed(): Promise<boolean> {
    try {
      const classHash = await this.provider.getClassHashAt(this.address);
      return Boolean(classHash);
    } catch {
      return false;
    }
  }

  async ensureReady(_options?: EnsureReadyOptions): Promise<void> {
    // Controller accounts handle deployment internally; avoid hard failures here.
  }

  async deploy(_options?: DeployOptions): Promise<Tx> {
    throw new Error("Account deployment is not supported via StarkzapAccountWallet.");
  }

  async execute(calls: any[], _options?: ExecuteOptions): Promise<Tx> {
    const result = await this.account.execute(calls);
    return new Tx(result.transaction_hash, this.provider as any, this.chainId);
  }

  async signMessage(typedData: any): Promise<any> {
    return this.account.signMessage(typedData);
  }

  async preflight(options: PreflightOptions): Promise<PreflightResult> {
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

  getChainId(): ChainId {
    return this.chainId;
  }

  getFeeMode(): FeeMode {
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
