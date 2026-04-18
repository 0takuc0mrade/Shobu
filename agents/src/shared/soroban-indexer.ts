/**
 * Soroban Pool Indexer — reads Stellar/Soroban contract state directly
 * via RPC, providing a parallel data pipeline to the Starknet Torii indexer.
 *
 * After the persistent-storage migration, Pool(n) and Bet(poolId, address)
 * live in persistent contract data entries. We read them individually using
 * `getLedgerEntries()` with the correct durability flag.
 */

import {
  rpc as SorobanRpc,
  Address,
  xdr,
  nativeToScVal,
  scValToNative,
  Contract,
} from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Types (mirroring the BettingPoolModel shape from torii.ts)
// ---------------------------------------------------------------------------

export interface StellarPool {
  pool_id: number;
  player1: string;
  player2: string;
  status: number; // 0=Open, 1=Settled, 2=Cancelled
  total_pot: string;
  total_on_p1: string;
  total_on_p2: string;
  deadline: number;
  winning_player: string;
  token: string;
}

export interface StellarBet {
  pool_id: number;
  bettor: string;
  predicted_winner: string;
  amount: string;
  claimed: boolean;
}

// ---------------------------------------------------------------------------
// In-memory cache with TTL
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const poolCache = new Map<string, CacheEntry<StellarPool>>();
const poolCountCache: CacheEntry<number> = { data: 0, fetchedAt: 0 };
const CACHE_TTL_MS = 10_000; // 10 seconds

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getConfig(): { rpcUrl: string; contractId: string } {
  return {
    rpcUrl: process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
    contractId:
      process.env.STELLAR_ESCROW_CONTRACT_ID ||
      process.env.NEXT_PUBLIC_STELLAR_ESCROW_ADDRESS ||
      "CAVMUYF3S54QSPSNWN5LUI3YEPRFIRPFWSULNIWBSHA4IPPPGSSCCOPB",
  };
}

// ---------------------------------------------------------------------------
// ScVal Builders
//
// The contract's DataKey enum is:
//   Admin, Manager, PoolCounter, Pool(u32), Bet(u32, Address), ProtocolFee(Address)
//
// Soroban encodes enums as: ScVec([ScSymbol("VariantName"), ...fields])
// Unit variants are just: ScVec([ScSymbol("VariantName")])
// ---------------------------------------------------------------------------

function buildPoolCounterKey(): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("PoolCounter")]);
}

function buildPoolKey(poolId: number): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Pool"),
    xdr.ScVal.scvU32(poolId),
  ]);
}

function buildBetKey(poolId: number, bettor: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Bet"),
    xdr.ScVal.scvU32(poolId),
    new Address(bettor).toScVal(),
  ]);
}

// ---------------------------------------------------------------------------
// Low-level RPC reader
// ---------------------------------------------------------------------------

async function readContractData(
  rpcServer: SorobanRpc.Server,
  contractId: string,
  key: xdr.ScVal,
  durability: "instance" | "persistent"
): Promise<xdr.ScVal | null> {
  const contractAddress = new Address(contractId);
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractAddress.toScAddress(),
      key,
      durability:
        durability === "persistent"
          ? xdr.ContractDataDurability.persistent()
          : xdr.ContractDataDurability.temporary(),
    })
  );

  try {
    const entries = await rpcServer.getLedgerEntries(ledgerKey as any);
    if (!entries.entries || entries.entries.length === 0) return null;

    const entry = entries.entries[0] as any;
    const dataEntry = entry.val
      ? entry.val
      : xdr.LedgerEntryData.fromXDR(entry.xdr || entry.extXdr, "base64");

    return dataEntry.contractData().val();
  } catch (err) {
    console.error(`[soroban-indexer] readContractData error:`, err);
    return null;
  }
}

