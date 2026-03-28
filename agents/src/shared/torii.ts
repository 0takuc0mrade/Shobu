import { getConfig } from './config.js'

// -----------------------------------------------------------------------
// Types representing on-chain models (matches Cairo structs)
// -----------------------------------------------------------------------

export interface BettingPoolModel {
  pool_id: number
  game_world: string
  game_id: number
  token: string
  status: number
  settlement_mode: number
  egs_token_id_p1: string
  egs_token_id_p2: string
  total_pot: string | number
  total_on_p1: string | number
  total_on_p2: string | number
  bettor_count_p1: number
  bettor_count_p2: number
  winning_player: string
  winning_total: string | number
  distributable_amount: string | number
  claimed_amount: string | number
  claimed_winner_count: number
  protocol_fee_amount: string | number
  creator: string
  deadline: number | string
  player_1: string
  player_2: string
}

export interface Web2BettingPoolModel {
  pool_id: number
  match_id: string
  game_provider_id: string
  player_1_tag: string
  player_2_tag: string
  proof_nullifier_used: boolean
}

export interface OddsSnapshotModel {
  pool_id: number
  implied_prob_p1: string | number
  implied_prob_p2: string | number
  last_updated: number | string
}

export interface BetModel {
  pool_id: number
  bettor: string
  predicted_winner: string
  amount: string | number
  claimed: boolean
  placed_at: number | string
}

// -----------------------------------------------------------------------
// GraphQL fetch helper (replaces @dojoengine/sdk)
// -----------------------------------------------------------------------

