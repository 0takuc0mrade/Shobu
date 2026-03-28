import dotenv from 'dotenv'
dotenv.config()

import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WATCHLIST_PATH = path.join(__dirname, '../shared/watchlist.json')

import { loadConfig, getConfig } from '../shared/config.js'
import { initSession, executeAndWait, normalizeAddress } from '../shared/starknet.js'
import { fetchAllPools, type BettingPoolModel } from '../shared/torii.js'
import { ENTRYPOINTS } from '../shared/constants.js'
import { encodeShortString } from '../shared/encoding.js'
import { getAccountByRiotId, getActiveGame } from '../shared/riot.js'
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
    'actions_address', 'actionsAddress', 'contract_address', 'contractAddress',
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
    'Scan the game feed for supported games, then dynamically query each game\'s Torii indexer to find active EGS session tokens. It automatically creates Shobu pools for any 1v1 match (two players holding the same ERC1155 Token ID).',
  inputSchema: z.object({
    dryRun: z
      .boolean()
      .optional()
      .describe('If true, log what would be created without executing transactions'),
  }),
  async run({ args }) {
    const config = getConfig()
    const nowSec = Math.floor(Date.now() / 1000)

    // 1. Fetch game feed directory
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
    const games = entries
      .map((entry) => {
        const gameId = parseNumber(pickValue(entry, ['game_id', 'gameId', 'id', 'gameID']))
        const worldAddress = pickValue(entry, ['world_address', 'worldAddress', 'contract_address', 'contractAddress'])
        const tokenAddress = pickValue(entry, ['token_address', 'tokenAddress', 'denshokan_token', 'denshokanToken'])
        const toriiUrl = pickValue(entry, ['torii_url', 'toriiUrl'])
        if (!gameId || !worldAddress || !tokenAddress || !toriiUrl) return null
        return { gameId, worldAddress: normalizeAddress(worldAddress), tokenAddress: normalizeAddress(tokenAddress), toriiUrl }
      })
      .filter(Boolean) as any[]

    if (games.length === 0) return 'No fully-configured EGS games found in feed (missing toriiUrl or tokenAddress).'

    // 2. Fetch existing on-chain pools
    let existingPools: BettingPoolModel[] = []
    try {
      existingPools = await fetchAllPools()
    } catch (err: any) {
      return `Torii query failed: ${err?.message ?? err}`
    }

    // We no longer rely on game_id. We check if the egs_token_id is already in a pool.
    // For EGS pools, the existing code stored EGS tokens as player 1 and 2, but wait!
    // The previous design stored EGS token IDs directly inside BettingPool or we can just rely
    // on the fact that if a pool exists for that session, we shouldn't create another.
    // To cleanly avoid duplicates without changing contract struct, we assume game_id on Shobu IS the EGS token_id (match ID).
    const existingKeys = new Set(
      existingPools.map((pool) => `${normalizeAddress(pool.game_world)}:${Number(pool.game_id)}`)
    )

    // 3. Scan Torii for active matches
    const results: string[] = []
    let created = 0

    for (const game of games) {
      if (created >= config.MAX_POOLS_PER_TICK) break

      try {
        const matchesReady = new Map<number, { p1: string; p2: string }>()
        const graphqlUrl = game.toriiUrl.replace(/\/graphql\/?$/, '') + '/graphql'

        // Fetch token balances via GraphQL (replaces native ToriiClient.getTokenBalances)
        try {
          const balanceRes = await fetch(graphqlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `{
                tokenBalances(
                  accountAddresses: []
                  contractAddresses: ["${game.tokenAddress}"]
                  limit: 1000
                ) {
                  edges {
                    node {
                      tokenId
                      accountAddress
                      balance
                    }
                  }
                }
              }`
            })
          })
          if (balanceRes.ok) {
            const balanceData = await balanceRes.json()
            const edges = balanceData?.data?.tokenBalances?.edges ?? []
            const allBalances = edges.map((e: any) => e.node).filter(Boolean)

            // Group by token_id to find 1v1 lobbies (ERC1155 generic approach)
            const balancesByToken = new Map<string, string[]>()
            for (const bal of allBalances) {
              const tId = bal.tokenId ?? '0x0'
              if (!balancesByToken.has(tId)) balancesByToken.set(tId, [])
              balancesByToken.get(tId)!.push(bal.accountAddress!)
            }
            for (const [tokenId, players] of balancesByToken.entries()) {
              if (players.length !== 2) continue
              try {
                const mId = Number(BigInt(tokenId))
                matchesReady.set(mId, { p1: tokenId, p2: tokenId })
              } catch {}
            }
          }
        } catch (err: any) {
          console.log(`Token balance GraphQL query failed for ${game.toriiUrl}: ${err.message}`)
        }

        // Generic ERC721 Approach: Dynamically query Torii GraphQL for SessionLinked models
        try {
          const graphqlUrl = game.toriiUrl.replace(/\/graphql\/?$/, '') + '/graphql'
          // 1. Introspection to find the exact Sessionlinked query name regardless of namespace
          const introRes = await fetch(graphqlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ __schema { queryType { fields { name } } } }' })
          })
          if (introRes.ok) {
            const intro = await introRes.json()
            const fields: any[] = intro?.data?.__schema?.queryType?.fields ?? []
            const sessionQuery = fields.find((f: any) => f.name && (f.name.toLowerCase().endsWith('sessionlinkedmodels') || f.name.toLowerCase().endsWith('sessionlinkmodels')))
            
            if (sessionQuery) {
              const queryName = sessionQuery.name
              // 2. Fetch all SessionLinked models using the discovered query
              const fetchRes = await fetch(graphqlUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query: `{ ${queryName}(limit: 1000) { edges { node { token_id game_id } } } }`
                })
              })
              
              if (fetchRes.ok) {
                const sessionData = await fetchRes.json()
                const edges = sessionData?.data?.[queryName]?.edges ?? []
                
                const sessionsByGame = new Map<number, string[]>()
                for (const edge of edges) {
                   const node = edge.node
                   if (!node) continue
                   const tId = node.token_id?.toString()
                   const gIdNum = Number(node.game_id)
                   if (tId && !Number.isNaN(gIdNum)) {
                     if (!sessionsByGame.has(gIdNum)) sessionsByGame.set(gIdNum, [])
                     sessionsByGame.get(gIdNum)!.push(tId)
                   }
                }
                
                for (const [gIdNum, sessionTokens] of sessionsByGame.entries()) {
                   // Exactly 2 distinct tokens mean a 1v1 match has been formed
                   if (sessionTokens.length === 2 && sessionTokens[0] !== sessionTokens[1]) {
                     matchesReady.set(gIdNum, { p1: sessionTokens[0], p2: sessionTokens[1] })
                   }
                }
              }
            }
          }
        } catch (err: any) {
           console.log(`Failed generic GraphQL resolution for ${game.toriiUrl}: ${err.message}`)
        }

        // For every matched lobby found!
        for (const [matchIdNum, tokens] of matchesReady.entries()) {
          if (created >= config.MAX_POOLS_PER_TICK) break

          const poolKey = `${game.worldAddress}:${matchIdNum}`
          if (existingKeys.has(poolKey)) continue // Already created a pool for this match

          const deadline = nowSec + config.DEFAULT_DEADLINE_SECONDS

          const calldata = [
            game.worldAddress,
            matchIdNum.toString(),
            config.POOL_TOKEN,
            deadline.toString(),
            tokens.p1, // egs_token_id_p1
            tokens.p2  // egs_token_id_p2
          ]

          if (args.dryRun) {
            results.push(`[DRY RUN] Would create EGS pool for match ${poolKey} (tokens: ${tokens.p1}, ${tokens.p2})`)
            created++
            continue
          }

          const txHash = await executeAndWait([
            { contractAddress: config.ESCROW_ADDRESS, entrypoint: ENTRYPOINTS.createEgsPool, calldata }
          ])
          results.push(`Created EGS pool for match ${poolKey} — tx: ${txHash}`)
          created++
          existingKeys.add(poolKey)
        }
      } catch (err: any) {
        results.push(`Failed scanning Torii ${game.toriiUrl} for ${game.worldAddress}: ${err?.message ?? err}`)
      }
    }

    // --- 4. Scan Budokan Tournaments ---
    if (created < config.MAX_POOLS_PER_TICK && config.BUDOKAN_TORII_URL && config.BUDOKAN_ADDRESS !== '0x0') {
      try {
        const budokanGraphqlUrl = config.BUDOKAN_TORII_URL.replace(/\/graphql\/?$/, '') + '/graphql'
        const introRes = await fetch(budokanGraphqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ __schema { queryType { fields { name } } } }' })
        })
        if (introRes.ok) {
          const intro = await introRes.json()
          const fields: any[] = intro?.data?.__schema?.queryType?.fields ?? []
          const regQuery = fields.find((f: any) => f.name && f.name.toLowerCase().includes('registration') && (f.name.toLowerCase().includes('model') || f.name.toLowerCase().includes('event')))
          
          if (regQuery) {
            const queryName = regQuery.name
            const fetchRes = await fetch(budokanGraphqlUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: `{ ${queryName}(limit: 1000) { edges { node { tournament_id game_token_id } } } }`
              })
            })
            
            if (fetchRes.ok) {
              const regData = await fetchRes.json()
              const edges = regData?.data?.[queryName]?.edges ?? []
              
              const entriesByTourney = new Map<number, string[]>()
              for (const edge of edges) {
                 const node = edge.node
                 if (!node) continue
                 const tId = Number(node.tournament_id)
                 const entryId = node.game_token_id?.toString()
                 if (entryId && !Number.isNaN(tId)) {
                   if (!entriesByTourney.has(tId)) entriesByTourney.set(tId, [])
                   entriesByTourney.get(tId)!.push(entryId)
                 }
              }
              
              for (const [tId, entries] of entriesByTourney.entries()) {
                 if (created >= config.MAX_POOLS_PER_TICK) break
                 
                 // Find distinct entries to bet on
                 const distinct = Array.from(new Set(entries))
                 if (distinct.length >= 2) {
                   const p1 = distinct[0]
                   const p2 = distinct[1]
                   // Keep the key consistent with how we track uniqueness
                   const poolKey = `budokan:${tId}:${p1}:${p2}`
                   
                   // Assuming game_id logic handles it or we track locally:
                   // The contract uses tournament_id. We're avoiding re-creation.
                   if (existingKeys.has(poolKey)) continue
                   
                   const deadline = nowSec + config.DEFAULT_DEADLINE_SECONDS
                   if (args.dryRun) {
                      results.push(`[DRY RUN] Would create Budokan pool for tourney ${tId} (entries: ${p1}, ${p2})`)
                      created++
                      continue
                   }
                   
                   const calldata = [
                     normalizeAddress(config.BUDOKAN_ADDRESS),
                     tId.toString(),
                     p1,
                     p2,
                     config.POOL_TOKEN,
                     deadline.toString(),
                   ]
                   
                   const txHash = await executeAndWait([
                     { contractAddress: config.ESCROW_ADDRESS, entrypoint: ENTRYPOINTS.createBudokanPool, calldata }
                   ])
                   results.push(`Created Budokan pool for Tourney ${tId} — tx: ${txHash}`)
                   created++
                   existingKeys.add(poolKey)
                 }
              }
            }
          }
        }
      } catch (err: any) {
         console.log(`Failed Budokan Torii scan: ${err.message}`)
      }
    }

    if (results.length === 0) return 'Scanned all endpoints. No new matches found.'
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

