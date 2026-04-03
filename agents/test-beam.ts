import dotenv from 'dotenv'
dotenv.config()

import { getEVMAdapter } from './src/shared/evm-adapter.js'
import { loadConfig } from './src/shared/config.js'

async function main() {
  const config = loadConfig()
  
  console.log("Triggering Beam market creation...")
  const adapter = getEVMAdapter()
  
  const beamEscrow = (process.env.BEAM_ESCROW_ADDRESS || '0xa7C48fA122879C8EBC0e3e80f60995AEB7Fe19e7') as `0x${string}`
  const beamToken = (process.env.BEAM_TOKEN_ADDRESS || '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') as `0x${string}`
  
  const p1 = '0x0000000000000000000000000000000000000001' as `0x${string}`
  const p2 = '0x0000000000000000000000000000000000000002' as `0x${string}`
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

  try {
    const txHash = await adapter.createPool(beamEscrow, beamToken, p1, p2, deadline)
    console.log(`✅ EVM Pool created on Beam Testnet!`)
    console.log(`✅ TX Hash: ${txHash}`)
  } catch (err: any) {
    console.error(`❌ Failed to create pool:`, err?.message ?? err)
  }
}

main().catch(err => {
  console.error("Fatal:", err)
  process.exit(1)
})
