import dns from 'node:dns'
dns.setDefaultResultOrder('ipv4first')

import { getConfig } from './config.js'

export interface RiotMatch {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameEndTimestamp?: number;
    participants: Array<{
      puuid: string;
      riotIdGameName: string;
      riotIdTagline: string;
      win: boolean;
    }>;
  };
}

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface RiotActiveGame {
  gameId: number;
  participants: Array<{
    puuid: string;
    riotId: string;
  }>;
}

// For a global production app, these would be dynamic based on the region parameter.
// For testing, we default them based on the NA region standard.
const REGION_ROUTING = 'americas' 
const PLATFORM_ROUTING = 'na1' 

const MAX_RETRIES = 3
const FETCH_TIMEOUT_MS = 30_000

async function fetchRiot<T>(url: string): Promise<T | null> {
  const config = getConfig()
  if (!config.RIOT_API_KEY) {
    throw new Error('RIOT_API_KEY is not configured in .env')
  }

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'X-Riot-Token': config.RIOT_API_KEY },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (res.status === 404) return null
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10)
        console.warn(`[Riot API] Rate limited on ${url}, waiting ${retryAfter}s (attempt ${attempt}/${MAX_RETRIES})`)
        await new Promise(r => setTimeout(r, retryAfter * 1000))
        continue
      }
      if (!res.ok) {
        throw new Error(`Riot API failed: ${res.status} ${res.statusText}`)
      }

      return res.json() as Promise<T>
    } catch (err: any) {
      lastError = err
      if (err.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || err.name === 'TimeoutError') {
        console.warn(`[Riot API] Connect timeout on ${url} (attempt ${attempt}/${MAX_RETRIES}), retrying...`)
        await new Promise(r => setTimeout(r, attempt * 2000))
        continue
      }
      throw err // non-retryable error
    }
  }
  throw lastError ?? new Error(`Riot API failed after ${MAX_RETRIES} retries: ${url}`)
}

/**
 * Get Riot Account by Riot ID (GameName + TagLine)
 * Resolves regional routing to fetch PUUID.
 */
export async function getAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount | null> {
  const url = `https://${REGION_ROUTING}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  return fetchRiot<RiotAccount>(url)
}

/**
 * Get Match Details by Match ID (e.g. NA1_123456789)
 * Contains the outcome of the match and precise player statistics.
 */
export async function getMatchDetails(matchId: string): Promise<RiotMatch | null> {
  const url = `https://${REGION_ROUTING}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`
  return fetchRiot<RiotMatch>(url)
}

/**
 * Get Active Game by PUUID
 * NOTE: Requires a registered production API key (dev keys get 403).
 */
export async function getActiveGame(puuid: string): Promise<RiotActiveGame | null> {
  const url = `https://${PLATFORM_ROUTING}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`
  return fetchRiot<RiotActiveGame>(url)
}

/**
 * Get recent match IDs for a player's PUUID.
 * Works with development API keys (unlike spectator-v5).
 */
export async function getRecentMatches(puuid: string, count = 5): Promise<string[]> {
  const url = `https://${REGION_ROUTING}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?count=${count}`
  return (await fetchRiot<string[]>(url)) ?? []
}

/**
 * Get top Challenger players from the ranked ladder.
 * Works with development API keys.
 */
export async function getChallengerPlayers(count = 10): Promise<Array<{ puuid: string; leaguePoints: number; wins: number; losses: number }>> {
  const url = `https://${PLATFORM_ROUTING}.api.riotgames.com/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5`
  const data = await fetchRiot<{ entries: Array<{ puuid: string; leaguePoints: number; wins: number; losses: number }> }>(url)
  if (!data) return []
  return data.entries
    .sort((a, b) => b.leaguePoints - a.leaguePoints)
    .slice(0, count)
}

/**
 * Get Riot Winner Tag
 * Given a matchId and two competing player tags, returns the precise tag of the winner.
 * Throws an error if the match is not finalized or neither player won.
 */
export async function getRiotWinnerTag(matchId: string, player1Tag: string, player2Tag: string): Promise<string> {
  const matchData = await getMatchDetails(matchId);
  if (!matchData || !matchData.info || !matchData.info.participants) {
      throw new Error(`Riot Match ${matchId} is not accessible or not cleanly finalized yet.`);
  }

  const p1Stats = matchData.info.participants.find(p => 
      `${p.riotIdGameName}#${p.riotIdTagline}`.toLowerCase() === player1Tag.toLowerCase()
  );
  const p2Stats = matchData.info.participants.find(p => 
      `${p.riotIdGameName}#${p.riotIdTagline}`.toLowerCase() === player2Tag.toLowerCase()
  );

  if (p1Stats?.win) return player1Tag;
  if (p2Stats?.win) return player2Tag;

  throw new Error(`Could not confidently determine winner between ${player1Tag} and ${player2Tag} in match ${matchId}`);
}