// --- Capability: create_budokan_pool ---
agent.addCapability({
  name: 'create_budokan_pool',
  description:
    'Create an Budokan-mode betting pool using tournament ID and entry IDs.',
  inputSchema: z.object({
    budokanAddress: z.string().describe('Budokan contract address'),
    tournamentId: z.number().int().describe('Budokan Tournament ID'),
    entryIdP1: z.number().int().describe('Entry ID for player 1'),
    entryIdP2: z.number().int().describe('Entry ID for player 2'),
    token: z.string().optional().describe('ERC20 token address (defaults to STRK)'),
    deadline: z.number().int().describe('Betting deadline as unix timestamp'),
  }),
  async run({ args }) {
    const config = getConfig()
    const token = normalizeAddress(args.token ?? config.POOL_TOKEN)
    const txHash = await executeAndWait([
      {
        contractAddress: config.ESCROW_ADDRESS,
        entrypoint: ENTRYPOINTS.createBudokanPool,
        calldata: [
          normalizeAddress(args.budokanAddress),
          args.tournamentId.toString(),
          args.entryIdP1.toString(),
          args.entryIdP2.toString(),
          token,
          args.deadline.toString(),
        ],
      },
    ])
    return `Budokan pool created — tx: ${txHash}`
  },
})

// --- Capability: create_web2_pool ---
agent.addCapability({
  name: 'create_web2_pool',
  description:
    'Create a Web2 zkTLS betting pool for a Riot match with explicit player tags.',
  inputSchema: z.object({
    matchId: z.string().describe('Riot match ID (e.g., NA1_4123456789)'),
    gameProviderId: z.string().optional().describe('Game provider ID (defaults to RIOT_LOL)'),
    token: z.string().optional().describe('ERC20 token address (defaults to STRK)'),
    deadline: z.number().int().describe('Betting deadline as unix timestamp'),
    player1: z.string().describe('Player 1 Starknet address'),
    player2: z.string().describe('Player 2 Starknet address'),
    player1Tag: z.string().describe('Player 1 Riot tag (gameName#tagLine)'),
    player2Tag: z.string().describe('Player 2 Riot tag (gameName#tagLine)'),
  }),
  async run({ args }) {
    const config = getConfig()
    const token = normalizeAddress(args.token ?? config.POOL_TOKEN)
    const providerId = args.gameProviderId ?? 'RIOT_LOL'

    const calldata = [
      encodeShortString(args.matchId, 'match_id'),
      encodeShortString(providerId, 'game_provider_id'),
      token,
      args.deadline.toString(),
      normalizeAddress(args.player1),
      normalizeAddress(args.player2),
      encodeShortString(args.player1Tag, 'player_1_tag'),
      encodeShortString(args.player2Tag, 'player_2_tag'),
    ]

    const txHash = await executeAndWait([
      {
        contractAddress: config.ESCROW_ADDRESS,
        entrypoint: ENTRYPOINTS.createWeb2Pool,
        calldata,
      },
    ])
    return `Web2 pool created — tx: ${txHash}`
  },
})

