import { init, ToriiQueryBuilder, MemberClause, KeysClause } from '@dojoengine/sdk/node'
import { getConfig } from './config.js'
import { MODELS, POOL_STATUS } from './constants.js'

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
// SDK singleton
// -----------------------------------------------------------------------

let _sdk: Awaited<ReturnType<typeof init>> | null = null

export async function initDojoSdk() {
  if (_sdk) return _sdk
  const config = getConfig()
  _sdk = await init({
    client: {
      worldAddress: config.WORLD_ADDRESS,
      toriiUrl: config.TORII_URL,
    },
    domain: {
      name: 'Shobu',
      version: '1.0',
      chainId: 'SN_SEPOLIA',
      revision: '1',
    },
  })
  return _sdk
}

// -----------------------------------------------------------------------
// Entity extraction helper
// -----------------------------------------------------------------------

function extractModels<T>(
  result: any,
  namespace: string,
  model: string
): T[] {
  const items =
    typeof result?.getItems === 'function'
      ? result.getItems()
      : result?.items ?? []
  const models: T[] = []
  for (const item of items) {
    const m =
      item?.models?.[namespace]?.[model] ??
      item?.models?.[`${namespace}-${model}`] ??
      null
    if (m) models.push(m as T)
  }
  return models
}

// -----------------------------------------------------------------------
// Query helpers
// -----------------------------------------------------------------------

/**
 * Fetch all open betting pools (status == 0).
 */
export async function fetchOpenPools(): Promise<BettingPoolModel[]> {
  const sdk = await initDojoSdk()
  const query = new ToriiQueryBuilder()
    .withClause(
      MemberClause(MODELS.BettingPool, 'status', 'Eq', POOL_STATUS.OPEN).build()
    )
    .withLimit(1000)
  const result = await sdk.getEntities({ query })
  return extractModels<BettingPoolModel>(result, 'shobu', 'BettingPool')
}

/**
 * Fetch all settled betting pools (status == 1).
 */
export async function fetchSettledPools(): Promise<BettingPoolModel[]> {
  const sdk = await initDojoSdk()
  const query = new ToriiQueryBuilder()
    .withClause(
      MemberClause(
        MODELS.BettingPool,
        'status',
        'Eq',
        POOL_STATUS.SETTLED
      ).build()
    )
    .withLimit(1000)
  const result = await sdk.getEntities({ query })
  return extractModels<BettingPoolModel>(result, 'shobu', 'BettingPool')
}

/**
 * Fetch all pools regardless of status.
 */
export async function fetchAllPools(): Promise<BettingPoolModel[]> {
  const sdk = await initDojoSdk()
  const query = new ToriiQueryBuilder()
    .withEntityModels([MODELS.BettingPool])
    .withLimit(1000)
  const result = await sdk.getEntities({ query })
  return extractModels<BettingPoolModel>(result, 'shobu', 'BettingPool')
}

/**
 * Fetch a single pool by ID.
 */
export async function fetchPoolById(
  poolId: number
): Promise<BettingPoolModel | null> {
  const sdk = await initDojoSdk()
  const query = new ToriiQueryBuilder()
    .withClause(
      KeysClause(
        [MODELS.BettingPool],
        [poolId.toString()],
        'FixedLen'
      ).build()
    )
    .withLimit(1)
  const result = await sdk.getEntities({ query })
  const models = extractModels<BettingPoolModel>(
    result,
    'shobu',
    'BettingPool'
  )
  return models[0] ?? null
}

/**
 * Fetch the OddsSnapshot for a pool.
 */
export async function fetchOddsSnapshot(
  poolId: number
): Promise<OddsSnapshotModel | null> {
  const sdk = await initDojoSdk()
  const query = new ToriiQueryBuilder()
    .withClause(
      KeysClause(
        [MODELS.OddsSnapshot],
        [poolId.toString()],
        'FixedLen'
      ).build()
    )
    .withLimit(1)
  const result = await sdk.getEntities({ query })
  const models = extractModels<OddsSnapshotModel>(
    result,
    'shobu',
    'OddsSnapshot'
  )
  return models[0] ?? null
}

/**
 * Fetch bets for a specific pool.
 */
export async function fetchBetsForPool(
  poolId: number
): Promise<BetModel[]> {
  const sdk = await initDojoSdk()
  const query = new ToriiQueryBuilder()
    .withClause(
      MemberClause(MODELS.Bet, 'pool_id', 'Eq', poolId).build()
    )
    .withLimit(1000)
  const result = await sdk.getEntities({ query })
  return extractModels<BetModel>(result, 'shobu', 'Bet')
}

/**
 * Subscribe to real-time pool changes.
 */
export async function subscribeToPoolChanges(
  callback: (pools: BettingPoolModel[]) => void
) {
  const sdk = await initDojoSdk()
  const query = new ToriiQueryBuilder()
    .withEntityModels([MODELS.BettingPool])
    .includeHashedKeys()

  const [_initial, subscription] = await sdk.subscribeEntityQuery({
    query,
    callback: ({ data, error }) => {
      if (error) {
        console.error('[torii] subscription error:', error)
        return
      }
      if (data) {
        const pools = data
          .map((entity: any) => {
            return (
              entity?.models?.shobu?.BettingPool ??
              entity?.models?.['shobu-BettingPool'] ??
              null
            )
          })
          .filter(Boolean) as BettingPoolModel[]
        if (pools.length > 0) callback(pools)
      }
    },
  })
  return subscription
}
