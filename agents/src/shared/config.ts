import { z } from 'zod'
import path from 'node:path'

/**
 * Validates environment variables for the Shobu agent suite.
 * Cartridge Controller sessions replace raw private keys —
 * the session is persisted to disk and refreshed automatically.
 */

const envSchema = z.object({
  // Starknet
  STARKNET_RPC_URL: z
    .string()
    .url()
    .default('https://api.cartridge.gg/x/starknet/sepolia'),

  // Cartridge Controller (session-based — no private key)
  CARTRIDGE_ADDRESS: z
    .string()
    .default('')
    .describe('Optional — resolved from session if not set'),
  SESSION_BASE_PATH: z
    .string()
    .default('')
    .describe('Dir for persisted session files'),
  ALLOW_INTERACTIVE_AUTH: z
    .string()
    .default('false')
    .transform((v) => ['1', 'true', 'yes'].includes(v.toLowerCase())),
  EXIT_AFTER_SESSION: z
    .string()
    .default('false')
    .transform((v) => ['1', 'true', 'yes'].includes(v.toLowerCase())),
  KEYCHAIN_URL: z.string().default(''),

  // Dojo world
  WORLD_ADDRESS: z
    .string()
    .min(1)
    .default(
      '0x06d1f1bc162ec84e592e4e2e3a69978440f8611224a61b88d8855ff4718c3aca'
    ),
  TORII_URL: z.string().url().default('http://localhost:8080'),
  BUDOKAN_TORII_URL: z.string().url().default('http://localhost:8080'),
  BUDOKAN_ADDRESS: z.string().default('0x0'),
  ESCROW_ADDRESS: z.string().min(1, 'ESCROW_ADDRESS is required'),

  // Betting defaults
  POOL_TOKEN: z
    .string()
    .min(1)
    .default(
      '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
    ),
  FEED_URL: z
    .string()
    .url()
    .default(
      'https://denshokan-api-production.up.railway.app/games?network=sepolia'
    ),

  // Pool creation tuning
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  CREATE_LEAD_SECONDS: z.coerce.number().int().nonnegative().default(1800),
  DEADLINE_BUFFER_SECONDS: z.coerce.number().int().nonnegative().default(120),
  DEFAULT_DEADLINE_SECONDS: z.coerce.number().int().positive().default(1800),
  MAX_POOLS_PER_TICK: z.coerce.number().int().positive().default(5),

  // Chain
  CHAIN_ID: z.string().default('0x534e5f5345504f4c4941'),
})

export type Config = z.infer<typeof envSchema>

let _config: Config | null = null

export function loadConfig(): Config {
  if (_config) return _config
  _config = envSchema.parse(process.env)

  // Default session path if not explicitly set
  if (!_config.SESSION_BASE_PATH) {
    _config.SESSION_BASE_PATH = path.join(
      process.cwd(),
      '.cartridge-agent-session'
    )
  }
  return _config
}

export function getConfig(): Config {
  if (!_config) return loadConfig()
  return _config
}
