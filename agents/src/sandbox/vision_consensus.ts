import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

// Hardcoded paths and configurations
const TEST_IMAGE_PATH = path.resolve(process.cwd(), 'test_images/shrapnel_win.png');

interface ExtractionOutcome {
  extracted: boolean;
  sigma_banked: number;
}

// 1. Google AI Studio (Gemini 3 Flash & Gemma 4)
async function callGoogleAI(modelName: string, base64Image: string, mimeType: string, prompt: string): Promise<ExtractionOutcome | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) throw new Error("Missing GOOGLE_AI_API_KEY")

  // Using the generic Google GenAI endpoint
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            extracted: { type: "BOOLEAN" },
            sigma_banked: { type: "NUMBER" }
          },
          required: ["extracted", "sigma_banked"]
        }
      }
    })
  })
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Google API Error (${modelName}):`, errorText);
    return null;
  }
  const result = await response.json()
  try {
    let text = result.candidates[0].content.parts[0].text.trim()
    // Strip markdown JSON block if the model hallucinated it
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (text.startsWith("```")) {
      text = text.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    // Find the first { and last } to extract JSON
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(text)
  } catch (err) {
    console.error(`Failed to parse ${modelName} output`, err)
    return null
  }
}

// 2. Groq (Llama 4 Scout)
async function callGroqLlama(base64Image: string, mimeType: string, prompt: string): Promise<ExtractionOutcome | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error("Missing GROQ_API_KEY in .env")

  let response: Response
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ]
          }
        ],
        response_format: { type: "json_object" }
      })
    })
  } catch (fetchErr: any) {
    console.error(`Groq fetch error:`, fetchErr?.cause ?? fetchErr?.message ?? fetchErr)
    return null
  }
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Groq API Error (${response.status}):`, errorText);
    return null;
  }
  const result = await response.json()
  try {
    let text = result.choices[0].message.content
    // Strip markdown wrappers if present
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
    console.error(`Failed to parse Llama output:`, result.choices?.[0]?.message?.content)
    return null
  }
}

function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpeg' || ext === '.jpg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

async function main() {
  console.log("--- Shōbu AI Vision Consensus Sandbox ---")
  
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    console.warn(`[!] Test image missing at: ${TEST_IMAGE_PATH}`)
    console.log("Please place a test screenshot there and add GOOGLE_AI_API_KEY and GROQ_API_KEY to your .env file.")
    process.exit(1)
  }

  const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = getMimeType(TEST_IMAGE_PATH)

  const prompt = `You are an esports match analyzer acting as an optimistic oracle.
Look at this scoreboard or victory screen.
Determine if the main player successfully extracted/won.
Extract the total "Sigma" banked or score (if they died or didn't extract, output 0).
Respond ONLY with a valid JSON object. Do not output markdown, do not use the words 'boolean' or 'number' as values. Use actual true/false and integers.
Example exactly like this:
{"extracted": true, "sigma_banked": 450}`;

  console.log("Dispatching vision models in parallel (Gemma, Gemini, Llama)...\n")

  const [geminiResult, gemmaResult, llamaResult] = await Promise.all([
    callGoogleAI('gemini-2.5-flash', base64Image, mimeType, prompt).catch(e => { console.error(e.message); return null; }),
    callGoogleAI('gemma-4-31b-it', base64Image, mimeType, prompt).catch(e => { console.error(e.message); return null; }),
    callGroqLlama(base64Image, mimeType, prompt).catch(e => { console.error(e.message); return null; })
  ])

  console.log(`[Gemini Flash] Verdict:  `, geminiResult)
  console.log(`[Gemma 4] Verdict:       `, gemmaResult)
  console.log(`[Llama Vision] Verdict:  `, llamaResult)

  const results = [geminiResult, gemmaResult, llamaResult].filter(r => r !== null) as ExtractionOutcome[]
  
  if (results.length < 2) {
    console.log("\n❌ Consensus Failed: Not enough models returned valid responses. Check your API keys.")
    return
  }

  // Count frequency of exact JSON signatures to simulate a reliable 2-of-3 vote
  const signatures = results.map(r => JSON.stringify({ extracted: r.extracted, sigma_banked: r.sigma_banked }))
  const counts = signatures.reduce((acc, sig) => {
    acc[sig] = (acc[sig] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  let consensusRes: string | null = null
  for (const [sig, count] of Object.entries(counts)) {
    if (count >= 2) { // 2-of-3 required
      consensusRes = sig
      break
    }
  }

  console.log("\n==================================")
  if (consensusRes) {
    console.log("✅ SETTLEMENT CONSENSUS REACHED")
    console.log("Winning Sub-Oracle Map:", JSON.parse(consensusRes))
  } else {
    console.log("🚨 DISPUTE: NO CONSENSUS")
    console.log("Models disagreed. The pool enters a challenge state.")
  }
}

main()
