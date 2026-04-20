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

  let resultParsed: MarketContext | null = null

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  // 1. Try Gemini first
  const geminiApiKey = process.env.GOOGLE_AI_API_KEY
  if (geminiApiKey) {
    let retries = 3
    let delay = 2000
    
    while (retries > 0) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
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

        if (response.ok) {
          const result = await response.json()
          const text = result.candidates[0].content.parts[0].text.trim()
          resultParsed = JSON.parse(text)
          break
        } else if (response.status === 429 || response.status === 503) {
          console.warn(`[market-generator] Gemini API error: ${response.status}. Retrying in ${delay}ms...`)
          await sleep(delay)
          delay *= 2
          retries--
        } else {
          console.warn(`[market-generator] Gemini API error: ${response.status} ${response.statusText}`)
          break
        }
      } catch (err: any) {
        console.warn(`[market-generator] Gemini network error: ${err.message}`)
        break
      }
    }
  }

  if (resultParsed) return resultParsed

  // 2. Fallback to Groq if Gemini fails (e.g. 503 high demand)
  console.log('[market-generator] Gemini unavailable. Falling back to Groq (Llama-3.3)...')
  const groqApiKey = process.env.GROQ_API_KEY
  if (groqApiKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are a betting market creator. Generate a Polymarket-style binary prediction market. You must respond with exactly and ONLY valid JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        }),
      })

      if (response.ok) {
        const result = await response.json()
        let text = result.choices[0].message.content.trim()
        
        // Extract JSON from markdown if present, or find the first/last curly braces
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          text = jsonMatch[1].trim()
        } else {
          const start = text.indexOf('{')
          const end = text.lastIndexOf('}')
          if (start !== -1 && end !== -1) {
            text = text.slice(start, end + 1)
          }
        }

        return JSON.parse(text)
      } else {
        console.error(`[market-generator] Groq API error: ${response.status} ${await response.text()}`)
      }
    } catch (err: any) {
      console.error(`[market-generator] Groq parsing/network error: ${err.message}`)
    }
  }

  console.error('[market-generator] All LLM providers failed.')
  return null
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
