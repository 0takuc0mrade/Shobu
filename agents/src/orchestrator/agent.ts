import dotenv from 'dotenv'
dotenv.config()

import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers, PlatformClient } from '@openserv-labs/client'
import { z } from 'zod'

import { loadConfig, getConfig } from '../shared/config.js'
import { initSession, executeAndWait, simulateCall, normalizeAddress, SettlementCooldown } from '../shared/starknet.js'
import {
  fetchOpenPools,
  fetchAllPools,
  fetchPoolById,
  fetchOddsSnapshot,
  type BettingPoolModel,
} from '../shared/torii.js'
import { ENTRYPOINTS, POOL_STATUS, SETTLEMENT_MODE } from '../shared/constants.js'

// -----------------------------------------------------------------------
// Settlement cooldown
// -----------------------------------------------------------------------

const cooldown = new SettlementCooldown(10 * 60 * 1000)

// -----------------------------------------------------------------------
// Agent definition
// -----------------------------------------------------------------------

const agent = new Agent({
  systemPrompt: `You are the Shobu Orchestrator — the master coordinator for the Shobu betting protocol's AI agent suite. You can scan for new games and create pools, settle finished games, and generate market analysis. You coordinate the full lifecycle of betting pools: creation → monitoring → settlement → analysis.

When triggered, assess the current state of the protocol and take appropriate action:
1. First, scan for new games that need pools
2. Then, check for pools ready to settle
3. Finally, generate a market overview

Use your capabilities in the correct order and provide a comprehensive status report.`,
})

// --- Capability: scan_and_create ---
agent.addCapability({
  name: 'scan_and_create',
  description:
    'Scan the game feed and create pools for new games (delegates to pool-creator logic).',
  inputSchema: z.object({}),
  async run() {
    const config = getConfig()
    const nowSec = Math.floor(Date.now() / 1000)

    // Fetch feed
    let payload: any
    try {
      const response = await fetch(config.FEED_URL)
      if (!response.ok)
        throw new Error(`Feed request failed: ${response.status}`)
      payload = await response.json()
    } catch (err: any) {
      return `Feed error: ${err?.message ?? err}`
    }

    const entries = Array.isArray(payload)
      ? payload
      : payload?.games ?? payload?.data ?? payload?.items ?? []

    if (entries.length === 0) return 'No games found in feed.'

    // Fetch existing pools
    const existing = await fetchAllPools()
    const existingKeys = new Set(
      existing.map(
        (p) => `${normalizeAddress(p.game_world)}:${Number(p.game_id)}`
      )
    )

    let created = 0
    const results: string[] = []

    for (const entry of entries) {
      if (created >= config.MAX_POOLS_PER_TICK) break

      const gameId = Number(
        entry.game_id ?? entry.gameId ?? entry.id ?? entry.match_id
      )
      const worldAddr = normalizeAddress(
        entry.world_address ??
          entry.worldAddress ??
          entry.game_world ??
          entry.gameWorld ??
          entry.world
      )
      if (!worldAddr || isNaN(gameId)) continue

      const key = `${worldAddr}:${gameId}`
      if (existingKeys.has(key)) continue

      const deadline = nowSec + config.DEFAULT_DEADLINE_SECONDS
      const egsP1 = entry.egs_token_id_p1 ?? entry.token_id_p1
      const egsP2 = entry.egs_token_id_p2 ?? entry.token_id_p2
      const isEgs = Boolean(egsP1 && egsP2)

      const entrypoint = isEgs
        ? ENTRYPOINTS.createEgsPool
        : ENTRYPOINTS.createPool
      const calldata = isEgs
        ? [worldAddr, gameId.toString(), config.POOL_TOKEN, deadline.toString(), String(egsP1), String(egsP2)]
        : [worldAddr, gameId.toString(), config.POOL_TOKEN, deadline.toString()]

      try {
        const txHash = await executeAndWait([
          { contractAddress: config.ESCROW_ADDRESS, entrypoint, calldata },
        ])
        results.push(`Created pool for ${key} — tx: ${txHash}`)
        created++
      } catch (err: any) {
        results.push(`Failed ${key}: ${err?.message ?? err}`)
      }
    }

    return results.length > 0
      ? `Pool scan complete:\n${results.join('\n')}`
      : 'All games already have pools.'
  },
})

