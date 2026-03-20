import dotenv from 'dotenv'
dotenv.config()

import { loadConfig, getConfig } from './shared/config.js'
import { initSession, executeAndWait, normalizeAddress, getSessionAccount } from './shared/starknet.js'
import { fetchAllPools } from './shared/torii.js'
import { ENTRYPOINTS } from './shared/constants.js'

async function tryIt() {
  const config = loadConfig()
  await initSession()
  const agentAddress = getSessionAccount().address;
  console.log(`[TEST] Agent Cartridge Address: ${agentAddress}`);

  const toriiUrl = "https://api.cartridge.gg/x/dark-waters/torii";
  const graphqlUrl = toriiUrl.replace(/\/graphql\/?$/, '') + '/graphql'
  const worldAddress = normalizeAddress("0xef4aa6462fc34fcba0a18b49973bc83004757cc59c9940412efddae68b9637")
  
  console.log(`[TEST] Introspecting ${graphqlUrl}...`)
  const introRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __schema { queryType { fields { name } } } }' })
  })
  
  if (!introRes.ok) {
    console.log("Introspection failed:", introRes.status, introRes.statusText)
    return
  }
  
  const intro = await introRes.json()
  const fields = intro?.data?.__schema?.queryType?.fields ?? []
  const sessionQuery = fields.find((f: any) => f.name && (f.name.toLowerCase().endsWith('sessionlinkedmodels') || f.name.toLowerCase().endsWith('sessionlinkmodels')))
  
  if (!sessionQuery) {
    console.log("Could not find any *SessionlinkedModels query!")
    return
  }
  
  const queryName = sessionQuery.name
  console.log(`[TEST] Found native EGS query: ${queryName}. Fetching data...`)
  
  const fetchRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `{ ${queryName}(limit: 1000) { edges { node { token_id game_id } } } }`
    })
  })
  
  if (!fetchRes.ok) {
     console.log("Data fetch failed:", fetchRes.status)
     return
  }
  
  const sessionData = await fetchRes.json()
  const edges = sessionData?.data?.[queryName]?.edges ?? []
  
  console.log(`[TEST] Scraped ${edges.length} SessionLinked entities! Grouping...`)
  
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
  
  console.log("\n--- EGS Match Results & Deployment ---")
  const strkToken = normalizeAddress(config.POOL_TOKEN)
  const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour buffer for test pools

  const existingPools = await fetchAllPools()

  for (const [gIdNum, sessionTokens] of sessionsByGame.entries()) {
     if (sessionTokens.length === 2 && sessionTokens[0] !== sessionTokens[1]) {
       console.log(`\n🏆 [MATCH FOUND] Game ID: ${gIdNum} -> 1v1 Lobby FULL.`)
       
       if (existingPools.some(p => Number(p.game_id) === gIdNum)) {
          console.log(`[SKIP] Shobu Betting Pool for Game ID ${gIdNum} already exists on-chain!`)
          continue
       }

       console.log(`[DEPLOY] Broadcasting createEgsPool tx to Starknet...`)
       try {
         const tx = await executeAndWait([
           {
             contractAddress: config.ESCROW_ADDRESS,
             entrypoint: ENTRYPOINTS.createEgsPool,
             calldata: [
               worldAddress,
               gIdNum.toString(),
               strkToken,
               deadline.toString(),
               sessionTokens[0],
               sessionTokens[1]
             ]
           }
         ])
         console.log(`✅ [SUCCESS] Shobu Pool deployed! TX: ${tx}`)
       } catch (err: any) {
         console.error(`❌ [FAILED] Starknet TX Error:`, err?.message ?? err)
       }

     } else {
       console.log(`⏳ [WAITING] Game ID: ${gIdNum} -> Only has ${sessionTokens.length} player(s) joined so far.`)
     }
  }
}

tryIt().catch(console.error)
