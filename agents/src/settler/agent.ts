import dotenv from 'dotenv'
dotenv.config()

import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'

import { loadConfig, getConfig } from '../shared/config.js'
import { initSession, executeAndWait, simulateCall, SettlementCooldown } from '../shared/starknet.js'
import {
  fetchOpenPools,
  fetchPoolById,
  type BettingPoolModel,
} from '../shared/torii.js'
import { ENTRYPOINTS, POOL_STATUS, SETTLEMENT_MODE } from '../shared/constants.js'

// -----------------------------------------------------------------------
// Settlement cooldown — prevents retrying recently-failed pools
// -----------------------------------------------------------------------

const cooldown = new SettlementCooldown(10 * 60 * 1000) // 10 minutes

// -----------------------------------------------------------------------
// Agent definition
// -----------------------------------------------------------------------

const agent = new Agent({
  systemPrompt: `You are the Shobu Settler agent. Your job is to monitor open betting pools and automatically settle them when their underlying games have finished. Settlement is permissionless — anyone can call settle_pool once the game is done. You run on a frequent cron schedule to ensure fast settlement.`,
})

// --- Capability: list_open_pools ---
agent.addCapability({
  name: 'list_open_pools',
  description:
    'List all currently open betting pools from the Torii indexer.',
  inputSchema: z.object({}),
  async run() {
    const pools = await fetchOpenPools()
    if (pools.length === 0) return 'No open pools found.'

    const lines = pools.map((p) => {
      const pot = BigInt(p.total_pot || 0)
      const bettors = Number(p.bettor_count_p1 || 0) + Number(p.bettor_count_p2 || 0)
      const mode =
        Number(p.settlement_mode) === SETTLEMENT_MODE.EGS ? 'EGS' : 'Direct'
      return `Pool #${p.pool_id} | game_id=${p.game_id} | pot=${pot} | bettors=${bettors} | mode=${mode} | deadline=${p.deadline}`
    })
    return `Open pools (${pools.length}):\n${lines.join('\n')}`
  },
})

// --- Capability: check_game_status ---
agent.addCapability({
  name: 'check_game_status',
  description:
    'Check whether a specific pool\'s game has finished and is ready for settlement.',
  inputSchema: z.object({
    poolId: z.number().int().describe('Pool ID to check'),
  }),
  async run({ args }) {
    const pool = await fetchPoolById(args.poolId)
    if (!pool) return `Pool #${args.poolId} not found.`

    if (Number(pool.status) !== POOL_STATUS.OPEN)
      return `Pool #${args.poolId} is not open (status=${pool.status}).`

    const pot = BigInt(pool.total_pot || 0)
    if (pot === 0n)
      return `Pool #${args.poolId} is open but has no bets — cannot settle an empty pool.`

    return `Pool #${args.poolId} is open with pot=${pot}. Settlement mode=${Number(pool.settlement_mode) === SETTLEMENT_MODE.EGS ? 'EGS' : 'Direct'}. Ready to attempt settlement.`
  },
})

// --- Capability: settle_pool ---
agent.addCapability({
  name: 'settle_pool',
  description:
    'Settle a specific pool by calling the on-chain settle_pool function. The transaction will revert if the game hasn\'t finished yet.',
  inputSchema: z.object({
    poolId: z.number().int().describe('Pool ID to settle'),
  }),
  async run({ args }) {
    const config = getConfig()
    try {
      const txHash = await executeAndWait([
        {
          contractAddress: config.ESCROW_ADDRESS,
          entrypoint: ENTRYPOINTS.settlePool,
          calldata: [args.poolId.toString()],
        },
      ])
      return `Pool #${args.poolId} settled — tx: ${txHash}`
    } catch (err: any) {
      return `Settlement failed for pool #${args.poolId}: ${err?.message ?? err}`
    }
  },
})

// --- Capability: auto_settle ---
agent.addCapability({
  name: 'auto_settle',
  description:
    'Scan all open pools, simulate settlement (free RPC call), and only execute for pools whose games have finished. Failed pools are put on a 10-minute cooldown.',
  inputSchema: z.object({}),
  async run() {
    const config = getConfig()
    const pools = await fetchOpenPools()

    if (pools.length === 0) return 'No open pools to settle.'

    // Only try pools that have bets
    const candidates = pools.filter(
      (p) => BigInt(p.total_pot || 0) > 0n
    )

    if (candidates.length === 0)
      return `Found ${pools.length} open pools but none have bets.`

    const results: string[] = []
    let skipped = 0
    let simFailed = 0

    for (const pool of candidates) {
      const poolId = Number(pool.pool_id)

      // Skip pools on cooldown from recent failures
      if (cooldown.isOnCooldown(poolId)) {
        skipped++
        continue
      }

      const call = {
        contractAddress: config.ESCROW_ADDRESS,
        entrypoint: ENTRYPOINTS.settlePool,
        calldata: [pool.pool_id.toString()],
      }

      // Simulate first — free RPC call, no gas spent
      const wouldSucceed = await simulateCall([call])
      if (!wouldSucceed) {
        cooldown.markFailed(poolId)
        simFailed++
        continue
      }

      // Simulation passed — execute for real
      try {
        const txHash = await executeAndWait([call])
        cooldown.clear(poolId)
        results.push(`Settled pool #${poolId} — tx: ${txHash}`)
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        cooldown.markFailed(poolId)
        results.push(`Pool #${poolId} execution error: ${msg}`)
      }
    }

    const summary = [
      ...results,
      simFailed > 0 ? `${simFailed} pools not ready (simulation failed, on 10m cooldown)` : '',
      skipped > 0 ? `${skipped} pools skipped (still on cooldown)` : '',
    ].filter(Boolean)

    if (summary.length === 0)
      return `Checked ${candidates.length} pools — none ready for settlement yet.`
    return summary.join('\n')
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
    console.log('[settler] Session bootstrap complete; exiting.')
    return
  }

  await provision({
    agent: {
      instance: agent,
      name: 'shobu-settler',
      description:
        'Monitors open betting pools and automatically settles them when their underlying games finish. Settlement is permissionless.',
    },
    workflow: {
      name: 'Shobu Auto Settler',
      trigger: triggers.cron({ schedule: '*/2 * * * *' }),
      task: {
        description:
          'Continuously scan open betting pools on the Shobu protocol. For each pool whose game has finished, call the permissionless settle_pool function to finalize the result and enable winner payouts.',
      },
    },
  })

  dotenv.config({ override: true })

  await run(agent)
}

main().catch((err) => {
  console.error('[settler] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
