// ─── StarkZap v2 SDK ─────────────────────────────────────────────────
// Runtime-only loading to prevent Turbopack from statically analyzing
// and compiling the 742MB @hyperlane-xyz dependency tree.
//
// We use a dynamically-constructed module name so that Turbopack's
// static analysis cannot trace into the starkzap package at build time.
// ──────────────────────────────────────────────────────────────────────

import { web3Config } from "./web3-config";

let _starkzapInstance: any = null;
let _starkzapPromise: Promise<any> | null = null;

// Construct module name at runtime to defeat static analysis
const STARKZAP_MODULE = ["stark", "zap"].join("");

/**
 * Lazily load and return the StarkZap singleton.
 * The heavy `starkzap` package (and its transitive deps like @hyperlane-xyz)
 * is only imported when this function is first called at runtime.
 */
export async function getStarkzap(): Promise<any> {
  if (_starkzapInstance) return _starkzapInstance;
  if (_starkzapPromise) return _starkzapPromise;

  _starkzapPromise = (async () => {
    try {
      // Dynamic import with runtime-constructed name prevents Turbopack
      // from following this import at compile time
      const mod = await import(/* webpackIgnore: true */ STARKZAP_MODULE);
      const StarkZap = mod.StarkZap || mod.default?.StarkZap || mod.default;
      const network = web3Config.chainId === "MAINNET" ? "mainnet" : "sepolia";
      _starkzapInstance = new StarkZap({ network });
      return _starkzapInstance;
    } catch (err) {
      console.warn("[StarkZap] Failed to load SDK:", err);
      _starkzapPromise = null;
      return null;
    }
  })();

  return _starkzapPromise;
}

/**
 * Synchronous access — returns null if not yet loaded.
 * Use `getStarkzap()` to ensure it's loaded first.
 */
export function getStarkzapSync(): any | null {
  return _starkzapInstance;
}