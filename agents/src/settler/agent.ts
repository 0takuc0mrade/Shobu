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
  fetchWeb2PoolById,
  type BettingPoolModel,
} from '../shared/torii.js'
import { ENTRYPOINTS, POOL_STATUS, SETTLEMENT_MODE } from '../shared/constants.js'
import { decodeShortString } from '../shared/encoding.js'
import { generateRiotReclaimProof } from '../shared/reclaim.js'
import { runVisionConsensus } from '../shared/vision-oracle.js'

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
      const mode = (() => {
        const m = Number(p.settlement_mode)
        if (m === SETTLEMENT_MODE.EGS) return 'EGS'
        if (m === SETTLEMENT_MODE.BUDOKAN) return 'Budokan'
        if (m === SETTLEMENT_MODE.WEB2_ZKTLS) return 'Web2'
        return 'Direct'
      })()
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

    const mode = (() => {
      const m = Number(pool.settlement_mode)
      if (m === SETTLEMENT_MODE.EGS) return 'EGS'
      if (m === SETTLEMENT_MODE.BUDOKAN) return 'Budokan'
      if (m === SETTLEMENT_MODE.WEB2_ZKTLS) return 'Web2'
      return 'Direct'
    })()
    return `Pool #${args.poolId} is open with pot=${pot}. Settlement mode=${mode}. Ready to attempt settlement.`
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
      const pool = await fetchPoolById(args.poolId)
      if (!pool) return `Pool #${args.poolId} not found.`

      if (Number(pool.settlement_mode) === SETTLEMENT_MODE.VISION_AI) {
        return `Pool #${args.poolId} uses the AI Vision Oracle constraint. Please use the 'settle_vision_pool' tool with an image URL instead of 'settle_pool'.`
      }

      if (Number(pool.settlement_mode) === SETTLEMENT_MODE.WEB2_ZKTLS) {
        const web2 = await fetchWeb2PoolById(args.poolId)
        if (!web2) return `Web2 metadata not found for pool #${args.poolId}.`

        const matchId = decodeShortString(web2.match_id, 'match_id')
        const player1Tag = decodeShortString(web2.player_1_tag, 'player_1_tag')
        const player2Tag = decodeShortString(web2.player_2_tag, 'player_2_tag')

        const { calldata: proofCalldata } = await generateRiotReclaimProof(
          matchId,
          player1Tag,
          player2Tag
        )
        const calldata = [args.poolId.toString(), ...proofCalldata]

        const txHash = await executeAndWait([
          {
            contractAddress: config.ESCROW_ADDRESS,
            entrypoint: ENTRYPOINTS.settleWeb2Pool,
            calldata,
          },
        ])
        return `Web2 pool #${args.poolId} settled — tx: ${txHash}`
      }

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

// --- Capability: settle_extraction_pool (Shrapnel Cross-Subnet Oracle) ---
agent.addCapability({
  name: 'settle_extraction_pool',
  description:
    'Settle a Shrapnel extraction pool by reading match events from the Avalanche Subnet and dispatching the settlement directly on Beam EVM.',
  inputSchema: z.object({
    poolId: z.number().int().describe('Pool ID on Beam to settle'),
    matchId: z.string().describe('Shrapnel Match ID to verify on Avalanche Subnet'),
    playerAddress: z.string().describe('Player Address on the Shrapnel network'),
    shrapnelMatchContract: z.string().describe('The Shrapnel stats smart contract tracking successful extractions')
  }),
  async run({ args }) {
    const config = getConfig()
    const poolId = args.poolId
    
    try {
      // Step 1: Read Layer (Avalanche Subnet)
      const { checkExtractionStatus } = await import('../shared/evm-adapter.js')
      const { extracted, sigma } = await checkExtractionStatus(
        args.shrapnelMatchContract as `0x${string}`, 
        args.matchId as `0x${string}`, 
        args.playerAddress as `0x${string}`
      )

      if (!extracted) {
        return `Player ${args.playerAddress} has not successfully extracted from match ${args.matchId} on the Shrapnel subsystem. Settlement cannot proceed.`
      }

      // Step 2: Write Layer (Beam Testnet) via the Orchestrator / Evm Adapter
      // Hot swap to the Beam network to settle the pool (Using EVM adapter internally)
      const { getEVMAdapter } = await import('../shared/evm-adapter.js')
      const adapter = getEVMAdapter()
      const beamEscrow = config.BEAM_ESCROW_ADDRESS! as `0x${string}`
      
      const txHash = await adapter.settlePool(beamEscrow, poolId, args.playerAddress as `0x${string}`)
      
      return `Cross-subnet settlement complete for Shrapnel pool #${poolId}! Player successfully extracted ${sigma} sigma. Beam TX: ${txHash}`
    } catch (err: any) {
      return `Cross-subnet execution failed for Shrapnel pool #${poolId}: ${err?.message ?? String(err)}`
    }
  }
})