// --- Capability: scan_riot_match ---
agent.addCapability({
  name: 'scan_riot_match',
  description:
    'Scan Riot Games for a live match involving a specific player and automatically deploy a Web2 betting pool for it.',
  inputSchema: z.object({
    gameName: z.string().describe('Riot ID Game Name (e.g. Doublelift)'),
    tagLine: z.string().describe('Riot ID Tagline (e.g. NA1)'),
    token: z.string().optional().describe('ERC20 token address (defaults to STRK)'),
    starknetBettor: z.string().describe('Your starknet address to track the pool creator'),
  }),
  async run({ args }) {
    const account = await getAccountByRiotId(args.gameName, args.tagLine)
    if (!account) return `Could not find Riot account for ${args.gameName}#${args.tagLine}`

    const liveGame = await getActiveGame(account.puuid)
    if (!liveGame || !liveGame.participants || liveGame.participants.length < 2) {
      return `${args.gameName}#${args.tagLine} is not currently in a live match.`
    }

    const p1 = liveGame.participants[0]
    const p2 = liveGame.participants.find(p => p.puuid !== p1.puuid) || liveGame.participants[1]
    
    const extractTag = (puuid: string, fallbackId: string) => {
       if (puuid === account.puuid) return `${args.gameName}#${args.tagLine}`
       return fallbackId || 'Unknown#NA1'
    }

    const p1Tag = extractTag(p1.puuid, p1.riotId)
    const p2Tag = extractTag(p2.puuid, p2.riotId)
    
    const matchId = `NA1_${liveGame.gameId}`
    const deadline = Math.floor(Date.now() / 1000) + 1800

    const config = getConfig()
    const token = normalizeAddress(args.token ?? config.POOL_TOKEN)

    // Contract requires player1 != player2
    const addr1 = normalizeAddress(args.starknetBettor)
    const addr2 = addr1.slice(0, -1) + (addr1.endsWith('e') ? 'f' : 'e')

    const calldata = [
      encodeShortString(matchId, 'match_id'),
      encodeShortString('RIOT_LOL', 'game_provider_id'),
      token,
      deadline.toString(),
      addr1,
      addr2,
      encodeShortString(p1Tag, 'player_1_tag'),
      encodeShortString(p2Tag, 'player_2_tag'),
    ]

    const txHash = await executeAndWait([{
      contractAddress: config.ESCROW_ADDRESS,
      entrypoint: ENTRYPOINTS.createWeb2Pool,
      calldata
    }])

    return `Found live match ${matchId} for ${args.gameName}! Automatically deployed Web2 Pool — tx: ${txHash}`
  }
})