// --- Capability: settle_all ---
agent.addCapability({
  name: 'settle_all',
  description:
    'Simulate settlement for all open pools (free RPC call), then execute only for pools that would succeed. Failed pools go on a 10-minute cooldown.',
  inputSchema: z.object({}),
  async run() {
    const config = getConfig()
    const pools = await fetchOpenPools()
    const candidates = pools.filter((p) => BigInt(p.total_pot || 0) > 0n)

    if (candidates.length === 0) return 'No pools with bets to settle.'

    const results: string[] = []
    let simFailed = 0
    let skipped = 0

    for (const pool of candidates) {
      const poolId = Number(pool.pool_id)

      if (cooldown.isOnCooldown(poolId)) {
        skipped++
        continue
      }

      const call = {
        contractAddress: config.ESCROW_ADDRESS,
        entrypoint: ENTRYPOINTS.settlePool,
        calldata: [pool.pool_id.toString()],
      }

      const wouldSucceed = await simulateCall([call])
      if (!wouldSucceed) {
        cooldown.markFailed(poolId)
        simFailed++
        continue
      }

      try {
        const txHash = await executeAndWait([call])
        cooldown.clear(poolId)
        results.push(`Settled pool #${poolId} — tx: ${txHash}`)
      } catch (err: any) {
        cooldown.markFailed(poolId)
        results.push(`Pool #${poolId} error: ${err?.message ?? err}`)
      }
    }

    const summary = [
      ...results,
      simFailed > 0 ? `${simFailed} pools not ready (on cooldown)` : '',
      skipped > 0 ? `${skipped} pools skipped (still on cooldown)` : '',
    ].filter(Boolean)

    return summary.length > 0
      ? `Settlement scan:\n${summary.join('\n')}`
      : `Checked ${candidates.length} pools — none ready for settlement.`
  },
})

// --- Capability: protocol_status ---
agent.addCapability({
  name: 'protocol_status',
  description:
    'Get a quick status summary of the Shobu protocol: open pools, settled pools, total volume.',
  inputSchema: z.object({}),
  async run() {
    const allPools = await fetchAllPools()

    const open = allPools.filter((p) => Number(p.status) === POOL_STATUS.OPEN)
    const settled = allPools.filter((p) => Number(p.status) === POOL_STATUS.SETTLED)
    const cancelled = allPools.filter((p) => Number(p.status) === POOL_STATUS.CANCELLED)

    const totalVolume = allPools.reduce(
      (sum, p) => sum + BigInt(p.total_pot || 0),
      0n
    )
    const openVolume = open.reduce(
      (sum, p) => sum + BigInt(p.total_pot || 0),
      0n
    )

    return [
      `## Shobu Protocol Status`,
      `- Total pools: ${allPools.length}`,
      `- Open: ${open.length} (volume: ${openVolume})`,
      `- Settled: ${settled.length}`,
      `- Cancelled: ${cancelled.length}`,
      `- Total lifetime volume: ${totalVolume}`,
    ].join('\n')
  },
})

