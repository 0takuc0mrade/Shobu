import dotenv from 'dotenv'
dotenv.config()

import { loadConfig, getConfig } from './shared/config.js'
import { initSession, getSessionAccount, getProvider, normalizeAddress } from './shared/starknet.js'
import { ENTRYPOINTS } from './shared/constants.js'
import { encodeShortString } from './shared/encoding.js'
import type { Call } from 'starknet'

async function main() {
  const config = loadConfig()
  await initSession()

  const matchId    = process.argv[2] || 'NA1_1234567'
  const player1Tag = process.argv[3] || 'TestPlayer1#NA1'
  const player2Tag = process.argv[4] || 'TestPlayer2#NA1'

  const deadline = Math.floor(Date.now() / 1000) + 3600
  const creatorAddr = config.RIOT_POOL_CREATOR_ADDRESS || config.CARTRIDGE_ADDRESS

  console.log(`\n🎮 Creating Web2 pool:`)
  console.log(`   Match:    ${matchId}`)
  console.log(`   Player 1: ${player1Tag}`)
  console.log(`   Player 2: ${player2Tag}`)
  console.log(`   Deadline: ${new Date(deadline * 1000).toLocaleString()}`)
  console.log(`   Creator:  ${creatorAddr}`)
  console.log(`   Escrow:   ${config.ESCROW_ADDRESS}`)

  const encodedMatchId = encodeShortString(matchId, 'match_id')
  const encodedProvider = encodeShortString('RIOT_LOL', 'game_provider_id')
  const encodedP1 = encodeShortString(player1Tag, 'player_1_tag')
  const encodedP2 = encodeShortString(player2Tag, 'player_2_tag')

  console.log(`\n   Encoded match_id:  ${encodedMatchId}`)
  console.log(`   Encoded provider:  ${encodedProvider}`)
  console.log(`   Encoded p1_tag:    ${encodedP1}`)
  console.log(`   Encoded p2_tag:    ${encodedP2}`)

  // Contract requires player1 != player2, so use two distinct addresses
  const player1Addr = normalizeAddress(creatorAddr)
  // Derive a dummy second address by incrementing the last byte
  const player2Addr = player1Addr.slice(0, -1) + (player1Addr.endsWith('e') ? 'f' : 'e')

  const call: Call = {
    contractAddress: config.ESCROW_ADDRESS,
    entrypoint: ENTRYPOINTS.createWeb2Pool,
    calldata: [
      encodedMatchId,
      encodedProvider,
      normalizeAddress(config.POOL_TOKEN),
      deadline.toString(),
      player1Addr,
      player2Addr,
      encodedP1,
      encodedP2,
    ],
  }

  console.log(`\n📋 Full calldata:`, call.calldata)

  const account = getSessionAccount()

  // Step 1: Simulate first
  console.log('\n🔍 Simulating transaction...')
  try {
    const fee = await account.estimateInvokeFee([call])
    console.log(`✅ Simulation passed! Estimated fee: ${fee.overall_fee}`)
  } catch (simErr: any) {
    console.error(`❌ Simulation FAILED:`)
    console.error(`   Message: ${simErr?.message ?? simErr}`)
    if (simErr?.data) console.error(`   Data:`, JSON.stringify(simErr.data, null, 2))
    if (simErr?.revert_reason) console.error(`   Revert: ${simErr.revert_reason}`)
    process.exit(1)
  }

  // Step 2: Execute
  console.log('\n🚀 Executing transaction...')
  try {
    const { transaction_hash } = await account.execute([call])
    console.log(`   tx hash: ${transaction_hash}`)
    const provider = getProvider()
    await provider.waitForTransaction(transaction_hash)
    console.log(`✅ Web2 pool created! tx: ${transaction_hash}`)
  } catch (execErr: any) {
    console.error(`❌ Execution FAILED:`)
    console.error(`   Type: ${execErr?.constructor?.name}`)
    console.error(`   Message: ${execErr?.message ?? JSON.stringify(execErr)}`)
    if (execErr?.data) console.error(`   Data:`, JSON.stringify(execErr.data, null, 2))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('❌ Uncaught:', err instanceof Error ? err.message : JSON.stringify(err))
  process.exit(1)
})
