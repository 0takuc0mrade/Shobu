// -----------------------------------------------------------------------
// Shōbu YouTube Integration — Live Stream Discovery via Data API v3
// -----------------------------------------------------------------------
// Queries the YouTube Data API v3 to discover live esports streams
// and recent VODs. Replaces the Twitch Helix API dependency when
// Twitch credentials are unavailable.
// -----------------------------------------------------------------------

export interface YouTubeStream {
  /** YouTube video/stream ID */
  videoId: string
  /** Channel name */
  channelTitle: string
  /** Channel ID */
  channelId: string
  /** Stream/video title */
  title: string
  /** Stream description snippet */
  description: string
  /** Thumbnail URL */
  thumbnailUrl: string
  /** Full watch URL */
  watchUrl: string
  /** Whether this was found via live search */
  isLive: boolean
  /** Published/started at */
  publishedAt: string
}

// -----------------------------------------------------------------------
// YouTube Data API v3 helpers
// -----------------------------------------------------------------------

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3'

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY is required')
  return key
}

/**
 * Search for live streams by game/esports query.
 * Uses the search endpoint with type=video and eventType=live.
 */
export async function searchLiveStreams(
  query: string,
  maxResults: number = 5
): Promise<YouTubeStream[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    eventType: 'live',
    maxResults: maxResults.toString(),
    order: 'viewCount',
    key: getApiKey(),
  })

  const response = await fetch(`${YT_API_BASE}/search?${params}`)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`YouTube search API failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return (data.items ?? []).map(mapSearchResult)
}

/**
 * Search for recent VODs/uploads for a game query.
 * Useful for finding match highlight clips and replays.
 */
export async function searchRecentVideos(
  query: string,
  maxResults: number = 5
): Promise<YouTubeStream[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    order: 'date',
    maxResults: maxResults.toString(),
    publishedAfter: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    key: getApiKey(),
  })

  const response = await fetch(`${YT_API_BASE}/search?${params}`)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`YouTube search API failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return (data.items ?? []).map((item: any) => ({
    ...mapSearchResult(item),
    isLive: false,
  }))
}

/**
 * Search for live streams across multiple game titles.
 * Returns deduplicated results sorted by relevance.
 */
export async function discoverEsportsStreams(
  games?: string[]
): Promise<YouTubeStream[]> {
  const defaultGames = [
    'League of Legends esports live',
    'VALORANT esports tournament live',
    'CS2 esports live match',
    'Dota 2 tournament live',
  ]

  const queries = games ?? defaultGames
  const allStreams: YouTubeStream[] = []
  const seen = new Set<string>()

  for (const query of queries) {
    try {
      const streams = await searchLiveStreams(query, 3)
      for (const stream of streams) {
        if (!seen.has(stream.videoId)) {
          seen.add(stream.videoId)
          allStreams.push(stream)
        }
      }
    } catch (err: any) {
      console.warn(`[youtube] Search failed for "${query}": ${err?.message}`)
    }
  }

  return allStreams
}

// -----------------------------------------------------------------------
// Internal mapping
// -----------------------------------------------------------------------

function mapSearchResult(item: any): YouTubeStream {
  const videoId = item.id?.videoId ?? item.id
  return {
    videoId,
    channelTitle: item.snippet?.channelTitle ?? '',
    channelId: item.snippet?.channelId ?? '',
    title: item.snippet?.title ?? '',
    description: item.snippet?.description ?? '',
    thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    isLive: true,
    publishedAt: item.snippet?.publishedAt ?? '',
  }
}
