import { NextRequest, NextResponse } from 'next/server'
import { PlatformClient } from '@openserv-labs/client'

/**
 * POST /api/agents/pool-creator
 *
 * Proxies user market-creation requests to the pool-creator agent.
 *
 * Flow:
 *  1. Classify the prompt locally (instant) — reject unsupported markets
 *     without ever calling OpenServ (which adds 2+ min of LLM overhead).
 *  2. For supported markets (Riot/LoL, Pistols, Dojo), fire the webhook
 *     to OpenServ as fire-and-forget and return an optimistic response.
 *     The agent handles Riot API lookups + on-chain tx in the background.
 *
 * The OPENSERV_USER_API_KEY never leaves the server.
 */

// Allow up to 5 minutes for the serverless function
export const maxDuration = 300

// ── Local prompt classification ──────────────────────────────────────

/** Keywords / phrases that signal a supported game market */
const GAME_KEYWORDS = [
  // Riot / League of Legends
  'lol', 'league', 'league of legends', 'riot', 'faker', 'showmaker',
  'doublelift', 'summoner', 'ranked', 'aram', 'esport',
  // Pistols at 10 Blocks (Dojo FOCG)
  'pistol', 'pistols', 'duel', '10 blocks',
  // Generic game / match terms
  'match', 'game', 'player', 'vs', 'versus',
  // Dojo / on-chain gaming
  'dojo', 'starknet game', 'on-chain game', 'onchain game',
  'budokan', 'tournament',
]

/** Keywords that signal a clearly non-gaming / unsupported market */
const UNSUPPORTED_KEYWORDS = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'token price',
  'stock', 'nasdaq', 's&p', 'forex', 'gold', 'oil',
  'election', 'president', 'politics', 'vote',
  'weather', 'temperature', 'rain',
  'super bowl', 'nfl', 'nba', 'mlb', 'fifa', 'world cup',
  'price', 'market cap', 'trading',
]

type PromptCategory = 'riot' | 'pistols' | 'game' | 'unsupported'

function classifyPrompt(prompt: string): PromptCategory {
  const lower = prompt.toLowerCase()

  // Check unsupported first — if the prompt clearly isn't about a
  // supported game, reject it instantly.
  if (UNSUPPORTED_KEYWORDS.some((kw) => lower.includes(kw))) {
    // But if it ALSO contains game keywords, treat it as game-related
    // (e.g. "Will Faker's Bitcoin-themed skin win?")
    if (!GAME_KEYWORDS.some((kw) => lower.includes(kw))) {
      return 'unsupported'
    }
  }

  // Pistols
  if (/pistol|duel|10\s*blocks/i.test(lower)) return 'pistols'

  // Riot / LoL
  if (/\b(lol|league|riot|faker|showmaker|doublelift|summoner|ranked|aram|esport)/i.test(lower)) return 'riot'

  // Generic game keywords → forward to agent
  if (GAME_KEYWORDS.some((kw) => lower.includes(kw))) return 'game'

  // Nothing matched → unsupported
  return 'unsupported'
}

const UNSUPPORTED_MESSAGE =
  "I can currently only create on-chain betting pools for supported game integrations like Riot (League of Legends) and Dojo games (Pistols at 10 Blocks). Custom or off-chain markets (crypto prices, sports, politics, etc.) are not supported by the Shōbu Escrow."

// ── Route handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt, address } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing "prompt" field in request body' },
        { status: 400 }
      )
    }

    // ── Step 1: Instant local classification ──
    const category = classifyPrompt(prompt)

    if (category === 'unsupported') {
      return NextResponse.json({ success: true, result: UNSUPPORTED_MESSAGE })
    }

    // ── Step 2: Forward to OpenServ agent (fire-and-forget) ──
    const apiKey = process.env.OPENSERV_USER_API_KEY
    const workflowId = Number(process.env.POOL_CREATOR_WORKFLOW_ID)

    if (!apiKey || !workflowId) {
      return NextResponse.json(
        { error: 'Server misconfigured: missing OPENSERV_USER_API_KEY or POOL_CREATOR_WORKFLOW_ID' },
        { status: 500 }
      )
    }

    const client = new PlatformClient({ apiKey })

    const taskPayload = {
      task: `A user (Starknet address: ${address || 'unknown'}) requested to create a new betting market: "${prompt}". Use the 'create_from_prompt' capability with starknetBettor="${address || 'unknown'}" to process this natural language request. Follow its instructions perfectly and return ONLY the final status string (Do not wrap it in quotes or markdown).`,
    }

    // Resolve webhook token and fire — don't await the agent response
    // since valid requests always involve slow Riot API + on-chain tx.
    const token = await (client.triggers as any).resolveWebhookToken({ workflowId })
    const rawClient = client.rawClient

    // Fire in background — log any errors but don't block
    rawClient
      .post(`/webhooks/trigger/${token}`, taskPayload, { timeout: 300_000 })
      .then((res: any) => {
        console.log('[api/agents/pool-creator] Agent completed:', typeof res.data === 'string' ? res.data : JSON.stringify(res.data))
      })
      .catch((err: any) => {
        const msg = err?.response?.status
          ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
          : err?.message || '(unknown)'
        console.warn('[api/agents/pool-creator] Agent background error:', msg)
      })

    // Return immediately with a category-specific optimistic message
    const messages: Record<string, string> = {
      riot: 'Looking up the live Riot match and deploying an on-chain betting pool — this may take a couple of minutes.',
      pistols: 'Scanning for active Pistols duels and creating a betting pool — this may take a minute.',
      game: 'Processing your game market request on-chain — this may take a couple of minutes.',
    }

    return NextResponse.json({
      success: true,
      result: messages[category] || messages.game,
    })
  } catch (err: any) {
    console.error('[api/agents/pool-creator] Error:', err?.message ?? err)
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 }
    )
  }
}
