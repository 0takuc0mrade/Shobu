/**
 * Standalone Pistols FOCG scanner — creates Shobu betting pools
 * for any active (InProgress) duels found on the Pistols Torii endpoint.
 *
 * Usage:  npx tsx scan_pistols_now.ts [--dry-run]
 */
import dotenv from 'dotenv'
dotenv.config()

import { loadConfig } from './src/shared/config.js'
import { initSession, executeAndWait, normalizeAddress } from './src/shared/starknet.js'
import { fetchAllPools, type BettingPoolModel } from './src/shared/torii.js'
import { ENTRYPOINTS } from './src/shared/constants.js'

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const config = loadConfig()
  console.log('🔫 Pistols FOCG Pool Scanner')
  console.log(`   Adapter:  ${config.PISTOLS_ADAPTER_ADDRESS}`)
  console.log(`   Torii:    ${config.PISTOLS_TORII_URL}`)
  console.log(`   Escrow:   ${config.ESCROW_ADDRESS}`)
  console.log(`   Dry run:  ${DRY_RUN}\n`)

  if (!DRY_RUN) {
    console.log('⏳ Initialising Starknet session...')
    await initSession()
    console.log('✅ Session ready\n')
  }

  // 1. Query Pistols Torii for active duels
  const graphqlUrl = config.PISTOLS_TORII_URL.replace(/\/graphql\/?$/, '') + '/graphql'

  const query = `{
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

  console.log('📡 Querying Pistols Torii for duels...')
  const res = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) throw new Error(`Torii HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
    process.exit(1)
  }

  const allDuels = (json?.data?.pistolsChallengeModels?.edges ?? []).map((e: any) => e.node)
  const activeDuels = allDuels.filter(
    (d: any) => d && (d.state === 'InProgress' || d.state === 5)
  )

  console.log(`   Found ${allDuels.length} total duels, ${activeDuels.length} InProgress\n`)

  if (activeDuels.length === 0) {
    console.log('No active duels — nothing to do.')
    return
  }

  // 2. Fetch existing Shobu pools to avoid duplicates
  let existingPools: BettingPoolModel[] = []
  try {
    existingPools = await fetchAllPools()
    console.log(`   ${existingPools.length} existing Shobu pools on chain\n`)
  } catch (err: any) {
    console.warn(`⚠️  Could not fetch existing pools: ${err.message} — proceeding anyway\n`)
  }

  const adapterAddr = normalizeAddress(config.PISTOLS_ADAPTER_ADDRESS)
  const existingKeys = new Set(
    existingPools.map((p) => `${normalizeAddress(p.game_world)}:${Number(p.game_id)}`)
  )

  // 3. Create pools
  const nowSec = Math.floor(Date.now() / 1000)
  let created = 0

  for (const duel of activeDuels) {
    const duelId = Number(duel.duel_id)
    if (Number.isNaN(duelId) || duelId <= 0) continue

    const poolKey = `${adapterAddr}:${duelId}`
    if (existingKeys.has(poolKey)) {
      console.log(`⏩ Duel #${duelId}: pool already exists — re-deploying to extend deadline`)
    }

    const addrA = String(duel.address_a).slice(0, 12) + '...'
    const addrB = String(duel.address_b).slice(0, 12) + '...'
    const deadline = nowSec + 86400 // 24 hour window

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would create pool for duel #${duelId} (${addrA} vs ${addrB})`)
      created++
      continue
    }

    try {
      console.log(`🚀 Creating pool for duel #${duelId} (${addrA} vs ${addrB})...`)
      const txHash = await executeAndWait([{
        contractAddress: config.ESCROW_ADDRESS,
        entrypoint: ENTRYPOINTS.createPool,
        calldata: [
          adapterAddr,
          duelId.toString(),
          config.POOL_TOKEN,
          deadline.toString(),
        ],
      }])
      console.log(`   ✅ tx: ${txHash}`)
      created++
    } catch (err: any) {
      console.error(`   ❌ Failed: ${err?.message ?? err}`)
    }
  }

  console.log(`\n🏁 Done — ${created} pool(s) created.`)
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : JSON.stringify(err))
  process.exit(1)
})