// --- Capability: auto_scan_riot ---
// Fully autonomous: reads WATCHED_RIOT_PLAYERS from config, checks each
// player for a live game, and deploys Web2 pools without any human input.
const riotPoolsCreatedThisSession = new Set<string>()
let riotWatchlistBatchIndex = 0
const BATCH_SIZE = 20

agent.addCapability({
  name: 'auto_scan_riot',
  description:
    'Autonomously scan a batched subset of watched Riot players from watchlist.json for live matches to avoid Riot API rate limits.',
  inputSchema: z.object({}),
  async run() {
    const config = getConfig()

    if (!config.RIOT_API_KEY) {
      return 'Skipping Riot scan: RIOT_API_KEY is not configured.'
    }

    let watchlist: string[] = []
    try {
      const data = fs.readFileSync(WATCHLIST_PATH, 'utf-8')
      watchlist = JSON.parse(data)
    } catch (err: any) {
      return `Failed to read watchlist.json: ${err.message}`
    }

    if (watchlist.length === 0) {
      return 'Skipping Riot scan: watchlist.json is empty.'
    }

    const startIdx = riotWatchlistBatchIndex
    let endIdx = startIdx + BATCH_SIZE
    const currentBatch = watchlist.slice(startIdx, endIdx)

    if (endIdx >= watchlist.length) endIdx = 0
    riotWatchlistBatchIndex = endIdx

    const creatorAddr = config.RIOT_POOL_CREATOR_ADDRESS || config.CARTRIDGE_ADDRESS
    if (!creatorAddr) {
      return 'Skipping Riot scan: RIOT_POOL_CREATOR_ADDRESS is not set.'
    }

    const results: string[] = []
    let created = 0

    for (const riotId of currentBatch) {
      const [gameName, tagLine] = riotId.split('#')
      if (!gameName || !tagLine) {
        results.push(`⚠️ Skipping invalid Riot ID format: "${riotId}" (expected GameName#TagLine)`)
        continue
      }

      try {
        const account = await getAccountByRiotId(gameName, tagLine)
        if (!account) {
          results.push(`❌ ${riotId}: Account not found on Riot`)
          continue
        }

        const liveGame = await getActiveGame(account.puuid)
        if (!liveGame || !liveGame.participants || liveGame.participants.length < 2) {
          results.push(`⏸ ${riotId}: Not in a live match`)
          continue
        }

        const matchId = `NA1_${liveGame.gameId}`

        // Prevent duplicate pool creation for the same match
        if (riotPoolsCreatedThisSession.has(matchId)) {
          results.push(`⏩ ${riotId}: Pool already created for match ${matchId} this session`)
          continue
        }

        // Extract participant tags
        const p1 = liveGame.participants[0]
        const p2 = liveGame.participants.find(p => p.puuid !== p1.puuid) || liveGame.participants[1]

        const extractTag = (puuid: string, fallbackId: string) => {
          if (puuid === account.puuid) return `${gameName}#${tagLine}`
          return fallbackId || 'Opponent#NA1'
        }

        const p1Tag = extractTag(p1.puuid, p1.riotId)
        const p2Tag = extractTag(p2.puuid, p2.riotId)

        const deadline = Math.floor(Date.now() / 1000) + 1800
        const token = normalizeAddress(config.POOL_TOKEN)

        // Contract requires player1 != player2
        const addr1 = normalizeAddress(creatorAddr)
        const addr2 = addr1.slice(0, -1) + (addr1.endsWith('e') ? 'f' : 'e')

        const calldata = [
          encodeShortString(matchId, 'match_id'),
          encodeShortString('RIOT_LOL', 'game_provider_id'),
          token,
          deadline.toString(),
          addr1,
          addr2,
          encodeShortString(p1Tag, 'player_1_tag'),
          encodeShortString(p2Tag, 'player_2_tag'),
        ]

        const txHash = await executeAndWait([{
          contractAddress: config.ESCROW_ADDRESS,
          entrypoint: ENTRYPOINTS.createWeb2Pool,
          calldata
        }])

        riotPoolsCreatedThisSession.add(matchId)
        created++
        results.push(`🎮 ${riotId}: LIVE in ${matchId}! Pool deployed — tx: ${txHash}`)
      } catch (err: any) {
        results.push(`❌ ${riotId}: ${err?.message ?? err}`)
      }
    }

    if (results.length === 0) return `Riot scan complete (batch ${startIdx}-${startIdx + currentBatch.length}) — no open games or all watched players failed.`
    return `Riot Auto-Scan (batch ${startIdx}-${startIdx + currentBatch.length}, ${created} pools created):\n${results.join('\n')}`
  }
})

