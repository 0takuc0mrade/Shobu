import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../../../frontend/public/markets.json')

export interface MarketContext {
  market_title: string
  resolution_criteria: string
}

export async function generateMarketContext(title: string, gameName: string, viewers: number): Promise<MarketContext | null> {
  const prompt = `You are a betting market creator.
Given a live stream:
Title: "${title}"
Game: "${gameName}"
Viewers: ${viewers}

Generate a Polymarket-style binary prediction market for this stream.
Return exactly and ONLY a JSON object:
{
  "market_title": "market title in form of a question",
  "resolution_criteria": "rules for when the market resolves to YES or NO"
}
Example:
{
  "market_title": "Will TFBlade win his current League of Legends match?",
  "resolution_criteria": "Resolves to YES if the 'Victory' screen appears. Resolves to NO if 'Defeat' appears or the stream ends before a conclusion."
}`

  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    console.warn('[market-generator] GOOGLE_AI_API_KEY not found')
    return null
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                market_title: { type: 'STRING' },
                resolution_criteria: { type: 'STRING' },
              },
              required: ['market_title', 'resolution_criteria'],
            },
          },
        }),
      }
    )

    if (!response.ok) {
      console.error('[market-generator] Gemini API error', await response.text())
      return null
    }
    const result = await response.json()
    let text = result.candidates[0].content.parts[0].text.trim()
    return JSON.parse(text)
  } catch (err) {
    console.error('[market-generator] Error generating context:', err)
    return null
  }
}

export function saveMarketContext(matchId: string, context: MarketContext) {
  let db: Record<string, MarketContext> = {}
  try {
    if (fs.existsSync(DB_PATH)) {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
    }
  } catch(e) {}
  db[matchId] = context
  try {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
  } catch (e) {
    console.error('[market-generator] Failed to write db:', e)
  }
}

export function getMarketContext(matchId: string): MarketContext | null {
  try {
    if (fs.existsSync(DB_PATH)) {
      const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
      return db[matchId] || null
    }
  } catch(e) {}
  return null
}
