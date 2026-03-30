import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  const agent = new Agent({
    systemPrompt: `You are the Shobu Analyst agent...`,
  })

  agent.addCapability({
    name: 'placeholder',
    description: 'placeholder',
    inputSchema: z.object({}),
    async run() { return 'ok' }
  })

  console.log('[repair] Provisioning analyst agent...')
  const result = await provision({
    userApiKey: process.env.OPENSERV_USER_API_KEY!,
    agent: {
      instance: agent,
      name: 'shobu-analyst',
      description: 'Provides odds analysis, pool insights, Trollbox chat, and market overviews.',
    },
    workflow: {
      name: 'Shobu Market Analyst',
      goal: 'Analyze betting pool odds, generate market insights, power the Trollbox chat, and post AI-generated analyses.',
      trigger: triggers.webhook({ waitForCompletion: true, timeout: 600 }),
      task: { description: 'Analyze markets' },
    },
  })
  console.log('[repair] Done provisioning!')
  console.log(JSON.stringify(result, null, 2))
}

main().catch(console.error)