// --- Capability: auto_scan_pistols ---
// Scans the Pistols at 10 Blocks FOCG Torii endpoint for active duels
// and creates direct-mode pools using the PistolsAdapter contract.
const pistolsPoolsCreatedThisSession = new Set<string>()

agent.addCapability({
  name: 'auto_scan_pistols',
  description:
    'Autonomously scan the Pistols at 10 Blocks Torii GraphQL endpoint for active duels and create direct-mode betting pools via the PistolsAdapter contract.',
  inputSchema: z.object({
    dryRun: z
      .boolean()
      .optional()
      .describe('If true, log what would be created without executing transactions'),
  }),
  async run({ args }) {
    const config = getConfig()
    const nowSec = Math.floor(Date.now() / 1000)

    if (!config.PISTOLS_ADAPTER_ADDRESS || config.PISTOLS_ADAPTER_ADDRESS === '0x0') {
      return 'Skipping Pistols scan: PISTOLS_ADAPTER_ADDRESS is not configured.'
    }

    const graphqlUrl = config.PISTOLS_TORII_URL.replace(/\/graphql\/?$/, '') + '/graphql'

    // Query Pistols Torii for InProgress duels
    // Torii returns state as enum string ("InProgress"), not integer
    const query = `{
      pistolsChallengeModels(
        limit: 20
        where: { stateEQ: "InProgress" }
      ) {
        edges {
          node {
            duel_id
            address_a
            address_b
            state
            winner
          }
        }
      }
    }`

    let duels: any[] = []
    try {
      const res = await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error(`Pistols Torii HTTP ${res.status}`)
      const json = await res.json()
      if (json.errors) {
        // Try without filter if where clause isn't supported
        const fallbackQuery = `{
          pistolsChallengeModels(limit: 30) {
            edges {
              node {
                duel_id
                address_a
                address_b
                state
                winner
              }
            }
          }
        }`
        const fallbackRes = await fetch(graphqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: fallbackQuery }),
        })
        if (!fallbackRes.ok) throw new Error(`Pistols Torii fallback HTTP ${fallbackRes.status}`)
        const fallbackJson = await fallbackRes.json()
        duels = (fallbackJson?.data?.pistolsChallengeModels?.edges ?? [])
          .map((e: any) => e.node)
          .filter((d: any) => d && (d.state === 'InProgress' || d.state === 5))
      } else {
        duels = (json?.data?.pistolsChallengeModels?.edges ?? []).map((e: any) => e.node)
      }
    } catch (err: any) {
      return `Pistols Torii query failed: ${err?.message ?? err}`
    }

    if (duels.length === 0) return 'Pistols scan complete — no active duels found.'

    // Fetch existing on-chain pools to avoid duplicates
    let existingPools: BettingPoolModel[] = []
    try {
      existingPools = await fetchAllPools()
    } catch (err: any) {
      return `Shobu Torii query failed: ${err?.message ?? err}`
    }

    const adapterAddr = normalizeAddress(config.PISTOLS_ADAPTER_ADDRESS)
    const existingKeys = new Set(
      existingPools.map((pool) => `${normalizeAddress(pool.game_world)}:${Number(pool.game_id)}`)
    )

    const results: string[] = []
    let created = 0

    for (const duel of duels) {
      if (created >= config.MAX_POOLS_PER_TICK) break

      const duelId = Number(duel.duel_id)
      if (Number.isNaN(duelId) || duelId <= 0) continue

      const poolKey = `${adapterAddr}:${duelId}`
      if (existingKeys.has(poolKey) || pistolsPoolsCreatedThisSession.has(poolKey)) {
        continue
      }

      // 30-minute betting window for an active duel
      const deadline = nowSec + 1800

      if (args.dryRun) {
        const addrA = duel.address_a ? `${String(duel.address_a).slice(0, 10)}...` : '?'
        const addrB = duel.address_b ? `${String(duel.address_b).slice(0, 10)}...` : '?'
        results.push(`[DRY RUN] Would create Pistols pool for duel #${duelId} (${addrA} vs ${addrB})`)
        created++
        continue
      }

      try {
        const calldata = [
          adapterAddr,                // game_world = PistolsAdapter
          duelId.toString(),          // game_id = duel_id
          config.POOL_TOKEN,          // token
          deadline.toString(),        // deadline
        ]

        const txHash = await executeAndWait([{
          contractAddress: config.ESCROW_ADDRESS,
          entrypoint: ENTRYPOINTS.createPool,
          calldata,
        }])

        pistolsPoolsCreatedThisSession.add(poolKey)
        existingKeys.add(poolKey)
        created++
        results.push(`🔫 Created Pistols pool for duel #${duelId} — tx: ${txHash}`)
      } catch (err: any) {
        results.push(`❌ Failed to create pool for duel #${duelId}: ${err?.message ?? err}`)
      }
    }

    if (results.length === 0) return 'Pistols scan complete — all active duels already have pools.'
    return `Pistols Auto-Scan (${created} pools created):\n${results.join('\n')}`
  },
})

