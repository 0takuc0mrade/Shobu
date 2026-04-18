import dotenv from 'dotenv'
dotenv.config()

import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'

import { loadConfig } from '../shared/config.js'
import { initSession, normalizeAddress } from '../shared/starknet.js'
import {
  fetchOpenPools,
  fetchSettledPools,
  fetchPoolById,
  fetchOddsSnapshot,
  fetchBetsForPool,
  type BettingPoolModel,
  type OddsSnapshotModel,
} from '../shared/torii.js'
import {
  fetchStellarPoolById,
  fetchStellarOpenPools,
  fetchStellarSettledPools,
  formatStellarPool,
} from '../shared/soroban-indexer.js'
import { POOL_STATUS, SETTLEMENT_MODE } from '../shared/constants.js'
import { getMarketContext } from '../shared/market-generator.js'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatPool(pool: BettingPoolModel, odds?: OddsSnapshotModel | null, marketTitle?: string): string {
  const pot = BigInt(pool.total_pot || 0)
  const onP1 = BigInt(pool.total_on_p1 || 0)
  const onP2 = BigInt(pool.total_on_p2 || 0)
  const bettors = Number(pool.bettor_count_p1 || 0) + Number(pool.bettor_count_p2 || 0)
  const mode = (() => {
    const m = Number(pool.settlement_mode)
    if (m === SETTLEMENT_MODE.EGS) return 'EGS'
    if (m === SETTLEMENT_MODE.BUDOKAN) return 'Budokan'
    if (m === SETTLEMENT_MODE.WEB2_ZKTLS) return 'Web2'
    return 'Direct'
  })()

  let oddsStr = 'N/A'
  if (odds) {
    const p1 = Number(odds.implied_prob_p1 || 0) / 100
    const p2 = Number(odds.implied_prob_p2 || 0) / 100
    oddsStr = `YES=${p1.toFixed(1)}% / NO=${p2.toFixed(1)}%`
  }

  return [
    `Pool #${pool.pool_id}`,
    marketTitle ? `  Proposition: ${marketTitle}` : `  Game: ${pool.game_world} #${pool.game_id}`,
    `  Mode: ${mode} | Status: ${pool.status}`,
    `  Pot: ${pot} | YES: ${onP1} | NO: ${onP2}`,
    `  Bettors: ${bettors} (YES=${pool.bettor_count_p1}, NO=${pool.bettor_count_p2})`,
    `  Odds: ${oddsStr}`,
    `  Deadline: ${pool.deadline}`,
  ].join('\n')
}

// -----------------------------------------------------------------------
// Agent definition
// -----------------------------------------------------------------------

const agent = new Agent({
  systemPrompt: `You are the Shobu Analyst agent. You provide odds analysis, pool insights, and market overviews for the Shobu betting protocol. When asked for analysis, you use your generate() method to produce natural-language AI insights combining on-chain data with market context. You can analyze individual pools or provide a full market overview.`,
})

// --- Capability: get_pool_odds ---
agent.addCapability({
  name: 'get_pool_odds',
  description:
    'Get the current implied odds for a specific betting pool from the on-chain OddsSnapshot.',
  inputSchema: z.object({
    poolId: z.number().int().describe('Pool ID to query odds for'),
  }),
  async run({ args }) {
    const pool = await fetchPoolById(args.poolId)
    if (!pool) return `Pool #${args.poolId} not found.`

    const odds = await fetchOddsSnapshot(args.poolId)
    return formatPool(pool, odds)
  },
})

// --- Capability: analyze_pool ---
agent.addCapability({
  name: 'analyze_pool',
  description:
    'Perform AI-powered analysis on a specific pool — summarizing odds, liquidity, bet distribution, and providing insights.',
  inputSchema: z.object({
    poolId: z.number().int().describe('Pool ID to analyze'),
  }),
  async run({ args, action }) {
    const pool = await fetchPoolById(args.poolId)
    if (!pool) return `Pool #${args.poolId} not found.`

    const odds = await fetchOddsSnapshot(args.poolId)
    const bets = await fetchBetsForPool(args.poolId)

    const poolSummary = formatPool(pool, odds)
    const betSummary = bets
      .map(
        (b) =>
          `  ${b.bettor} → ${b.predicted_winner} (${BigInt(b.amount || 0)})`
      )
      .join('\n')

    // Use platform-delegated LLM call — no API key needed
    const analysis = await this.generate({
      prompt: `You are a betting market analyst. Analyze this Shobu betting pool and provide insights on odds quality, bet distribution, potential value, and any risks:

Pool Data:
${poolSummary}

Individual Bets:
${betSummary || '  No bets yet.'}

Provide a concise but insightful analysis covering:
1. Current odds fairness
2. Liquidity depth
3. Bet concentration risk
4. Value opportunities for new bettors`,
      action,
    })

    return `## Pool #${args.poolId} Analysis\n\n${poolSummary}\n\n### AI Insights\n${analysis}`
  },
})