// --- Capability: full_cycle ---
agent.addCapability({
  name: 'full_cycle',
  description:
    'Run a complete protocol management cycle: scan for new games → create pools → settle finished games → report status.',
  inputSchema: z.object({}),
  async run({ action }) {
    const reports: string[] = []

    // Step 1: Protocol status
    const allPools = await fetchAllPools()
    const open = allPools.filter((p) => Number(p.status) === POOL_STATUS.OPEN)
    reports.push(`📊 Protocol: ${allPools.length} pools (${open.length} open)`)

    // Step 2: Scan feed & create pools
    const config = getConfig()
    const nowSec = Math.floor(Date.now() / 1000)
    try {
      const response = await fetch(config.FEED_URL)
      if (response.ok) {
        const payload = await response.json()
        const entries = Array.isArray(payload)
          ? payload
          : payload?.games ?? payload?.data ?? []
        const existingKeys = new Set(
          allPools.map(
            (p) => `${normalizeAddress(p.game_world)}:${Number(p.game_id)}`
          )
        )
        const newGames = entries.filter((e: any) => {
          const gw = normalizeAddress(
            e.world_address ?? e.worldAddress ?? e.game_world ?? e.world
          )
          const gid = Number(e.game_id ?? e.gameId ?? e.id)
          return gw && !isNaN(gid) && !existingKeys.has(`${gw}:${gid}`)
        })
        reports.push(`🔍 Feed: ${entries.length} games, ${newGames.length} new`)

        let created = 0
        for (const entry of newGames) {
          if (created >= config.MAX_POOLS_PER_TICK) break
          const worldAddr = normalizeAddress(
            entry.world_address ?? entry.worldAddress ?? entry.game_world ?? entry.world
          )
          const gameId = Number(entry.game_id ?? entry.gameId ?? entry.id)
          const deadline = nowSec + config.DEFAULT_DEADLINE_SECONDS
          try {
            await executeAndWait([
              {
                contractAddress: config.ESCROW_ADDRESS,
                entrypoint: ENTRYPOINTS.createPool,
                calldata: [worldAddr, gameId.toString(), config.POOL_TOKEN, deadline.toString()],
              },
            ])
            created++
          } catch {
            // Skip failures silently in full_cycle
          }
        }
        if (created > 0) reports.push(`✅ Created ${created} new pools`)
      }
    } catch {
      reports.push('⚠️ Feed scan skipped (fetch error)')
    }

    // Step 3: Settle finished games (simulate first)
    const candidates = open.filter((p) => BigInt(p.total_pot || 0) > 0n)
    let settled = 0
    for (const pool of candidates) {
      const poolId = Number(pool.pool_id)
      if (cooldown.isOnCooldown(poolId)) continue

      const call = {
        contractAddress: config.ESCROW_ADDRESS,
        entrypoint: ENTRYPOINTS.settlePool,
        calldata: [pool.pool_id.toString()],
      }

      const wouldSucceed = await simulateCall([call])
      if (!wouldSucceed) {
        cooldown.markFailed(poolId)
        continue
      }

      try {
        await executeAndWait([call])
        cooldown.clear(poolId)
        settled++
      } catch {
        cooldown.markFailed(poolId)
      }
    }
    if (settled > 0) reports.push(`✅ Settled ${settled} pools`)

    // Step 4: AI summary
    const summary = await this.generate({
      prompt: `Summarize this Shobu protocol management cycle in 2-3 sentences:\n${reports.join('\n')}`,
      action,
    })

    return `${reports.join('\n')}\n\n### Summary\n${summary}`
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
    console.log('[orchestrator] Session bootstrap complete; exiting.')
    return
  }

  await provision({
    agent: {
      instance: agent,
      name: 'shobu-orchestrator',
      description:
        'Master coordinator for the Shobu betting protocol — manages the full pool lifecycle from creation through settlement and analysis.',
    },
    workflow: {
      name: 'Shobu Protocol Manager',
      trigger: triggers.cron({ schedule: '*/10 * * * *' }),
      task: {
        description:
          'Coordinate the full lifecycle of betting pools on the Shobu protocol: scan game feeds for new games, create betting pools, monitor and settle finished games, and generate market reports — all in a single coordinated workflow.',
      },
    },
  })

  dotenv.config({ override: true })

  await run(agent)
}

main().catch((err) => {
  console.error(
    '[orchestrator] fatal:',
    err instanceof Error ? err.message : err
  )
  process.exit(1)
})
