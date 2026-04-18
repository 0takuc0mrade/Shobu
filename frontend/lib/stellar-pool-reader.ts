/**
 * Stellar Pool Reader — reads Soroban contract state to resolve
 * real player addresses and pool data for the frontend betting flow.
 *
 * After the persistent-storage migration, Pool(n) and Bet(poolId, addr)
 * are stored in persistent contract data entries. We read them directly
 * using getLedgerEntries() with the persistent durability flag — one
 * targeted RPC call per pool instead of downloading the entire instance map.
 */

export interface StellarPoolData {
  id: number
  player1: string
  player2: string
  status: number // 0=Open, 1=Settled, 2=Cancelled
  totalPot: bigint
  totalOnP1: bigint
  totalOnP2: bigint
  deadline: number
  winningPlayer?: string
}

// Simple in-memory cache to avoid repeated RPC calls
const poolCache = new Map<string, { data: StellarPoolData; fetchedAt: number }>()
const CACHE_TTL_MS = 3_000 // 3 seconds

export function clearPoolCache() {
  poolCache.clear()
}

/**
 * Build the ScVal key for DataKey::Pool(poolId).
 * Soroban encodes enums as: ScVec([ScSymbol("Pool"), ScU32(poolId)])
 */
function buildPoolScVal(xdr: any, poolId: number) {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Pool"),
    xdr.ScVal.scvU32(poolId),
  ])
}

/**
 * Build the ScVal key for DataKey::Bet(poolId, bettor).
 * Soroban encodes: ScVec([ScSymbol("Bet"), ScU32(poolId), ScAddress(bettor)])
 */
function buildBetScVal(xdr: any, Address: any, poolId: number, bettorAddress: string) {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Bet"),
    xdr.ScVal.scvU32(poolId),
    new Address(bettorAddress).toScVal(),
  ])
}

/**
 * Reads a Stellar pool's on-chain state from the Soroban contract.
 * Returns player1/player2 addresses and pool metrics.
 *
 * Post-migration: reads persistent contract data entries directly.
 */
export async function getStellarPool(
  contractId: string,
  poolId: number,
  rpcUrl = 'https://soroban-testnet.stellar.org'
): Promise<StellarPoolData | null> {
  const cacheKey = `${contractId}:${poolId}`
  const cached = poolCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const { Address, xdr, rpc, scValToNative } = await import('@stellar/stellar-sdk')
    const rpcServer = new rpc.Server(rpcUrl)

    // Build a persistent LedgerKey for Pool(poolId)
    const poolKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contractId).toScAddress(),
        key: buildPoolScVal(xdr, poolId),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )

    console.log(`[stellar-pool-reader] Fetching persistent Pool(${poolId}) for ${contractId}`)
    const entries = await rpcServer.getLedgerEntries(poolKey as any)
    if (!entries.entries || entries.entries.length === 0) {
      console.warn(`[stellar-pool-reader] Pool(${poolId}) not found in persistent storage`)
      return null
    }

    const firstEntry = entries.entries[0] as any
    const dataEntry = firstEntry.val ? firstEntry.val : xdr.LedgerEntryData.fromXDR(firstEntry.xdr || firstEntry.extXdr, 'base64')
    const poolVal = dataEntry.contractData().val()

    if (poolVal.switch().name !== 'scvMap') {
      console.warn(`[stellar-pool-reader] Pool(${poolId}) value is not a map!`)
      return null
    }

    const fields = poolVal.map()
    if (!fields) return null

    const getField = (name: string) => {
      for (const f of fields) {
        if (f.key().switch().name === 'scvSymbol' && f.key().sym().toString() === name) {
          return f.val()
        }
      }
      return null
    }

    const addressToString = (scVal: any): string => {
      try {
        if (scVal && scVal.switch().name === 'scvAddress') {
          return Address.fromScVal(scVal).toString()
        }
      } catch {}
      return ''
    }

    const u128ToBI = (scVal: any): bigint => {
      try {
        if (scVal) return BigInt(scValToNative(scVal).toString())
      } catch (e) {
        console.error('[stellar-pool-reader] Failed to parse u128:', e)
      }
      return 0n
    }

    const statusField = getField('status')
    let statusNum = 0
    if (statusField) {
      if (statusField.switch().name === 'scvVec') {
        const sv = statusField.vec()
        if (sv && sv.length >= 1 && sv[0].switch().name === 'scvSymbol') {
          const sym = sv[0].sym().toString()
          statusNum = sym === 'Open' ? 0 : sym === 'Settled' ? 1 : 2
        }
      } else if (statusField.switch().name === 'scvU32') {
        statusNum = statusField.u32()
      }
    }

    // Handle Option<Address> for winning_player
    let winningPlayer = ''
    const wpField = getField('winning_player')
    if (wpField) {
      if (wpField.switch().name === 'scvAddress') {
        winningPlayer = addressToString(wpField)
      } else if (wpField.switch().name === 'scvVec') {
        const vec = wpField.vec()
        if (vec && vec.length === 2) {
          winningPlayer = addressToString(vec[1])
        }
      }
    }

    const poolData: StellarPoolData = {
      id: poolId,
      player1: addressToString(getField('player1') || getField('player_1')),
      player2: addressToString(getField('player2') || getField('player_2')),
      winningPlayer,
      status: statusNum,
      totalPot: u128ToBI(getField('total_pot')!),
      totalOnP1: u128ToBI(getField('total_on_p1')!),
      totalOnP2: u128ToBI(getField('total_on_p2')!),
      deadline: getField('deadline')?.switch().name === 'scvU64'
        ? Number(getField('deadline')!.u64().toString())
        : 0,
    }

    console.log(`[stellar-pool-reader] Successfully parsed Pool(${poolId}) from persistent storage`)
    poolCache.set(cacheKey, { data: poolData, fetchedAt: Date.now() })
    return poolData

  } catch (err) {
    console.error(`[stellar-pool-reader] Caught exception reading pool ${poolId}:`, err)
    return null
  }
}

