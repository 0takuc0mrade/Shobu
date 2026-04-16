/**
 * Stellar Pool Reader — reads Soroban contract state to resolve
 * real player addresses and pool data for the frontend betting flow.
 *
 * Uses getLedgerEntries() to read instance storage without sending a tx.
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
}

// Simple in-memory cache to avoid repeated RPC calls
const poolCache = new Map<string, { data: StellarPoolData; fetchedAt: number }>()
const CACHE_TTL_MS = 30_000 // 30 seconds

/**
 * Reads a Stellar pool's on-chain state from the Soroban contract.
 * Returns player1/player2 addresses and pool metrics.
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
    const { Address, xdr, rpc } = await import('@stellar/stellar-sdk')
    const rpcServer = new rpc.Server(rpcUrl)

    // Read the contract instance storage which contains all Pool entries
    const instanceKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contractId).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )

    const entries = await rpcServer.getLedgerEntries(instanceKey as any)
    if (!entries.entries || entries.entries.length === 0) {
      console.warn('[stellar-pool-reader] No instance storage found')
      return null
    }

    const firstEntry = entries.entries[0] as any
    const dataEntry = xdr.LedgerEntryData.fromXDR(firstEntry.xdr, 'base64')
    const instanceVal = dataEntry.contractData().val()
    const storageMap = instanceVal.instance().storage()
    if (!storageMap) return null

    // Look for Pool(poolId) key in the storage map
    // Key format: ScVec([ScSymbol("Pool"), ScU32(poolId)])
    for (const mapEntry of storageMap) {
      const k = mapEntry.key()
      if (k.switch().name !== 'scvVec') continue
      const vec = k.vec()
      if (!vec || vec.length !== 2) continue
      if (vec[0].switch().name !== 'scvSymbol' || vec[0].sym().toString() !== 'Pool') continue
      if (vec[1].switch().name !== 'scvU32' || vec[1].u32() !== poolId) continue

      // Found the pool — parse the struct
      const val = mapEntry.val()
      if (val.switch().name !== 'scvMap') continue
      const fields = val.map()
      if (!fields) continue

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
          if (scVal.switch().name === 'scvAddress') {
            return Address.fromScVal(scVal).toString()
          }
        } catch {}
        return ''
      }

      const u128ToBI = (scVal: any): bigint => {
        try {
          if (scVal.switch().name === 'scvU128') {
            const parts = scVal.u128()
            return (BigInt(parts.hi().toString()) << 64n) | BigInt(parts.lo().toString())
          }
        } catch {}
        return 0n
      }

      const statusField = getField('status')
      let statusNum = 0
      if (statusField) {
        // Status is an enum stored as ScVec([ScSymbol("Open"|"Settled"|"Cancelled")])
        if (statusField.switch().name === 'scvVec') {
          const sv = statusField.vec()
          if (sv && sv.length >= 1 && sv[0].switch().name === 'scvSymbol') {
            const sym = sv[0].sym().toString()
            statusNum = sym === 'Open' ? 0 : sym === 'Settled' ? 1 : 2
          }
        }
      }

      const poolData: StellarPoolData = {
        id: poolId,
        player1: addressToString(getField('player1')!),
        player2: addressToString(getField('player2')!),
        status: statusNum,
        totalPot: u128ToBI(getField('total_pot')!),
        totalOnP1: u128ToBI(getField('total_on_p1')!),
        totalOnP2: u128ToBI(getField('total_on_p2')!),
        deadline: getField('deadline')?.switch().name === 'scvU64'
          ? Number(getField('deadline')!.u64().toString())
          : 0,
      }

      poolCache.set(cacheKey, { data: poolData, fetchedAt: Date.now() })
      return poolData
    }

    console.warn(`[stellar-pool-reader] Pool(${poolId}) not found in contract storage`)
    return null
  } catch (err) {
    console.error('[stellar-pool-reader] Error reading pool:', err)
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
