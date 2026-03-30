import { NextRequest, NextResponse } from 'next/server'
import { PlatformClient } from '@openserv-labs/client'

/**
 * POST /api/agents/analyst
 *
 * Proxies Trollbox chat messages to the analyst agent via
 * OpenServ's fireWebhook API. The agent uses the chat_trollbox
 * capability to generate pool-aware AI responses.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { poolId, message } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing "message" field in request body' },
        { status: 400 }
      )
    }

    if (poolId === undefined || poolId === null) {
      return NextResponse.json(
        { error: 'Missing "poolId" field in request body' },
        { status: 400 }
      )
    }

    const apiKey = process.env.OPENSERV_USER_API_KEY
    const workflowId = Number(process.env.ANALYST_WORKFLOW_ID)

    if (!apiKey || !workflowId) {
      return NextResponse.json(
        { error: 'Server misconfigured: missing OPENSERV_USER_API_KEY or ANALYST_WORKFLOW_ID' },
        { status: 500 }
      )
    }

    const client = new PlatformClient({ apiKey })

    const result = await client.triggers.fireWebhook({
      workflowId,
      input: { poolId: Number(poolId), message },
    })

    // Extract the raw text from OpenServ's nested webhook response
    let extractedText = null
    try {
      if (result && typeof result === 'object') {
        const firstResult = (result as any).results?.[0]
        const output = firstResult?.workspaceExecution?.output
        
        if (output && typeof output.value === 'string') {
          extractedText = output.value
        } else if (typeof output === 'string') {
          extractedText = output
        } else if (typeof firstResult?.response === 'string') {
          extractedText = firstResult.response
        }
      }
    } catch (e) {
      console.warn('Failed to parse OpenServ object natively, falling back to raw', e)
    }

    return NextResponse.json({ 
      success: true, 
      result: extractedText || result 
    })
  } catch (err: any) {
    console.error('[api/agents/analyst] Error:', err?.message ?? err)
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 }
    )
  }
}