/**
 * Read a bet entry from persistent storage.
 */
export async function getStellarBet(
  contractId: string,
  poolId: number,
  bettorAddress: string,
  rpcUrl = 'https://soroban-testnet.stellar.org'
): Promise<{ amount: bigint; predictedWinner: string; claimed: boolean } | null> {
  try {
    const { Address, xdr, rpc, scValToNative } = await import('@stellar/stellar-sdk')
    const rpcServer = new rpc.Server(rpcUrl)

    const betKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contractId).toScAddress(),
        key: buildBetScVal(xdr, Address, poolId, bettorAddress),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )

    const entries = await rpcServer.getLedgerEntries(betKey as any)
    if (!entries.entries || entries.entries.length === 0) return null

    const firstEntry = entries.entries[0] as any
    const dataEntry = firstEntry.val ? firstEntry.val : xdr.LedgerEntryData.fromXDR(firstEntry.xdr || firstEntry.extXdr, 'base64')
    const betVal = dataEntry.contractData().val()

    if (betVal.switch().name !== 'scvMap') return null

    const fields = betVal.map()
    if (!fields) return null

    const getField = (name: string) => {
      for (const f of fields) {
        if (f.key().switch().name === 'scvSymbol' && f.key().sym().toString() === name) {
          return f.val()
        }
      }
      return null
    }

    return {
      amount: (() => {
        const v = getField('amount')
        if (!v) return 0n
        try { return BigInt(scValToNative(v).toString()) } catch { return 0n }
      })(),
      predictedWinner: (() => {
        const v = getField('predicted_winner')
        if (!v) return ''
        try { return Address.fromScVal(v).toString() } catch { return '' }
      })(),
      claimed: (() => {
        const v = getField('claimed')
        if (!v) return false
        try { return scValToNative(v) === true } catch { return false }
      })(),
    }
  } catch {
    return null
  }
}

/**
 * Fetches the Stellar pool ID map from the static JSON file.
 */
export async function fetchStellarPoolMap(): Promise<Record<string, number>> {
  try {
    const res = await fetch('/stellar-pool-map.json')
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}
