import dotenv from 'dotenv'
dotenv.config()

import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'

import { loadConfig, getConfig } from '../shared/config.js'
import { initSession, executeAndWait, normalizeAddress } from '../shared/starknet.js'
import { fetchAllPools, type BettingPoolModel } from '../shared/torii.js'
import { ENTRYPOINTS } from '../shared/constants.js'

// -----------------------------------------------------------------------
// Feed parsing helpers (ported from pool-manager.mjs)
// -----------------------------------------------------------------------

interface MatchInfo {
  matchId: string
  gameId: number
  gameWorld: string
  token: string
  startTimeSec: number | null
  deadlineSec: number | null
  egsTokenIdP1: string | null
  egsTokenIdP2: string | null
}

function pickValue(obj: any, keys: string[]): any {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null) return obj[key]
  }
  return undefined
}

function parseNumber(value: any): number | null {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function parseTimeToSeconds(value: any): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') {
    if (value > 1e12) return Math.floor(value / 1000)
    if (value > 1e9) return Math.floor(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed)
      if (num > 1e12) return Math.floor(num / 1000)
      if (num > 1e9) return Math.floor(num)
      return null
    }
    const parsed = Date.parse(trimmed)
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000)
  }
  return null
}

function extractList(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.games)) return payload.games
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

function normalizeFelt(value: any): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'bigint') return value.toString()
  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : null
}

function parseMatch(entry: any, defaultToken: string): MatchInfo | null {
  const gameId = parseNumber(
    pickValue(entry, [
      'game_id', 'gameId', 'id', 'gameID', 'match_id', 'matchId',
    ])
  )
  if (gameId == null || gameId < 0 || gameId > 2 ** 32 - 1) return null

  const worldAddress = pickValue(entry, [
    'world_address', 'worldAddress', 'dojo_world', 'world',
    'world_contract', 'worldContract', 'game_world', 'gameWorld',
    'actions_address', 'actionsAddress',
  ])
  if (!worldAddress) return null

  const tokenAddress = pickValue(entry, [
    'token_address', 'tokenAddress', 'bet_token', 'betToken',
    'pool_token', 'poolToken',
  ])

  const startAt = pickValue(entry, [
    'start_time', 'startTime', 'starts_at', 'startsAt',
    'scheduled_at', 'scheduledAt', 'kickoff', 'kickoff_at', 'kickoffAt',
  ])

  const deadlineRaw = pickValue(entry, [
    'bet_deadline', 'betDeadline', 'deadline', 'betting_deadline',
  ])

  const egsTokenIdP1 = pickValue(entry, [
    'egs_token_id_p1', 'egsTokenIdP1', 'token_id_p1', 'tokenIdP1',
    'player1_token_id', 'p1_token_id',
  ])
  const egsTokenIdP2 = pickValue(entry, [
    'egs_token_id_p2', 'egsTokenIdP2', 'token_id_p2', 'tokenIdP2',
    'player2_token_id', 'p2_token_id',
  ])

  return {
    matchId: `${gameId}`,
    gameId,
    gameWorld: normalizeAddress(worldAddress),
    token: normalizeAddress(tokenAddress ?? defaultToken),
    startTimeSec: parseTimeToSeconds(startAt),
    deadlineSec: parseTimeToSeconds(deadlineRaw),
    egsTokenIdP1: normalizeFelt(egsTokenIdP1),
    egsTokenIdP2: normalizeFelt(egsTokenIdP2),
  }
}

function computeDeadline(
  nowSec: number,
  startTimeSec: number | null,
  deadlineSec: number | null,
  bufferSec: number,
  defaultWindowSec: number
): number {
  if (deadlineSec && deadlineSec > 0) return deadlineSec
  if (startTimeSec && startTimeSec > 0) {
    return Math.max(startTimeSec - bufferSec, nowSec + 30)
  }
  return nowSec + defaultWindowSec
}

function shouldCreate(
  nowSec: number,
  startTimeSec: number | null,
  deadlineSec: number,
  leadSec: number
): boolean {
  if (deadlineSec <= nowSec) return false
  if (!startTimeSec) return true
  return nowSec >= startTimeSec - leadSec
}

// -----------------------------------------------------------------------
// Agent definition
// -----------------------------------------------------------------------

const agent = new Agent({
  systemPrompt: `You are the Shobu Pool Creator agent. Your job is to monitor game feeds and automatically create betting pools on the Shobu escrow contract for new games. You create both direct (IGameWorld) pools and EGS (denshokan session token) pools. You run on a cron schedule, scanning the feed and creating pools for games that don't already have one.`,
})