async function readInstanceData(
  rpcServer: SorobanRpc.Server,
  contractId: string,
  key: xdr.ScVal
): Promise<xdr.ScVal | null> {
  // Instance storage is read by fetching the full instance and scanning
  const contractAddress = new Address(contractId);
  const instanceKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractAddress.toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );

  try {
    const entries = await rpcServer.getLedgerEntries(instanceKey as any);
    if (!entries.entries || entries.entries.length === 0) return null;

    const entry = entries.entries[0] as any;
    const dataEntry = entry.val
      ? entry.val
      : xdr.LedgerEntryData.fromXDR(entry.xdr || entry.extXdr, "base64");

    const instanceVal = dataEntry.contractData().val();
    const storageMap = instanceVal.instance().storage();
    if (!storageMap) return null;

    // Search for the key in the instance map
    const keyXdr = key.toXDR("base64");
    for (const mapEntry of storageMap) {
      if (mapEntry.key().toXDR("base64") === keyXdr) {
        return mapEntry.val();
      }
    }
    return null;
  } catch (err) {
    console.error(`[soroban-indexer] readInstanceData error:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parsePoolFromScVal(scVal: xdr.ScVal, poolId: number): StellarPool | null {
  try {
    if (scVal.switch().name !== "scvMap") return null;

    const fields = scVal.map();
    if (!fields) return null;

    const getField = (name: string): xdr.ScVal | null => {
      for (const f of fields) {
        if (
          f.key().switch().name === "scvSymbol" &&
          f.key().sym().toString() === name
        ) {
          return f.val();
        }
      }
      return null;
    };

    const addressToString = (v: xdr.ScVal | null): string => {
      if (!v) return "";
      try {
        if (v.switch().name === "scvAddress") {
          return Address.fromScVal(v).toString();
        }
      } catch {}
      return "";
    };

    const u128ToBigInt = (v: xdr.ScVal | null): string => {
      if (!v) return "0";
      try {
        return BigInt(scValToNative(v).toString()).toString();
      } catch {
        return "0";
      }
    };

    const statusField = getField("status");
    let statusNum = 0;
    if (statusField) {
      if (statusField.switch().name === "scvVec") {
        const sv = statusField.vec();
        if (sv && sv.length >= 1 && sv[0].switch().name === "scvSymbol") {
          const sym = sv[0].sym().toString();
          statusNum = sym === "Open" ? 0 : sym === "Settled" ? 1 : 2;
        }
      } else if (statusField.switch().name === "scvU32") {
        statusNum = statusField.u32();
      }
    }

    // Handle Option<Address> for winning_player
    let winningPlayer = "";
    const wpField = getField("winning_player");
    if (wpField) {
      if (wpField.switch().name === "scvAddress") {
        winningPlayer = addressToString(wpField);
      } else if (wpField.switch().name === "scvVec") {
        // Option::Some is encoded as ScVec([ScSymbol("Some"), val])
        const vec = wpField.vec();
        if (vec && vec.length === 2) {
          winningPlayer = addressToString(vec[1]);
        }
      }
    }

    return {
      pool_id: poolId,
      player1: addressToString(getField("player1") || getField("player_1")),
      player2: addressToString(getField("player2") || getField("player_2")),
      status: statusNum,
      total_pot: u128ToBigInt(getField("total_pot")),
      total_on_p1: u128ToBigInt(getField("total_on_p1")),
      total_on_p2: u128ToBigInt(getField("total_on_p2")),
      deadline: (() => {
        const dl = getField("deadline");
        if (!dl) return 0;
        try {
          if (dl.switch().name === "scvU64") return Number(dl.u64().toString());
          return Number(scValToNative(dl).toString());
        } catch {
          return 0;
        }
      })(),
      winning_player: winningPlayer,
      token: addressToString(getField("token")),
    };
  } catch (err) {
    console.error(`[soroban-indexer] parsePoolFromScVal error:`, err);
    return null;
  }
}

function parseBetFromScVal(
  scVal: xdr.ScVal,
  poolId: number,
  bettor: string
): StellarBet | null {
  try {
    if (scVal.switch().name !== "scvMap") return null;

    const fields = scVal.map();
    if (!fields) return null;

    const getField = (name: string): xdr.ScVal | null => {
      for (const f of fields) {
        if (
          f.key().switch().name === "scvSymbol" &&
          f.key().sym().toString() === name
        ) {
          return f.val();
        }
      }
      return null;
    };

    const addressToString = (v: xdr.ScVal | null): string => {
      if (!v) return "";
      try {
        return Address.fromScVal(v).toString();
      } catch {}
      return "";
    };

    return {
      pool_id: poolId,
      bettor,
      predicted_winner: addressToString(getField("predicted_winner")),
      amount: (() => {
        const v = getField("amount");
        if (!v) return "0";
        try {
          return BigInt(scValToNative(v).toString()).toString();
        } catch {
          return "0";
        }
      })(),
      claimed: (() => {
        const v = getField("claimed");
        if (!v) return false;
        try {
          return scValToNative(v) === true;
        } catch {
          return false;
        }
      })(),
    };
  } catch (err) {
    console.error(`[soroban-indexer] parseBetFromScVal error:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — matches the Torii interface shape
// ---------------------------------------------------------------------------

/**
 * Read the pool counter from instance storage.
 */
export async function fetchStellarPoolCount(): Promise<number> {
  if (Date.now() - poolCountCache.fetchedAt < CACHE_TTL_MS) {
    return poolCountCache.data;
  }

  const { rpcUrl, contractId } = getConfig();
  const rpcServer = new SorobanRpc.Server(rpcUrl);

  const val = await readInstanceData(
    rpcServer,
    contractId,
    buildPoolCounterKey()
  );

  if (!val) return poolCountCache.data;

  try {
    const count = scValToNative(val);
    poolCountCache.data = Number(count);
    poolCountCache.fetchedAt = Date.now();
    return poolCountCache.data;
  } catch {
    return 0;
  }
}

/**
 * Fetch a single Stellar pool by its on-chain ID.
 */
export async function fetchStellarPoolById(
  poolId: number
): Promise<StellarPool | null> {
  const cacheKey = `pool:${poolId}`;
  const cached = poolCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const { rpcUrl, contractId } = getConfig();
  const rpcServer = new SorobanRpc.Server(rpcUrl);

  const val = await readContractData(
    rpcServer,
    contractId,
    buildPoolKey(poolId),
    "persistent"
  );

  if (!val) return null;

  const pool = parsePoolFromScVal(val, poolId);
  if (pool) {
    poolCache.set(cacheKey, { data: pool, fetchedAt: Date.now() });
  }
  return pool;
}

/**
 * Fetch all Stellar pools (iterates 1..poolCounter).
 */
async function fetchAllStellarPools(): Promise<StellarPool[]> {
  const count = await fetchStellarPoolCount();
  if (count === 0) return [];

  const pools: StellarPool[] = [];
  // Fetch in parallel batches to avoid overwhelming RPC
  const BATCH_SIZE = 5;
  for (let i = 1; i <= count; i += BATCH_SIZE) {
    const batch = Array.from(
      { length: Math.min(BATCH_SIZE, count - i + 1) },
      (_, j) => fetchStellarPoolById(i + j)
    );
    const results = await Promise.all(batch);
    for (const p of results) {
      if (p) pools.push(p);
    }
  }
  return pools;
}

/**
 * Fetch all open Stellar pools (status === 0).
 */
export async function fetchStellarOpenPools(): Promise<StellarPool[]> {
  const all = await fetchAllStellarPools();
  return all.filter((p) => p.status === 0);
}

/**
 * Fetch all settled Stellar pools (status === 1).
 */
export async function fetchStellarSettledPools(): Promise<StellarPool[]> {
  const all = await fetchAllStellarPools();
  return all.filter((p) => p.status === 1);
}

/**
 * Fetch bets for a specific pool given a list of known bettor addresses.
 */
export async function fetchStellarBetsForPool(
  poolId: number,
  bettors: string[]
): Promise<StellarBet[]> {
  if (bettors.length === 0) return [];

  const { rpcUrl, contractId } = getConfig();
  const rpcServer = new SorobanRpc.Server(rpcUrl);

  const results: StellarBet[] = [];
  for (const bettor of bettors) {
    try {
      const val = await readContractData(
        rpcServer,
        contractId,
        buildBetKey(poolId, bettor),
        "persistent"
      );
      if (!val) continue;

      const bet = parseBetFromScVal(val, poolId, bettor);
      if (bet) results.push(bet);
    } catch (err) {
      console.warn(
        `[soroban-indexer] Could not read bet for ${bettor} on pool ${poolId}:`,
        err
      );
    }
  }
  return results;
}

/**
 * Clear all cached data.
 */
export function clearSorobanCache() {
  poolCache.clear();
  poolCountCache.data = 0;
  poolCountCache.fetchedAt = 0;
}

/**
 * Format a StellarPool into a human-readable string (matching the Torii formatPool style).
 */
export function formatStellarPool(pool: StellarPool): string {
  const pot = BigInt(pool.total_pot);
  const onP1 = BigInt(pool.total_on_p1);
  const onP2 = BigInt(pool.total_on_p2);
  const total = Number(onP1) + Number(onP2);

  let oddsStr = "N/A";
  if (total > 0 && Number(onP1) > 0 && Number(onP2) > 0) {
    const impliedP1 = ((Number(onP1) / total) * 100).toFixed(1);
    const impliedP2 = ((Number(onP2) / total) * 100).toFixed(1);
    oddsStr = `YES=${impliedP1}% / NO=${impliedP2}%`;
  }

  const statusStr =
    pool.status === 0 ? "Open" : pool.status === 1 ? "Settled" : "Cancelled";

  return [
    `Soroban Pool #${pool.pool_id}`,
    `  Status: ${statusStr}`,
    `  Pot: ${pot} | YES: ${onP1} | NO: ${onP2}`,
    `  Odds: ${oddsStr}`,
    `  Deadline: ${pool.deadline}`,
    `  Token: ${pool.token.slice(0, 10)}...`,
  ].join("\n");
}
