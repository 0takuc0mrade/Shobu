// -----------------------------------------------------------------------
// Shōbu Vision Oracle — Multi-Model AI Consensus Engine
// -----------------------------------------------------------------------
// Runs parallel vision analysis across diverse model architectures
// (Google Gemini, Google Gemma, Meta Llama) and returns a settlement
// verdict only when 2-of-3 models agree on the structured output.
// -----------------------------------------------------------------------

export interface ExtractionOutcome {
  extracted: boolean
  sigma_banked: number
}

export interface ConsensusResult {
  consensus: boolean
  verdict: ExtractionOutcome | null
  votes: {
    gemini: ExtractionOutcome | null
    gemma: ExtractionOutcome | null
    llama: ExtractionOutcome | null
  }
  agreeing_models: string[]
}

// -----------------------------------------------------------------------
// Settler A: Google Gemini Flash (Proprietary, Closed-Weights)
// Settler B: Google Gemma 4 (Open-Weights)
// -----------------------------------------------------------------------

async function callGoogleAI(
  modelName: string,
  base64Image: string,
  mimeType: string,
  prompt: string
): Promise<ExtractionOutcome | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    console.error(`[vision-oracle] Missing GOOGLE_AI_API_KEY`)
    return null
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: base64Image } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              extracted: { type: 'BOOLEAN' },
              sigma_banked: { type: 'NUMBER' },
            },
            required: ['extracted', 'sigma_banked'],
          },
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[vision-oracle] Google API Error (${modelName}):`, errorText)
    return null
  }

  const result = await response.json()
  try {
    let text = result.candidates[0].content.parts[0].text.trim()

    // Strip markdown wrappers if present
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.substring(firstBrace, lastBrace + 1)
    }

    return JSON.parse(text)
  } catch (err) {
    console.error(`[vision-oracle] Failed to parse ${modelName} output`, err)
    return null
  }
}

// -----------------------------------------------------------------------
// Settler C: Meta Llama 4 Scout (Open-Weights via Groq)
// -----------------------------------------------------------------------

async function callGroqLlama(
  base64Image: string,
  mimeType: string,
  prompt: string
): Promise<ExtractionOutcome | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error(`[vision-oracle] Missing GROQ_API_KEY`)
    return null
  }

  let response: Response
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    })
  } catch (fetchErr: any) {
    console.error(
      `[vision-oracle] Groq fetch error:`,
      fetchErr?.cause ?? fetchErr?.message ?? fetchErr
    )
    return null
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error(
      `[vision-oracle] Groq API Error (${response.status}):`,
      errorText
    )
    return null
  }

  const result = await response.json()
  try {
    let text = result.choices[0].message.content
    if (typeof text === 'string') {
      text = text.trim()
      const firstBrace = text.indexOf('{')
      const lastBrace = text.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        text = text.substring(firstBrace, lastBrace + 1)
      }
    }
    return JSON.parse(text)
  } catch (err) {
    console.error(
      `[vision-oracle] Failed to parse Llama output:`,
      result.choices?.[0]?.message?.content
    )
    return null
  }
}

// -----------------------------------------------------------------------
// Consensus Engine — 2-of-3 Vote
// -----------------------------------------------------------------------

function findConsensus(
  votes: (ExtractionOutcome | null)[]
): { verdict: ExtractionOutcome | null; indices: number[] } {
  const valid = votes
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v !== null) as { v: ExtractionOutcome; i: number }[]

  if (valid.length < 2) {
    return { verdict: null, indices: [] }
  }

  // Compare by exact JSON signature
  const signatures = valid.map((x) =>
    JSON.stringify({ extracted: x.v.extracted, sigma_banked: x.v.sigma_banked })
  )

  const counts: Record<string, { count: number; indices: number[] }> = {}
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i]
    if (!counts[sig]) counts[sig] = { count: 0, indices: [] }
    counts[sig].count++
    counts[sig].indices.push(valid[i].i)
  }

  for (const [sig, { count, indices }] of Object.entries(counts)) {
    if (count >= 2) {
      return { verdict: JSON.parse(sig), indices }
    }
  }

  return { verdict: null, indices: [] }
}

// -----------------------------------------------------------------------
// Public API: Run the Oracle
// -----------------------------------------------------------------------

const MODEL_NAMES = ['gemini', 'gemma', 'llama'] as const

const DEFAULT_PROMPT = `You are an esports match analyzer acting as an optimistic oracle.
Look at this scoreboard or victory screen.
Determine if the main player successfully extracted/won.
Extract the total "Sigma" banked or score (if they died or didn't extract, output 0).
Respond ONLY with a valid JSON object. Do not output markdown, do not use the words 'boolean' or 'number' as values. Use actual true/false and integers.
Example exactly like this:
{"extracted": true, "sigma_banked": 450}`

/**
 * Runs the full 2-of-3 diverse-model vision consensus against a base64-encoded image.
 * Returns a structured ConsensusResult with individual votes and the winning verdict.
 */
export async function runVisionConsensus(
  base64Image: string,
  mimeType: string,
  prompt?: string
): Promise<ConsensusResult> {
  const p = prompt ?? DEFAULT_PROMPT

  console.log('[vision-oracle] Dispatching 3 diverse vision models in parallel...')

  const [geminiResult, gemmaResult, llamaResult] = await Promise.all([
    callGoogleAI('gemini-2.5-flash', base64Image, mimeType, p).catch((e) => {
      console.error(`[vision-oracle] Gemini error: ${e.message}`)
      return null
    }),
    callGoogleAI('gemma-4-31b-it', base64Image, mimeType, p).catch((e) => {
      console.error(`[vision-oracle] Gemma error: ${e.message}`)
      return null
    }),
    callGroqLlama(base64Image, mimeType, p).catch((e) => {
      console.error(`[vision-oracle] Llama error: ${e.message}`)
      return null
    }),
  ])

  const votes = [geminiResult, gemmaResult, llamaResult]
  const { verdict, indices } = findConsensus(votes)

  const agreeing = indices.map((i) => MODEL_NAMES[i])

  console.log(`[vision-oracle] Gemini: ${JSON.stringify(geminiResult)}`)
  console.log(`[vision-oracle] Gemma:  ${JSON.stringify(gemmaResult)}`)
  console.log(`[vision-oracle] Llama:  ${JSON.stringify(llamaResult)}`)

  if (verdict) {
    console.log(`[vision-oracle] ✅ CONSENSUS (${agreeing.join(' + ')}): ${JSON.stringify(verdict)}`)
  } else {
    console.log(`[vision-oracle] 🚨 NO CONSENSUS — dispute flagged`)
  }

  return {
    consensus: verdict !== null,
    verdict,
    votes: {
      gemini: geminiResult,
      gemma: gemmaResult,
      llama: llamaResult,
    },
    agreeing_models: agreeing,
  }
}
