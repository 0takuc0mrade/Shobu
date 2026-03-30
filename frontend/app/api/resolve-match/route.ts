import { PlatformClient } from '@openserv-labs/client';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { poolId, rawGameId, type } = body;

    const apiKey = process.env.OPENSERV_USER_API_KEY;
    if (!apiKey) {
      console.error('[OpenServ] Missing OPENSERV_USER_API_KEY');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const client = new PlatformClient({ apiKey });

    // Analyst workflow ID is known from .openserv.json (13070)
    const workflowId = Number(process.env.NEXT_PUBLIC_ANALYST_WORKFLOW_ID || 13070);

    // Fire webhook to the analyst workspace
    const result = await client.triggers.fireWebhook({
      workflowId,
      input: {
        task: `Use the resolve_match_name capability exactly once with these args. Return ONLY its raw output inside your final response, no extra text.`,
        pool_id: String(poolId),
        raw_game_id: rawGameId,
        type: type
      }
    });

    // The result from fireWebhook contains output string from the workflow task completion
    return NextResponse.json({ matchName: (result as any).output || 'Unknown Match' });
  } catch (error: any) {
    console.error('[OpenServ] Webhook proxy failed:', error.message);
    return NextResponse.json({ error: 'Failed to resolve match' }, { status: 500 });
  }
}