// --- Capability: chat_analysis ---
agent.addCapability({
  name: 'chat_analysis',
  description:
    'Answer natural language questions about the Shobu betting market, specific pools, or odds. Use this to chat with users in the OpenServ workspace.',
  inputSchema: z.object({
    question: z.string().describe("The user's question about the betting market"),
  }),
  async run({ args, action }) {
    const [openPools, settledPools] = await Promise.all([
      fetchOpenPools(),
      fetchSettledPools(),
    ])
    
    // We fetch a high level overview to provide context to the LLM
    const contextStr = `Open Pools: ${openPools.length}, Settled Pools: ${settledPools.length}. Note: You can use other capabilities like get_pool_odds or analyze_pool if the user asks for a specific pool ID.`;

    const answer = await this.generate({
      prompt: `You are the Shobu Analyst agent, chatting with a user in the OpenServ workspace.
Context: ${contextStr}
User question: "${args.question}"

Answer the user directly and concisely. If they ask about a specific pool you don't have the data for here, tell them you can check it using the analyze_pool or get_pool_odds capability.`,
      action,
    })

    return answer;
  },
})

// --- Capability: chat_trollbox ---
agent.addCapability({
  name: 'chat_trollbox',
  description:
    'Answer a user message in the Trollbox chat for a specific betting pool. Provides pool-aware AI commentary with real-time on-chain data.',
  inputSchema: z.object({
    poolId: z.number().int().describe('Pool ID the user is chatting about'),
    message: z.string().describe('The user\'s chat message'),
    chainType: z.string().optional().describe('Which chain the user is connected to: starknet, stellar, or evm'),
    stellarPoolData: z.string().optional().describe('JSON string of Stellar/Soroban pool data if the user is on Stellar'),
  }),
  async run({ args, action }) {
    // When the user is on Stellar, fetch pool data from Soroban directly
    // instead of relying on the client-passed JSON string
    if (args.chainType === 'stellar') {
      const stellarPool = await fetchStellarPoolById(args.poolId).catch(() => null)
      const poolContext = stellarPool
        ? formatStellarPool(stellarPool)
        : `Soroban Pool #${args.poolId} not found.`

      const answer = await this.generate({
        prompt: `You are the Shobu Trollbox AI — a witty, knowledgeable prediction market analyst chatting with users watching a live streamed event. Be concise, engaging, and data-driven. Use emoji sparingly.

User's Chain: Stellar/Soroban
Soroban Pool Data:
${poolContext}

User says: "${args.message}"

Respond naturally as a chat message (1-3 sentences max). Reference the Soroban pool data for odds and probabilities.`,
        action,
      })

      return answer;
    }

    // Starknet / EVM path — unchanged
    const pool = await fetchPoolById(args.poolId)
    const odds = pool ? await fetchOddsSnapshot(args.poolId) : null
    const bets = pool ? await fetchBetsForPool(args.poolId) : []

    let marketTitle;
    if (pool?.game_id && Number(pool.settlement_mode) === SETTLEMENT_MODE.WEB2_ZKTLS) {
      const matchId = `NA1_${pool.game_id}`;
      marketTitle = getMarketContext(matchId)?.market_title;
    }

    const poolContext = pool
      ? formatPool(pool, odds, marketTitle)
      : `Pool #${args.poolId} not found.`

    const betSummary = bets.length > 0
      ? bets.slice(0, 10).map(b => `  ${b.bettor.slice(0, 10)}... → ${b.predicted_winner === pool?.player_1 ? 'YES' : 'NO'} (${BigInt(b.amount || 0)})`).join('\n')
      : '  No bets yet.'

    const answer = await this.generate({
      prompt: `You are the Shobu Trollbox AI — a witty, knowledgeable prediction market analyst chatting with users watching a live streamed event. Be concise, engaging, and data-driven. Use emoji sparingly.

Market Proposition: ${marketTitle || "Unknown Event"}
User's Chain: ${args.chainType ?? 'starknet'}
Pool Data:
${poolContext}

Recent Bets:
${betSummary}

User says: "${args.message}"

Respond naturally as a chat message (1-3 sentences max). If they ask about odds or probabilities, reference the exact YES/NO odds data above.`,
      action,
    })

    return answer;
  },
})