// --- Capability: auto_scan ---
agent.addCapability({
  name: 'auto_scan',
  description:
    'Scan the game feed, compare against existing on-chain pools, and create missing pools automatically.',
  inputSchema: z.object({
    dryRun: z
      .boolean()
      .optional()
      .describe('If true, log what would be created without executing transactions'),
  }),
  async run({ args }) {
    const config = getConfig()
    const nowSec = Math.floor(Date.now() / 1000)

    // 1. Fetch game feed
    let payload: any
    try {
      const response = await fetch(config.FEED_URL)
      if (!response.ok)
        throw new Error(`Feed request failed: ${response.status}`)
      payload = await response.json()
    } catch (err: any) {
      return `Feed error: ${err?.message ?? err}`
    }

    const entries = extractList(payload)
    const matches = entries
      .map((entry) => parseMatch(entry, config.POOL_TOKEN))
      .filter(Boolean) as MatchInfo[]

    if (matches.length === 0) return 'No matches found in feed.'

    // 2. Fetch existing on-chain pools
    let existingPools: BettingPoolModel[] = []
    try {
      existingPools = await fetchAllPools()
    } catch (err: any) {
      return `Torii query failed: ${err?.message ?? err}`
    }

    const existingKeys = new Set(
      existingPools.map((pool) => {
        const gw = normalizeAddress(pool.game_world)
        return `${gw}:${Number(pool.game_id)}`
      })
    )

    // 3. Create missing pools
    const results: string[] = []
    let created = 0

    for (const match of matches) {
      if (created >= config.MAX_POOLS_PER_TICK) break

      const matchKey = `${match.gameWorld}:${match.gameId}`
      if (existingKeys.has(matchKey)) continue

      const deadline = computeDeadline(
        nowSec,
        match.startTimeSec,
        match.deadlineSec,
        config.DEADLINE_BUFFER_SECONDS,
        config.DEFAULT_DEADLINE_SECONDS
      )

      if (
        !shouldCreate(
          nowSec,
          match.startTimeSec,
          deadline,
          config.CREATE_LEAD_SECONDS
        )
      )
        continue
      if (deadline <= nowSec) continue

      const isEgs = Boolean(match.egsTokenIdP1 && match.egsTokenIdP2)
      const entrypoint = isEgs
        ? ENTRYPOINTS.createEgsPool
        : ENTRYPOINTS.createPool

      const calldata = isEgs
        ? [
            match.gameWorld,
            match.gameId.toString(),
            match.token,
            deadline.toString(),
            match.egsTokenIdP1!,
            match.egsTokenIdP2!,
          ]
        : [
            match.gameWorld,
            match.gameId.toString(),
            match.token,
            deadline.toString(),
          ]

      if (args.dryRun) {
        results.push(`[DRY RUN] Would create ${isEgs ? 'EGS' : 'direct'} pool for ${matchKey} (deadline ${deadline})`)
        created++
        continue
      }

      try {
        const txHash = await executeAndWait([
          { contractAddress: config.ESCROW_ADDRESS, entrypoint, calldata },
        ])
        results.push(
          `Created ${isEgs ? 'EGS' : 'direct'} pool for ${matchKey} — tx: ${txHash}`
        )
        created++
      } catch (err: any) {
        results.push(`Failed to create pool for ${matchKey}: ${err?.message ?? err}`)
      }
    }

    if (results.length === 0) return 'All feed games already have pools.'
    return results.join('\n')
  },
})

// --- Capability: create_pool ---
agent.addCapability({
  name: 'create_pool',
  description:
    'Create a single direct-mode betting pool on the Shobu escrow contract.',
  inputSchema: z.object({
    gameWorld: z.string().describe('Game world contract address'),
    gameId: z.number().int().describe('Game ID'),
    token: z.string().optional().describe('ERC20 token address (defaults to STRK)'),
    deadline: z.number().int().describe('Betting deadline as unix timestamp'),
  }),
  async run({ args }) {
    const config = getConfig()
    const token = normalizeAddress(args.token ?? config.POOL_TOKEN)
    const txHash = await executeAndWait([
      {
        contractAddress: config.ESCROW_ADDRESS,
        entrypoint: ENTRYPOINTS.createPool,
        calldata: [
          normalizeAddress(args.gameWorld),
          args.gameId.toString(),
          token,
          args.deadline.toString(),
        ],
      },
    ])
    return `Pool created — tx: ${txHash}`
  },
})

// --- Capability: create_egs_pool ---
agent.addCapability({
  name: 'create_egs_pool',
  description:
    'Create an EGS-mode betting pool using denshokan session token IDs.',
  inputSchema: z.object({
    gameWorld: z.string().describe('Game world contract address'),
    gameId: z.number().int().describe('Game ID'),
    token: z.string().optional().describe('ERC20 token address (defaults to STRK)'),
    deadline: z.number().int().describe('Betting deadline as unix timestamp'),
    egsTokenIdP1: z.string().describe('EGS session token ID for player 1'),
    egsTokenIdP2: z.string().describe('EGS session token ID for player 2'),
  }),
  async run({ args }) {
    const config = getConfig()
    const token = normalizeAddress(args.token ?? config.POOL_TOKEN)
    const txHash = await executeAndWait([
      {
        contractAddress: config.ESCROW_ADDRESS,
        entrypoint: ENTRYPOINTS.createEgsPool,
        calldata: [
          normalizeAddress(args.gameWorld),
          args.gameId.toString(),
          token,
          args.deadline.toString(),
          args.egsTokenIdP1,
          args.egsTokenIdP2,
        ],
      },
    ])
    return `EGS pool created — tx: ${txHash}`
  },
})

// -----------------------------------------------------------------------
// Provision & Run
// -----------------------------------------------------------------------

async function main() {
  const config = loadConfig()

  // Initialize Cartridge Controller session
  await initSession()
  if (config.EXIT_AFTER_SESSION) {
    console.log('[pool-creator] Session bootstrap complete; exiting.')
    return
  }

  await provision({
    agent: {
      instance: agent,
      name: 'shobu-pool-creator',
      description:
        'Monitors game feeds and automatically creates betting pools on the Shobu protocol for new games.',
    },
    workflow: {
      name: 'Shobu Pool Creator',
      trigger: triggers.cron({ schedule: '*/5 * * * *' }),
      task: {
        description:
          'Monitor game feeds from the denshokan API, compare against existing on-chain betting pools, and automatically create new pools for games that need one — supporting both direct IGameWorld and EGS denshokan settlement modes.',
      },
    },
  })

  // Reload env after provision writes credentials
  dotenv.config({ override: true })

  await run(agent)
}

main().catch((err) => {
  console.error('[pool-creator] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
