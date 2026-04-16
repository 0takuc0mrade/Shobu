import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAP_PATH = path.resolve(__dirname, '../../../frontend/public/stellar-pool-map.json')

export type StellarPoolMap = Record<string, number>

/**
 * Persist a Starknet → Stellar pool ID mapping entry.
 * Called by the pool-creator agent after dual-chain creation.
 */
export function saveStellarPoolId(starknetPoolId: number | string, stellarPoolId: number) {
  let map: StellarPoolMap = {}
  try {
    if (fs.existsSync(MAP_PATH)) {
      map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
    }
  } catch {}
  map[String(starknetPoolId)] = stellarPoolId
  try {
    const dir = path.dirname(MAP_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2))
    console.log(`[pool-id-map] Mapped starknet:${starknetPoolId} → stellar:${stellarPoolId}`)
  } catch (e) {
    console.error('[pool-id-map] Failed to write map:', e)
  }
}

/**
 * Read the full map (used by the frontend via fetch('/stellar-pool-map.json')).
 */
export function getStellarPoolMap(): StellarPoolMap {
  try {
    if (fs.existsSync(MAP_PATH)) {
      return JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
    }
  } catch {}
  return {}
}

/**
 * Look up a single Stellar pool ID by its Starknet counterpart.
 */
export function getStellarPoolId(starknetPoolId: number | string): number | null {
  const map = getStellarPoolMap()
  const id = map[String(starknetPoolId)]
  return id !== undefined ? id : null
}
