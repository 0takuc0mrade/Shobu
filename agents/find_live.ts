import dotenv from 'dotenv'
import dns from 'node:dns'
dns.setDefaultResultOrder('ipv4first')
dotenv.config()
import { executeAndWait, initSession } from './src/shared/starknet.js'
import { getConfig } from './src/shared/config.js'
import { ENTRYPOINTS } from './src/shared/constants.js'
import { encodeShortString } from './src/shared/encoding.js'

/**
 * Finds a recent Challenger-level match via league-v4 + match-v5
 * (spectator-v5 requires a registered production key) and creates
 * a betting pool from it.
 */
async function run() {
  const config = getConfig()
  await initSession()

  const riotKey = config.RIOT_API_KEY as string
  const headers = { 'X-Riot-Token': riotKey }

  // ── Step 1: Get top Challenger players ──────────────────────────
  console.log('Fetching Challenger ladder from Riot APIs...')
  const ladderRes = await fetch(
    'https://na1.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5',
    { headers }
  )
  if (!ladderRes.ok) {
    console.error('Failed to fetch Challenger ladder:', ladderRes.status, await ladderRes.text())
    return
  }
  const ladder = await ladderRes.json()
  const topPlayers = ladder.entries
    .sort((a: any, b: any) => b.leaguePoints - a.leaguePoints)
    .slice(0, 10)

  // ── Step 2: Find a recent match from a top player ───────────────
  let matchId: string | null = null
  let matchData: any = null

  for (const player of topPlayers) {
    console.log(`  Checking recent matches for PUUID ${player.puuid.slice(0, 16)}...`)
    const matchListRes = await fetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${player.puuid}/ids?count=1`,
      { headers }
    )
    if (!matchListRes.ok) continue
    const matchIds: string[] = await matchListRes.json()
    if (!matchIds.length) continue

    const detailRes = await fetch(
      `https://americas.api.riotgames.com/lol/match/v5/matches/${matchIds[0]}`,
      { headers }
    )
    if (!detailRes.ok) continue

    matchData = await detailRes.json()
    // Only use CLASSIC (Summoner's Rift) matches
    if (matchData.info.gameMode === 'CLASSIC') {
      matchId = matchIds[0]
      break
    }
  }

  if (!matchId || !matchData) {
    console.log('No suitable recent Challenger match found.')
    return
  }

  // ── Step 3: Extract match info ──────────────────────────────────
  const participants = matchData.info.participants
  const team100 = participants.filter((p: any) => p.teamId === 100)
  const team200 = participants.filter((p: any) => p.teamId === 200)

  const p1 = team100[0]
  const p2 = team200[0]
  const p1Name = `${p1.riotIdGameName}#${p1.riotIdTagline}`
  const p2Name = `${p2.riotIdGameName}#${p2.riotIdTagline}`
  const duration = matchData.info.gameDuration

  console.log(`\n🎮 Found Challenger match: ${matchId}`)
  console.log(`   ${p1Name} (Team 1) vs ${p2Name} (Team 2)`)
  console.log(`   Duration: ${Math.floor(duration / 60)}m ${duration % 60}s`)
  console.log(`   Winner: Team ${participants.find((p: any) => p.win)?.teamId === 100 ? '1' : '2'}`)

  // ── Step 4: Create betting pool on-chain ────────────────────────
  const deadline = Math.floor(Date.now() / 1000) + 1800 // 30 minutes to bet

  const addr1 = config.CARTRIDGE_ADDRESS || '0x06b14d3c501353277cE408F0b2c4199f1450a4cC58e7114a628754De04F3782E'
  const addr2 = '0x06b14d3c501353277cE408F0b2c4199f1450a4cC58e7114a628754De04F3782F'

  const calldata = [
    encodeShortString(matchId, 'match_id'),
    encodeShortString('RIOT_LOL', 'game_provider_id'),
    config.POOL_TOKEN as string,
    deadline.toString(),
    addr1,
    addr2,
    encodeShortString(p1Name.slice(0, 31), 'player_1_tag'),
    encodeShortString(p2Name.slice(0, 31), 'player_2_tag'),
  ]

  console.log(`\n🏗️  Creating pool for match: ${matchId}`)
  const txHash = await executeAndWait([{
    contractAddress: config.ESCROW_ADDRESS as string,
    entrypoint: ENTRYPOINTS.createWeb2Pool,
    calldata
  }])
  console.log(`💸 Riot match pool created! TX: ${txHash}`)
}

run()