// --- Capability: market_overview ---
agent.addCapability({
  name: 'market_overview',
  description:
    'Generate a full market overview of all active and recently settled betting pools.',
  inputSchema: z.object({}),
  async run({ action }) {
    const [openPools, settledPools] = await Promise.all([
      fetchOpenPools(),
      fetchSettledPools(),
    ])

    // Fetch odds for open pools
    const openSummaries: string[] = []
    for (const pool of openPools) {
      const odds = await fetchOddsSnapshot(pool.pool_id)
      openSummaries.push(formatPool(pool, odds))
    }

    const settledSummaries = settledPools.slice(0, 5).map((pool) => {
      const pot = BigInt(pool.total_pot || 0)
      const fee = BigInt(pool.protocol_fee_amount || 0)
      return `Pool #${pool.pool_id} | winner=${pool.winning_player} | pot=${pot} | fee=${fee}`
    })

    const marketData = `
OPEN POOLS (${openPools.length}):
${openSummaries.length > 0 ? openSummaries.join('\n\n') : '  None'}

RECENTLY SETTLED (${settledPools.length} total, showing last 5):
${settledSummaries.length > 0 ? settledSummaries.join('\n') : '  None'}
`.trim()

    const overview = await this.generate({
      prompt: `You are a betting market analyst for the Shobu protocol. Generate a concise market overview report from this data:

${marketData}

Cover:
1. Market activity summary
2. Notable pools (highest pot, most bettors, unusual odds)
3. Settlement activity
4. Any market health observations`,
      action,
    })

    return `## Shobu Market Overview\n\n${overview}\n\n### Raw Data\n${marketData}`
  },
})

// --- Capability: resolve_match_name ---
agent.addCapability({
  name: 'resolve_match_name',
  description:
    'Resolve raw game IDs into human-readable match names by inspecting on-chain data and contextual cues.',
  inputSchema: z.object({
    pool_id: z.string().describe('The pool ID (stringified)'),
    raw_game_id: z.string().describe('The raw game ID, challenge ID, or UUID'),
    type: z.string().describe('The game type or settlement mode (e.g. Web2, Pistols, Budokan)')
  }),
  async run({ args, action }) {
    let poolContext = "";
    if (args.pool_id && args.pool_id !== 'unknown') {
       const pool = await fetchPoolById(Number(args.pool_id)).catch(() => null);
       if (pool) poolContext = formatPool(pool);
    }

    const answer = await this.generate({
      prompt: `You are the Shobu Protocol Match Resolver.
Your job is to take raw cryptographic IDs and match data and return ONLY a clean, human-readable match title string.
Do not include any quotation marks, markdown, or chatty text.

Inputs:
Pool ID: ${args.pool_id}
Raw Game/Match ID: ${args.raw_game_id}
Match Type/Mode: ${args.type}
Pool Context (if any):
${poolContext}

If the Type is Web2/Riot, deduce a team matchup format (e.g., "T1 vs Gen.G" or "Pro League Match").
If the Type is Pistols/Dojo, deduplicate the addresses and format as "Pistols Duel: 0x... vs 0x...".
If unknown, return a sensible shortened format for the game.

Output ONLY the final match title string.`,
      action,
    })

    return answer.replace(/["\n]/g, '').trim();
  },
})

// --- Capability: post_new_markets ---
agent.addCapability({
  name: 'post_new_markets',
  description:
    'Automatically scans for new betting pools and posts an AI-generated odds analysis to Discord.',
  inputSchema: z.object({}),
  async run({ action }) {
    const config = loadConfig()
    const openPools = await fetchOpenPools()

    if (openPools.length === 0) return 'No open pools found.'

    const statePath = path.resolve('.posted_pools.json')
    let postedIds: string[] = []
    try {
      if (fs.existsSync(statePath)) {
        postedIds = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
      }
    } catch (err) {
      console.warn('Could not read posted pools state:', err)
    }

    const newPools = openPools.filter((p) => !postedIds.includes(p.pool_id.toString()))
    if (newPools.length === 0) return 'No new pools to post about.'

    const webhookUrl = process.env.TWITTER_WEBHOOK_URL
    if (!webhookUrl) return 'TWITTER_WEBHOOK_URL not configured. Skipped posting.'

    let postedCount = 0
    for (const pool of newPools) {
      try {
        const odds = await fetchOddsSnapshot(pool.pool_id)
        const summary = formatPool(pool, odds)

        const analysis = await this.generate({
          prompt: `You are the Shobu Analyst. A new betting pool has just opened!
Raw data: ${summary}

Write a very short, exciting Twitter post announcing this match. Include the current odds, pool size, and a call to action to place bets. Keep it under 280 characters. Use emojis. No markdown or hashtags (unless extremely relevant).`,
          action,
        })

        // Send to Twitter Webhook (Make / Zapier)
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: analysis,
            pool_id: pool.pool_id,
            pot: String(pool.total_pot),
            mode: (() => {
              const m = Number(pool.settlement_mode)
              if (m === SETTLEMENT_MODE.EGS) return 'EGS'
              if (m === SETTLEMENT_MODE.BUDOKAN) return 'Budokan'
              if (m === SETTLEMENT_MODE.WEB2_ZKTLS) return 'Web2'
              return 'Direct'
            })()
          }),
        })

        postedIds.push(pool.pool_id.toString())
        postedCount++
      } catch (err) {
        console.error(`Failed to post for pool ${pool.pool_id}:`, err)
      }
    }

    try {
      fs.writeFileSync(statePath, JSON.stringify(postedIds, null, 2))
    } catch (err) {
      console.warn('Could not save posted pools state:', err)
    }

    return `Successfully analyzed and posted ${postedCount} new markets.`
  },
})

