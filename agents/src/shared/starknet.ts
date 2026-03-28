import { RpcProvider, type WalletAccount, type Call } from 'starknet'
import SessionProvider from '@cartridge/controller/session/node'
import { getConfig, type Config } from './config.js'
import { ENTRYPOINTS } from './constants.js'

let _provider: RpcProvider | null = null
let _sessionProvider: InstanceType<typeof SessionProvider> | null = null
let _account: WalletAccount | null = null

// -----------------------------------------------------------------------
// RPC provider (singleton)
// -----------------------------------------------------------------------

export function getProvider(): RpcProvider {
  if (_provider) return _provider
  const { STARKNET_RPC_URL } = getConfig()
  _provider = new RpcProvider({ nodeUrl: STARKNET_RPC_URL })
  return _provider
}

// -----------------------------------------------------------------------
// Session policies for the Escrow contract
// -----------------------------------------------------------------------

function createSessionPolicies(escrowAddress: string) {
  return {
    contracts: {
      [escrowAddress]: {
        methods: [
          { name: 'Create Pool', entrypoint: ENTRYPOINTS.createPool },
          { name: 'Create EGS Pool', entrypoint: ENTRYPOINTS.createEgsPool },
          { name: 'Create Budokan Pool', entrypoint: ENTRYPOINTS.createBudokanPool },
          { name: 'Create Web2 Pool', entrypoint: ENTRYPOINTS.createWeb2Pool },
          { name: 'Settle Pool', entrypoint: ENTRYPOINTS.settlePool },
          { name: 'Settle Web2 Pool', entrypoint: ENTRYPOINTS.settleWeb2Pool },
          { name: 'Cancel Pool', entrypoint: ENTRYPOINTS.cancelPool },
          { name: 'Set Pool Manager', entrypoint: ENTRYPOINTS.setPoolManager },
          { name: 'Configure Web2 Oracle', entrypoint: ENTRYPOINTS.configureWeb2Oracle },
        ],
      },
    },
  }
}

// -----------------------------------------------------------------------
// Session provider (singleton)
// -----------------------------------------------------------------------

function getSessionProvider(): InstanceType<typeof SessionProvider> {
  if (_sessionProvider) return _sessionProvider
  const config = getConfig()
  _sessionProvider = new SessionProvider({
    rpc: config.STARKNET_RPC_URL,
    chainId: config.CHAIN_ID,
    policies: createSessionPolicies(config.ESCROW_ADDRESS),
    basePath: config.SESSION_BASE_PATH,
    ...(config.KEYCHAIN_URL ? { keychainUrl: config.KEYCHAIN_URL } : {}),
  })
  return _sessionProvider
}

// -----------------------------------------------------------------------
// Session connection
// -----------------------------------------------------------------------

function isSessionError(message: string): boolean {
  const patterns = [
    'session',
    'expired',
    'unauthorized',
    'invalid signature',
    'account validation failed',
  ]
  const lower = message.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

/**
 * Initialize the Cartridge Controller session.
 *
 * On first run, set `ALLOW_INTERACTIVE_AUTH=true` to open a browser for
 * authorization. After that, sessions are persisted to `SESSION_BASE_PATH`
 * and reused automatically.
 */
export async function initSession(): Promise<WalletAccount> {
  const config = getConfig()
  const provider = getSessionProvider()

  // Try existing session
  const existing = await provider.probe()
  if (existing?.address) {
    console.log('[cartridge] Reusing persisted Controller session')
    _account = existing
    return existing
  }

  // No session — need interactive auth
  if (!config.ALLOW_INTERACTIVE_AUTH) {
    throw new Error(
      `No persisted Cartridge session found at ${config.SESSION_BASE_PATH}. ` +
        'Run once with ALLOW_INTERACTIVE_AUTH=true to bootstrap the session.'
    )
  }

  console.log(
    '[cartridge] No persisted session — waiting for interactive Controller authorization'
  )
  const connected = await provider.connect()
  if (!connected?.address) {
    throw new Error(
      'Session connection was not completed. Authorize in the browser and rerun.'
    )
  }

  console.log(`[cartridge] Session connected: ${connected.address}`)
  _account = connected
  return connected
}

/**
 * Get the session account (must call `initSession()` first).
 */
export function getSessionAccount(): WalletAccount {
  if (!_account) {
    throw new Error(
      'Session not initialized. Call initSession() before getSessionAccount().'
    )
  }
  return _account
}

/**
 * Refresh the session if the current one has expired or is invalid.
 */
export async function refreshSession(): Promise<WalletAccount> {
  _account = null
  return initSession()
}

/**
 * Execute one or more Starknet calls via the Cartridge session account
 * and wait for confirmation. Automatically retries once on session errors.
 */
export async function executeAndWait(
  calls: Array<{
    contractAddress: string
    entrypoint: string
    calldata: string[]
  }>
): Promise<string> {
  const provider = getProvider()

  const doExecute = async () => {
    const account = getSessionAccount()
    const { transaction_hash } = await account.execute(calls as Call[])
    await provider.waitForTransaction(transaction_hash)
    return transaction_hash
  }

  try {
    return await doExecute()
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    if (isSessionError(msg)) {
      console.log('[cartridge] Session error detected, refreshing...')
      await refreshSession()
      return await doExecute()
    }
    throw err
  }
}

/**
 * Normalize a hex address to lowercase with 0x prefix.
 */
export function normalizeAddress(value: string | undefined | null): string {
  if (!value) return ''
  const str = String(value)
  const hex = str.startsWith('0x') ? str : `0x${str}`
  return hex.toLowerCase()
}

// -----------------------------------------------------------------------
// Transaction simulation (dry-run without spending gas)
// -----------------------------------------------------------------------

/**
 * Simulate a transaction to check if it would succeed.
 * Returns `true` if the call would succeed, `false` if it would revert.
 * This is a free RPC call — no gas is spent.
 */
export async function simulateCall(
  calls: Array<{
    contractAddress: string
    entrypoint: string
    calldata: string[]
  }>
): Promise<boolean> {
  try {
    const account = getSessionAccount()
    await account.estimateInvokeFee(calls as Call[])
    return true
  } catch {
    return false
  }
}

// -----------------------------------------------------------------------
// Settlement cooldown (prevents spamming failed pools)
// -----------------------------------------------------------------------

const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Tracks pools that recently failed simulation/settlement and prevents
 * retrying them until the cooldown period expires.
 */
export class SettlementCooldown {
  private failures = new Map<number, number>() // poolId → timestamp of last failure
  private cooldownMs: number

  constructor(cooldownMs: number = DEFAULT_COOLDOWN_MS) {
    this.cooldownMs = cooldownMs
  }

  /** Mark a pool as recently failed. */
  markFailed(poolId: number): void {
    this.failures.set(poolId, Date.now())
  }

  /** Check if a pool is still in cooldown. */
  isOnCooldown(poolId: number): boolean {
    const failedAt = this.failures.get(poolId)
    if (!failedAt) return false
    if (Date.now() - failedAt > this.cooldownMs) {
      this.failures.delete(poolId)
      return false
    }
    return true
  }

  /** Remove a pool from cooldown (e.g. after successful settlement). */
  clear(poolId: number): void {
    this.failures.delete(poolId)
  }

  /** Number of pools currently on cooldown. */
  get size(): number {
    return this.failures.size
  }
}
