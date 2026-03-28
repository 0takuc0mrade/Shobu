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
import { POOL_STATUS, SETTLEMENT_MODE } from '../shared/constants.js'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatPool(pool: BettingPoolModel, odds?: OddsSnapshotModel | null): string {
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
    oddsStr = `P1=${p1.toFixed(1)}% / P2=${p2.toFixed(1)}%`
  }

  return [
    `Pool #${pool.pool_id}`,
    `  Game: ${pool.game_world} #${pool.game_id}`,
    `  Mode: ${mode} | Status: ${pool.status}`,
    `  Pot: ${pot} | P1: ${onP1} | P2: ${onP2}`,
    `  Bettors: ${bettors} (P1=${pool.bettor_count_p1}, P2=${pool.bettor_count_p2})`,
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

  console.log(`[analyst] 🚀 Running in local autonomous mode (interval: ${ANALYST_INTERVAL_MS / 1000}s)`)

  // Run first cycle immediately
  await runAnalystCycle()

  // Then run on interval
  setInterval(() => {
    runAnalystCycle().catch((err) =>
      console.error('[analyst] interval error:', err?.message ?? err)
    )
  }, ANALYST_INTERVAL_MS)
}

main().catch((err) => {
  console.error('[analyst] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