// -----------------------------------------------------------------------
// Local autonomous loop (bypasses OpenServ tunnel)
// -----------------------------------------------------------------------

const ANALYST_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

async function runAnalystCycle() {
  console.log(`[analyst] ⏱ Starting analyst cycle at ${new Date().toISOString()}`)
  try {
    const [openPools, settledPools] = await Promise.all([
      fetchOpenPools(),
      fetchSettledPools(),
    ])

    const totalVolume = [...openPools, ...settledPools].reduce(
      (sum, p) => sum + BigInt(p.total_pot || 0), 0n
    )

    console.log(`[analyst] 📊 Market: ${openPools.length} open, ${settledPools.length} settled, volume: ${totalVolume}`)

    // Post new markets to webhook if configured
    const webhookUrl = process.env.TWITTER_WEBHOOK_URL
    if (webhookUrl) {
      const statePath = path.resolve('.posted_pools.json')
      let postedIds: string[] = []
      try {
        if (fs.existsSync(statePath)) {
          postedIds = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
        }
      } catch {}

      const newPools = openPools.filter((p) => !postedIds.includes(p.pool_id.toString()))
      if (newPools.length > 0) {
        let postedCount = 0
        for (const pool of newPools) {
          try {
            const odds = await fetchOddsSnapshot(pool.pool_id)
            const summary = formatPool(pool, odds)

            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `New betting pool #${pool.pool_id} is live! Pot: ${pool.total_pot}`,
                pool_id: pool.pool_id,
                pot: String(pool.total_pot),
              }),
            })
            postedIds.push(pool.pool_id.toString())
            postedCount++
          } catch {}
        }
        try { fs.writeFileSync(statePath, JSON.stringify(postedIds, null, 2)) } catch {}
        if (postedCount > 0) console.log(`[analyst] 📢 Posted ${postedCount} new markets`)
      }
    }

    console.log(`[analyst] 🏁 Analyst cycle complete`)
  } catch (err: any) {
    console.error(`[analyst] ❌ Cycle error: ${err?.message ?? err}`)
  }
}

async function main() {
  const config = loadConfig()

  // Initialize Cartridge Controller session
  await initSession()
  if (config.EXIT_AFTER_SESSION) {
    console.log('[analyst] Session bootstrap complete; exiting.')
    return
  }

  console.log(`[analyst] 🚀 Running in hybrid mode (local loop: ${ANALYST_INTERVAL_MS / 1000}s + OpenServ tunnel)`)

  // Provision is idempotent — binds credentials to the agent instance
  // and ensures the trigger is set to webhook (not cron, which caused crash loops)
  console.log('[analyst] 🔧 Provisioning agent on OpenServ platform...')
  await provision({
    userApiKey: process.env.OPENSERV_USER_API_KEY!,
    agent: {
      instance: agent,
      name: 'shobu-analyst',
      description: 'Provides odds analysis, pool insights, Trollbox chat, and market overviews for the Shobu betting protocol.',
    },
    workflow: {
      name: 'Shobu Market Analyst',
      goal: 'Analyze betting pool odds, generate market insights, power the Trollbox chat, and post AI-generated analyses. Accepts webhook requests from the Shobu frontend.',
      trigger: triggers.webhook({ waitForCompletion: true, timeout: 600 }),
      task: { description: 'Analyze markets, provide odds insights, or chat with users about betting pools' },
    },
  })

  // Run first cycle immediately
  await runAnalystCycle()

  // Then run on interval
  setInterval(() => {
    runAnalystCycle().catch((err) =>
      console.error('[analyst] interval error:', err?.message ?? err)
    )
  }, ANALYST_INTERVAL_MS)

  // Start the OpenServ tunnel so webhook triggers from the frontend work
  console.log('[analyst] 🔗 Starting OpenServ agent tunnel...')
  await run(agent)
}

main().catch((err) => {
  console.error('[analyst] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
