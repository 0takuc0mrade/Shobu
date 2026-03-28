/**
 * Debug script — simulates a create_pool call to get the revert reason.
 */
import dotenv from 'dotenv'
dotenv.config()

import { loadConfig } from './src/shared/config.js'
import { initSession, getSessionAccount, getProvider, normalizeAddress } from './src/shared/starknet.js'
import { ENTRYPOINTS } from './src/shared/constants.js'
import type { Call } from 'starknet'

async function main() {
  const config = loadConfig()
  await initSession()

  const account = getSessionAccount()
  console.log(`Session address: ${account.address}`)

  const adapterAddr = normalizeAddress(config.PISTOLS_ADAPTER_ADDRESS)
  const duelId = 150 // one of the active duels
  const deadline = Math.floor(Date.now() / 1000) + 1800

  const call: Call = {
    contractAddress: config.ESCROW_ADDRESS,
    entrypoint: ENTRYPOINTS.createPool,
    calldata: [
      adapterAddr,
      duelId.toString(),
      config.POOL_TOKEN,
      deadline.toString(),
    ],
  }

  console.log(`\nCall:`, JSON.stringify(call, null, 2))

  console.log('\n🔍 Estimating fee (simulation)...')
  try {
    const fee = await account.estimateInvokeFee([call])
    console.log(`✅ Simulation passed! Fee: ${fee.overall_fee}`)
  } catch (err: any) {
    console.error(`❌ Simulation FAILED`)
    console.error(`   Message: ${err?.message}`)
    if (err?.data) console.error(`   Data:`, JSON.stringify(err.data, null, 2))
    if (err?.revert_reason) console.error(`   Revert reason: ${err.revert_reason}`)
    // Try to extract the full error object
    const str = JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
    console.error(`   Full error:`, str.slice(0, 3000))
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