// --- Capability: settle_vision_pool (AI Vision Oracle Consensus) ---
agent.addCapability({
  name: 'settle_vision_pool',
  description:
    'Settle a pool using the AI Vision Oracle. Accepts a screenshot URL or base64-encoded image of a game result screen. Runs 2-of-3 diverse-model consensus (Gemini + Gemma + Llama) and only settles if models agree.',
  inputSchema: z.object({
    poolId: z.number().int().describe('Pool ID to settle'),
    imageUrl: z.string().optional().describe('URL to a screenshot of the game result (e.g., Twitch VOD frame)'),
    imageBase64: z.string().optional().describe('Base64-encoded image data (alternative to imageUrl)'),
    mimeType: z.string().optional().describe('MIME type of the image (default: image/png)'),
    prompt: z.string().optional().describe('Custom prompt for the vision models (optional)'),
  }),
  async run({ args }) {
    const config = getConfig()
    const { poolId, imageUrl, imageBase64, prompt } = args
    const mime = args.mimeType ?? 'image/png'

    // Validate pool exists and is open
    const pool = await fetchPoolById(poolId)
    if (!pool) return `Pool #${poolId} not found.`
    if (Number(pool.status) !== POOL_STATUS.OPEN)
      return `Pool #${poolId} is not open (status=${pool.status}).`

    // Get the image as base64
    let base64: string
    if (imageBase64) {
      base64 = imageBase64
    } else if (imageUrl) {
      try {
        const imgResponse = await fetch(imageUrl)
        if (!imgResponse.ok)
          return `Failed to fetch image from URL: ${imgResponse.status}`
        const buffer = await imgResponse.arrayBuffer()
        base64 = Buffer.from(buffer).toString('base64')
      } catch (err: any) {
        return `Failed to download image: ${err?.message ?? err}`
      }
    } else {
      return 'Either imageUrl or imageBase64 must be provided.'
    }

    // Run the 2-of-3 consensus
    console.log(`[settler] 🔍 Running AI Vision Oracle for pool #${poolId}...`)
    const result = await runVisionConsensus(base64, mime, prompt)

    if (!result.consensus) {
      return [
        `🚨 Vision Oracle DISPUTE for pool #${poolId} — no 2-of-3 consensus reached.`,
        `Gemini: ${JSON.stringify(result.votes.gemini)}`,
        `Gemma:  ${JSON.stringify(result.votes.gemma)}`,
        `Llama:  ${JSON.stringify(result.votes.llama)}`,
        `Pool remains OPEN. Manual review or retry with a cleaner screenshot recommended.`,
      ].join('\n')
    }

    const verdict = result.verdict!
    console.log(`[settler] ✅ Consensus reached for pool #${poolId}: ${JSON.stringify(verdict)} (${result.agreeing_models.join(' + ')})`)

    // Determine the winner based on the extraction outcome
    // For extraction-style games: extracted=true means player 1 wins
    const winner = verdict.extracted ? 1 : 2

    try {
      const txHash = await executeAndWait([
        {
          contractAddress: config.ESCROW_ADDRESS,
          entrypoint: ENTRYPOINTS.settlePool,
          calldata: [poolId.toString(), winner.toString()],
        },
      ])

      return [
        `✅ Vision Oracle settled pool #${poolId}`,
        `Winner: Player ${winner} (extracted=${verdict.extracted}, sigma=${verdict.sigma_banked})`,
        `Consensus: ${result.agreeing_models.join(' + ')} (${result.agreeing_models.length}/3)`,
        `TX: ${txHash}`,
      ].join('\n')
    } catch (err: any) {
      return `Vision consensus passed but on-chain settlement failed for pool #${poolId}: ${err?.message ?? err}`
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

      let call: { contractAddress: string; entrypoint: string; calldata: string[] }
      try {
        if (Number(pool.settlement_mode) === SETTLEMENT_MODE.VISION_AI) {
          // Vision AI pools require explicit screenshot submission via settle_vision_pool, skip auto-settle
          skipped++
          continue
        } else if (Number(pool.settlement_mode) === SETTLEMENT_MODE.WEB2_ZKTLS) {
          const web2 = await fetchWeb2PoolById(poolId)
          if (!web2) {
            cooldown.markFailed(poolId)
            results.push(`Pool #${poolId} missing Web2 metadata`)
            continue
          }

          const matchId = decodeShortString(web2.match_id, 'match_id')
          const player1Tag = decodeShortString(web2.player_1_tag, 'player_1_tag')
          const player2Tag = decodeShortString(web2.player_2_tag, 'player_2_tag')

          const { calldata: proofCalldata } = await generateRiotReclaimProof(
            matchId,
            player1Tag,
            player2Tag
          )
          call = {
            contractAddress: config.ESCROW_ADDRESS,
            entrypoint: ENTRYPOINTS.settleWeb2Pool,
            calldata: [poolId.toString(), ...proofCalldata],
          }
        } else {
          call = {
            contractAddress: config.ESCROW_ADDRESS,
            entrypoint: ENTRYPOINTS.settlePool,
            calldata: [pool.pool_id.toString()],
          }
        }
      } catch (err: any) {
        const msg = err?.message ?? String(err)
        cooldown.markFailed(poolId)
        results.push(`Pool #${poolId} proof/error: ${msg}`)
        continue
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
// Local autonomous loop (bypasses OpenServ tunnel)
// -----------------------------------------------------------------------

const SETTLE_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes

async function runSettleCycle() {
  console.log(`[settler] ⏱ Starting settle cycle at ${new Date().toISOString()}`)
  try {
    const config = getConfig()
    const pools = await fetchOpenPools()

    if (pools.length === 0) {
      console.log('[settler] No open pools to settle.')
      return
    }

    const candidates = pools.filter((p) => BigInt(p.total_pot || 0) > 0n)
    if (candidates.length === 0) {
      console.log(`[settler] Found ${pools.length} open pools but none have bets.`)
      return
    }

    let settled = 0
    let skipped = 0
    let simFailed = 0

    for (const pool of candidates) {
      const poolId = Number(pool.pool_id)
      if (cooldown.isOnCooldown(poolId)) {
        skipped++
        continue
      }

      let call: { contractAddress: string; entrypoint: string; calldata: string[] }
      try {
        if (Number(pool.settlement_mode) === SETTLEMENT_MODE.VISION_AI) {
          skipped++ // Autonomous background loop cannot resolve Vision AI without an image hook
          continue
        } else if (Number(pool.settlement_mode) === SETTLEMENT_MODE.WEB2_ZKTLS) {
          const web2 = await fetchWeb2PoolById(poolId)
          if (!web2) {
            cooldown.markFailed(poolId)
            continue
          }
          const matchId = decodeShortString(web2.match_id, 'match_id')
          const player1Tag = decodeShortString(web2.player_1_tag, 'player_1_tag')
          const player2Tag = decodeShortString(web2.player_2_tag, 'player_2_tag')
          const { calldata: proofCalldata } = await generateRiotReclaimProof(matchId, player1Tag, player2Tag)
          call = {
            contractAddress: config.ESCROW_ADDRESS,
            entrypoint: ENTRYPOINTS.settleWeb2Pool,
            calldata: [poolId.toString(), ...proofCalldata],
          }
        } else {
          call = {
            contractAddress: config.ESCROW_ADDRESS,
            entrypoint: ENTRYPOINTS.settlePool,
            calldata: [pool.pool_id.toString()],
          }
        }
      } catch (err: any) {
        cooldown.markFailed(poolId)
        continue
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
        settled++
        console.log(`[settler] ✅ Settled pool #${poolId} — tx: ${txHash}`)
      } catch (err: any) {
        cooldown.markFailed(poolId)
      }
    }

    const parts = [
      `checked ${candidates.length} pools`,
      settled > 0 ? `settled ${settled}` : null,
      simFailed > 0 ? `${simFailed} not ready` : null,
      skipped > 0 ? `${skipped} on cooldown` : null,
    ].filter(Boolean)
    console.log(`[settler] 🏁 ${parts.join(', ')}`)
  } catch (err: any) {
    console.error(`[settler] ❌ Cycle error: ${err?.message ?? err}`)
  }
}

async function main() {
  const config = loadConfig()

  // Initialize Cartridge Controller session
  await initSession()
  if (config.EXIT_AFTER_SESSION) {
    console.log('[settler] Session bootstrap complete; exiting.')
    return
  }

  console.log(`[settler] 🚀 Running in local autonomous mode (interval: ${SETTLE_INTERVAL_MS / 1000}s)`)

  // Run first cycle immediately
  await runSettleCycle()

  // Then run on interval
  setInterval(() => {
    runSettleCycle().catch((err) =>
      console.error('[settler] interval error:', err?.message ?? err)
    )
  }, SETTLE_INTERVAL_MS)
}

main().catch((err) => {
  console.error('[settler] fatal:', err instanceof Error ? err.message : err)
  process.exit(1)
})
