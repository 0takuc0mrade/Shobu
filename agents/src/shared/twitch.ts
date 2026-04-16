// -----------------------------------------------------------------------
// Shōbu Twitch Integration — Stream Discovery via Helix API
// -----------------------------------------------------------------------
// Queries the Twitch Helix API to discover live streams for watched
// games and channels, returning structured data the pool creator can
// use to automatically open Vision AI betting pools.
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface TwitchStream {
  /** Twitch stream ID */
  id: string
  /** Broadcaster's user login (channel name) */
  userLogin: string
  /** Broadcaster's display name */
  userName: string
  /** Game being played */
  gameName: string
  /** Game ID on Twitch */
  gameId: string
  /** Stream title */
  title: string
  /** Current viewer count  */
  viewerCount: number
  /** Stream start time */
  startedAt: string
  /** Thumbnail URL template */
  thumbnailUrl: string
  /** Full stream URL */
  streamUrl: string
  /** Whether the stream is live */
  isLive: boolean
}

export interface TwitchAuthToken {
  accessToken: string
  expiresAt: number
}

// -----------------------------------------------------------------------
// OAuth App Access Token (Client Credentials)
// -----------------------------------------------------------------------

let cachedToken: TwitchAuthToken | null = null

/**
 * Gets a valid Twitch app access token using Client Credentials flow.
 * Tokens are cached and automatically refreshed when expired.
 */
async function getAppAccessToken(): Promise<string> {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required')
  }

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken
  }

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Twitch OAuth failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  console.log('[twitch] ✅ OAuth token acquired (expires in', data.expires_in, 'seconds)')
  return cachedToken.accessToken
}

// -----------------------------------------------------------------------
// Helix API helpers
// -----------------------------------------------------------------------

function twitchHeaders(token: string): Record<string, string> {
  return {
    'Client-ID': process.env.TWITCH_CLIENT_ID!,
    Authorization: `Bearer ${token}`,
  }
}

/**
 * Get live streams for specific channel names.
 */
export async function getStreamsByChannel(
  channels: string[]
): Promise<TwitchStream[]> {
  if (channels.length === 0) return []

  const token = await getAppAccessToken()
  const params = new URLSearchParams()
  for (const ch of channels.slice(0, 100)) {
    params.append('user_login', ch)
  }

  const response = await fetch(
    `https://api.twitch.tv/helix/streams?${params.toString()}`,
    { headers: twitchHeaders(token) }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Twitch streams API failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return (data.data ?? []).map(mapStream)
}

/**
 * Get live streams for specific game IDs.
 */
export async function getStreamsByGame(
  gameIds: string[]
): Promise<TwitchStream[]> {
  if (gameIds.length === 0) return []

  const token = await getAppAccessToken()
  const params = new URLSearchParams()
  for (const gid of gameIds.slice(0, 10)) {
    params.append('game_id', gid)
  }
  params.set('first', '20')

  const response = await fetch(
    `https://api.twitch.tv/helix/streams?${params.toString()}`,
    { headers: twitchHeaders(token) }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Twitch streams API failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return (data.data ?? []).map(mapStream)
}

/**
 * Search for games on Twitch by name, returning their game IDs.
 */
export async function searchGames(
  query: string
): Promise<{ id: string; name: string }[]> {
  const token = await getAppAccessToken()

  const response = await fetch(
    `https://api.twitch.tv/helix/games?name=${encodeURIComponent(query)}`,
    { headers: twitchHeaders(token) }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Twitch games API failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return (data.data ?? []).map((g: any) => ({ id: g.id, name: g.name }))
}

/**
 * Get recent VODs for a channel.
 */
export async function getVods(
  userId: string,
  count: number = 5
): Promise<{ id: string; url: string; title: string; createdAt: string; duration: string }[]> {
  const token = await getAppAccessToken()

  const response = await fetch(
    `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=${count}`,
    { headers: twitchHeaders(token) }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Twitch VODs API failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return (data.data ?? []).map((v: any) => ({
    id: v.id,
    url: v.url,
    title: v.title,
    createdAt: v.created_at,
    duration: v.duration,
  }))
}

/**
 * Get user info by login name (needed for VOD lookups).
 */
export async function getUserByLogin(
  login: string
): Promise<{ id: string; displayName: string; login: string } | null> {
  const token = await getAppAccessToken()

  const response = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    { headers: twitchHeaders(token) }
  )

  if (!response.ok) return null

  const data = await response.json()
  const user = data.data?.[0]
  if (!user) return null

  return { id: user.id, displayName: user.display_name, login: user.login }
}

// -----------------------------------------------------------------------
// Internal mapping
// -----------------------------------------------------------------------

function mapStream(raw: any): TwitchStream {
  return {
    id: raw.id,
    userLogin: raw.user_login,
    userName: raw.user_name,
    gameName: raw.game_name,
    gameId: raw.game_id,
    title: raw.title,
    viewerCount: raw.viewer_count,
    startedAt: raw.started_at,
    thumbnailUrl: raw.thumbnail_url,
    streamUrl: `https://www.twitch.tv/${raw.user_login}`,
    isLive: raw.type === 'live',
  }
}

// -----------------------------------------------------------------------
// Well-known Twitch game IDs for esports titles
// -----------------------------------------------------------------------

export const TWITCH_GAME_IDS: Record<string, string> = {
  'League of Legends': '21779',
  'VALORANT': '516575',
  'Counter-Strike 2': '32399',  // CS:GO/CS2 share same ID
  'Fortnite': '33214',
  'Dota 2': '29595',
  'Shrapnel': '1817190156', // placeholder — update if known
}