// -----------------------------------------------------------------------
// Local autonomous loop (bypasses OpenServ tunnel)
// -----------------------------------------------------------------------

const SCAN_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

async function runScanCycle() {
  console.log(`[pool-creator] ⏱ Starting scan cycle at ${new Date().toISOString()}`)

  // Find the capability run functions
  const autoScan = (agent as any)._capabilities?.find((c: any) => c.name === 'auto_scan')
  const pistolsScan = (agent as any)._capabilities?.find((c: any) => c.name === 'auto_scan_pistols')
  const riotScan = (agent as any)._capabilities?.find((c: any) => c.name === 'auto_scan_riot')

  // 1. EGS/Budokan scan
  if (autoScan?.run) {
    try {
      const result = await autoScan.run({ args: { dryRun: false }, action: {} })
      console.log(`[pool-creator] 🔍 EGS scan: ${result}`)
    } catch (err: any) {
      console.error(`[pool-creator] ❌ EGS scan error: ${err?.message ?? err}`)
    }
  }

  // 2. Pistols scan
  if (pistolsScan?.run) {
    try {
      const result = await pistolsScan.run({ args: { dryRun: false }, action: {} })
      console.log(`[pool-creator] 🔫 Pistols scan: ${result}`)
    } catch (err: any) {
      console.error(`[pool-creator] ❌ Pistols scan error: ${err?.message ?? err}`)
    }
  }

  // 3. Riot scan
  if (riotScan?.run) {
    try {
      const result = await riotScan.run({ args: {}, action: {} })
      console.log(`[pool-creator] 🎮 Riot scan: ${result}`)
    } catch (err: any) {
      console.error(`[pool-creator] ❌ Riot scan error: ${err?.message ?? err}`)
    }
  }

  console.log(`[pool-creator] 🏁 Scan cycle complete`)
}

async function main() {
  const config = loadConfig()

  // Initialize Cartridge Controller session
  await initSession()
  if (config.EXIT_AFTER_SESSION) {
    console.log('[pool-creator] Session bootstrap complete; exiting.')
    return
  }

  console.log(`[pool-creator] 🚀 Running in local autonomous mode (interval: ${SCAN_INTERVAL_MS / 1000}s)`)

  // Run first cycle immediately
  await runScanCycle()

  // Then run on interval
  setInterval(() => {
    runScanCycle().catch((err) =>
      console.error('[pool-creator] interval error:', err?.message ?? err)
    )
  }, SCAN_INTERVAL_MS)
}

main().catch((err) => {
  if (err?.response?.data) {
    console.error('[pool-creator] fatal:', JSON.stringify({ status: err.response.status, data: err.response.data }))
  } else {
    console.error('[pool-creator] fatal:', err instanceof Error ? err.message : err)
  }
  process.exit(1)
})