async function graphqlQuery<T = any>(
  query: string,
  variables?: Record<string, any>,
  url?: string
): Promise<T> {
  const toriiUrl = url ?? getConfig().TORII_URL
  const graphqlUrl = toriiUrl.replace(/\/graphql\/?$/, '') + '/graphql'

  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    throw new Error(`Torii GraphQL error: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(`Torii GraphQL: ${json.errors[0].message}`)
  }
  return json.data as T
}

// -----------------------------------------------------------------------
// Edge extraction helper
// -----------------------------------------------------------------------

function extractEdges<T>(data: any, queryName: string): T[] {
  const edges = data?.[queryName]?.edges ?? []
  return edges.map((e: any) => e.node).filter(Boolean) as T[]
}

// -----------------------------------------------------------------------
// Pool field fragment (avoids repetition)
// -----------------------------------------------------------------------

const POOL_FIELDS = `
  pool_id
  game_world
  game_id
  token
  status
  settlement_mode
  egs_token_id_p1
  egs_token_id_p2
  total_pot
  total_on_p1
  total_on_p2
  bettor_count_p1
  bettor_count_p2
  winning_player
  winning_total
  distributable_amount
  claimed_amount
  claimed_winner_count
  protocol_fee_amount
  creator
  deadline
  player_1
  player_2
`

const WEB2_POOL_FIELDS = `
  pool_id
  match_id
  game_provider_id
  player_1_tag
  player_2_tag
  proof_nullifier_used
`

// -----------------------------------------------------------------------
// Query helpers
// -----------------------------------------------------------------------

/**
 * Fetch all open betting pools (status == 0).
 */
export async function fetchOpenPools(): Promise<BettingPoolModel[]> {
  const data = await graphqlQuery(`
    query {
      shobuBettingPoolModels(where: { status: 0 }, limit: 1000) {
        edges { node { ${POOL_FIELDS} } }
      }
    }
  `)
  return extractEdges<BettingPoolModel>(data, 'shobuBettingPoolModels')
}

/**
 * Fetch all settled betting pools (status == 1).
 */
export async function fetchSettledPools(): Promise<BettingPoolModel[]> {
  const data = await graphqlQuery(`
    query {
      shobuBettingPoolModels(where: { status: 1 }, limit: 1000) {
        edges { node { ${POOL_FIELDS} } }
      }
    }
  `)
  return extractEdges<BettingPoolModel>(data, 'shobuBettingPoolModels')
}

/**
 * Fetch all pools regardless of status.
 */
export async function fetchAllPools(): Promise<BettingPoolModel[]> {
  const data = await graphqlQuery(`
    query {
      shobuBettingPoolModels(limit: 1000) {
        edges { node { ${POOL_FIELDS} } }
      }
    }
  `)
  return extractEdges<BettingPoolModel>(data, 'shobuBettingPoolModels')
}

/**
 * Fetch a single pool by ID.
 */
export async function fetchPoolById(
  poolId: number
): Promise<BettingPoolModel | null> {
  const data = await graphqlQuery(`
    query {
      shobuBettingPoolModels(where: { pool_id: ${poolId} }, limit: 1) {
        edges { node { ${POOL_FIELDS} } }
      }
    }
  `)
  const pools = extractEdges<BettingPoolModel>(data, 'shobuBettingPoolModels')
  return pools[0] ?? null
}

/**
 * Fetch Web2 pool metadata by pool ID.
 */
export async function fetchWeb2PoolById(
  poolId: number
): Promise<Web2BettingPoolModel | null> {
  const data = await graphqlQuery(`
    query {
      shobuWeb2BettingPoolModels(where: { pool_id: ${poolId} }, limit: 1) {
        edges { node { ${WEB2_POOL_FIELDS} } }
      }
    }
  `)
  const pools = extractEdges<Web2BettingPoolModel>(data, 'shobuWeb2BettingPoolModels')
  return pools[0] ?? null
}

/**
 * Fetch the OddsSnapshot for a pool.
 */
export async function fetchOddsSnapshot(
  poolId: number
): Promise<OddsSnapshotModel | null> {
  const data = await graphqlQuery(`
    query {
      shobuOddsSnapshotModels(where: { pool_id: ${poolId} }, limit: 1) {
        edges {
          node {
            pool_id
            implied_prob_p1
            implied_prob_p2
            last_updated
          }
        }
      }
    }
  `)
  const snapshots = extractEdges<OddsSnapshotModel>(data, 'shobuOddsSnapshotModels')
  return snapshots[0] ?? null
}

/**
 * Fetch bets for a specific pool.
 */
export async function fetchBetsForPool(
  poolId: number
): Promise<BetModel[]> {
  const data = await graphqlQuery(`
    query {
      shobuBetModels(where: { pool_id: ${poolId} }, limit: 1000) {
        edges {
          node {
            pool_id
            bettor
            predicted_winner
            amount
            claimed
            placed_at
          }
        }
      }
    }
  `)
  return extractEdges<BetModel>(data, 'shobuBetModels')
}

/**
 * Subscribe to real-time pool changes (polling-based for Termux compatibility).
 *
 * The native SDK subscription used WebSocket/gRPC which requires WASM binaries.
 * This replacement polls the GraphQL endpoint every `intervalMs` milliseconds.
 */
export async function subscribeToPoolChanges(
  callback: (pools: BettingPoolModel[]) => void,
  intervalMs = 15_000
) {
  let lastSeen = new Map<number, string>()

  const poll = async () => {
    try {
      const pools = await fetchAllPools()
      // Detect changes by comparing pool state hashes
      const changed: BettingPoolModel[] = []
      for (const pool of pools) {
        const key = pool.pool_id
        const hash = JSON.stringify(pool)
        if (lastSeen.get(key) !== hash) {
          changed.push(pool)
          lastSeen.set(key, hash)
        }
      }
      if (changed.length > 0) callback(changed)
    } catch (err) {
      console.error('[torii] polling error:', err)
    }
  }

  // Initial fetch
  await poll()

  // Return an interval handle so callers can cancel
  const handle = setInterval(poll, intervalMs)
  return {
    cancel: () => clearInterval(handle),
  }
}

// -----------------------------------------------------------------------
// GraphQL query helper (exposed for pool-creator's game-specific queries)
// -----------------------------------------------------------------------

export { graphqlQuery }
