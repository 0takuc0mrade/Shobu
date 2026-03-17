#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, RpcProvider } from "starknet";
import { init, ToriiQueryBuilder } from "@dojoengine/sdk/node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadEnv() {
  const base = path.resolve(__dirname, "..");
  loadEnvFile(path.join(base, ".env.local"));
  loadEnvFile(path.join(base, ".env"));
}

function normalizeAddress(value) {
  if (!value) return "";
  const str = String(value);
  const hex = str.startsWith("0x") ? str : `0x${str}`;
  return hex.toLowerCase();
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseTimeToSeconds(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    if (value > 1e12) return Math.floor(value / 1000);
    if (value > 1e9) return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num > 1e12) return Math.floor(num / 1000);
      if (num > 1e9) return Math.floor(num);
      return null;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return null;
}

function pickValue(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.games)) return payload.games;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function normalizeNetwork(value) {
  if (!value) return "";
  return String(value).toLowerCase().replace("sn_", "").replace("starknet_", "");
}

function matchesNetwork(value, chainId) {
  if (!value) return true;
  const target = normalizeNetwork(chainId);
  const candidate = normalizeNetwork(value);
  return target === candidate;
}

function funFactoryNetwork(chainId) {
  if (chainId === "MAINNET") return "mainnet";
  return "sepolia";
}

function parseBoolean(value) {
  if (!value) return false;
  return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
}

function parseMatch(entry, chainId, defaultToken) {
  const gameId = parseNumber(pickValue(entry, ["game_id", "gameId", "id", "gameID", "match_id", "matchId"]));
  if (gameId == null || gameId < 0 || gameId > 2 ** 32 - 1) return null;

  const network = pickValue(entry, ["network", "chain", "chain_id", "chainId"]);
  if (!matchesNetwork(network, chainId)) return null;

  const worldAddress = pickValue(entry, [
    "world_address",
    "worldAddress",
    "dojo_world",
    "world",
    "world_contract",
    "worldContract",
    "game_world",
    "gameWorld",
    "actions_address",
    "actionsAddress",
  ]);
  if (!worldAddress) return null;

  const tokenAddress = pickValue(entry, [
    "token_address",
    "tokenAddress",
    "bet_token",
    "betToken",
    "pool_token",
    "poolToken",
  ]);

  const startAt = pickValue(entry, [
    "start_time",
    "startTime",
    "starts_at",
    "startsAt",
    "scheduled_at",
    "scheduledAt",
    "kickoff",
    "kickoff_at",
    "kickoffAt",
  ]);
  const startTimeSec = parseTimeToSeconds(startAt);

  const deadlineRaw = pickValue(entry, [
    "bet_deadline",
    "betDeadline",
    "deadline",
    "betting_deadline",
  ]);
  const deadlineSec = parseTimeToSeconds(deadlineRaw);

  const egsTokenIdP1 = pickValue(entry, [
    "egs_token_id_p1",
    "egsTokenIdP1",
    "token_id_p1",
    "tokenIdP1",
    "player1_token_id",
    "p1_token_id",
  ]);
  const egsTokenIdP2 = pickValue(entry, [
    "egs_token_id_p2",
    "egsTokenIdP2",
    "token_id_p2",
    "tokenIdP2",
    "player2_token_id",
    "p2_token_id",
  ]);

  const explicitId = pickValue(entry, ["match_id", "matchId", "id", "game_id", "gameId"]);
  const matchKeyBase = explicitId != null ? String(explicitId) : `${gameId}`;

  return {
    matchId: matchKeyBase,
    gameId,
    gameWorld: normalizeAddress(worldAddress),
    token: normalizeAddress(tokenAddress ?? defaultToken),
    startTimeSec,
    deadlineSec,
    egsTokenIdP1,
    egsTokenIdP2,
    raw: entry,
  };
}

function normalizeFelt(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value.toString();
  if (typeof value === "bigint") return value.toString();
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function computeDeadline(nowSec, startTimeSec, deadlineSec, bufferSec, defaultWindowSec) {
  if (deadlineSec && deadlineSec > 0) return deadlineSec;
  if (startTimeSec && startTimeSec > 0) {
    return Math.max(startTimeSec - bufferSec, nowSec + 30);
  }
  return nowSec + defaultWindowSec;
}

function shouldCreate(nowSec, startTimeSec, deadlineSec, leadSec) {
  if (deadlineSec && deadlineSec <= nowSec) return false;
  if (!startTimeSec) return true;
  return nowSec >= startTimeSec - leadSec;
}

function readState(filePath) {
  if (!filePath) return { created: {} };
  if (!fs.existsSync(filePath)) return { created: {} };
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (data && typeof data === "object" && data.created) return data;
  } catch {
    return { created: {} };
  }
  return { created: {} };
}

function writeState(filePath, state) {
  if (!filePath) return;
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

async function fetchExistingPools(sdk) {
  const query = new ToriiQueryBuilder()
    .withEntityModels(["shobu-BettingPool"])
    .withLimit(1000);
  const result = await sdk.getEntities({ query });
  const items = typeof result?.getItems === "function" ? result.getItems() : result?.items ?? [];
  const pools = [];
  for (const item of items) {
    const model =
      item?.models?.shobu?.BettingPool ??
      item?.models?.["shobu-BettingPool"] ??
      null;
    if (model) pools.push(model);
  }
  return pools;
}

async function main() {
  loadEnv();

  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? "KATANA";
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://localhost:5050";
  const worldAddress = normalizeAddress(process.env.NEXT_PUBLIC_WORLD_ADDRESS ?? "");
  const toriiUrl = process.env.NEXT_PUBLIC_TORII_URL ?? "http://localhost:8080";
  const escrowAddress = normalizeAddress(process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? "");

  const feedUrl =
    process.env.FUN_FACTORY_FEED_URL ??
    process.env.NEXT_PUBLIC_EGS_GAMES_API ??
    process.env.NEXT_PUBLIC_DENSHOKAN_GAMES_API ??
    `https://denshokan-api-production.up.railway.app/games?network=${funFactoryNetwork(chainId)}`;

  const poolToken =
    process.env.POOL_TOKEN_ADDRESS ??
    process.env.NEXT_PUBLIC_STRK_TOKEN ??
    "";

  const managerAccount = normalizeAddress(process.env.POOL_MANAGER_ACCOUNT ?? "");
  const managerPrivateKey = process.env.POOL_MANAGER_PRIVATE_KEY ?? "";

  const pollMs = Number(process.env.POOL_MANAGER_POLL_MS ?? "30000");
  const leadSeconds = Number(process.env.POOL_MANAGER_CREATE_LEAD_SECONDS ?? "1800");
  const deadlineBufferSeconds = Number(process.env.POOL_MANAGER_DEADLINE_BUFFER_SECONDS ?? "120");
  const defaultWindowSeconds = Number(process.env.POOL_MANAGER_DEFAULT_DEADLINE_SECONDS ?? "1800");
  const maxPerTick = Number(process.env.POOL_MANAGER_MAX_PER_TICK ?? "5");
  const dryRun = parseBoolean(process.env.POOL_MANAGER_DRY_RUN);
  const once = process.argv.includes("--once") || parseBoolean(process.env.POOL_MANAGER_ONCE);

  const statePath =
    process.env.POOL_MANAGER_STATE_PATH ??
    path.join(__dirname, "pool-manager.state.json");

  if (!worldAddress || !escrowAddress) {
    console.error("Missing NEXT_PUBLIC_WORLD_ADDRESS or NEXT_PUBLIC_ESCROW_ADDRESS.");
    process.exit(1);
  }
  if (!managerAccount || !managerPrivateKey) {
    console.error("Missing POOL_MANAGER_ACCOUNT or POOL_MANAGER_PRIVATE_KEY.");
    process.exit(1);
  }
  if (!poolToken) {
    console.error("Missing POOL_TOKEN_ADDRESS (or NEXT_PUBLIC_STRK_TOKEN).");
    process.exit(1);
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account(provider, managerAccount, managerPrivateKey);

  const sdk = await init({
    client: { worldAddress, toriiUrl },
    domain: { name: "Shobu", version: "1.0", chainId, revision: "1" },
  });

  const state = readState(statePath);

  async function tick() {
    const nowSec = Math.floor(Date.now() / 1000);
    console.log(`[pool-manager] tick ${new Date().toISOString()}`);

    let payload;
    try {
      const response = await fetch(feedUrl);
      if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
      payload = await response.json();
    } catch (err) {
      console.error("[pool-manager] feed error:", err instanceof Error ? err.message : err);
      return;
    }

    const entries = extractList(payload);
    const matches = entries
      .map((entry) => parseMatch(entry, chainId, poolToken))
      .filter(Boolean);

    if (matches.length === 0) {
      console.log("[pool-manager] no matches found in feed.");
      return;
    }

    let existingPools = [];
    try {
      existingPools = await fetchExistingPools(sdk);
    } catch (err) {
      console.error("[pool-manager] torii query failed:", err instanceof Error ? err.message : err);
    }

    const existingKeys = new Set(
      existingPools.map((pool) => {
        const gw = normalizeAddress(pool.game_world ?? "");
        const gid = Number(pool.game_id ?? 0);
        return `${gw}:${gid}`;
      })
    );

    let createdThisTick = 0;

    for (const match of matches) {
      if (createdThisTick >= maxPerTick) break;

      const matchKey = `${match.gameWorld}:${match.gameId}`;
      if (existingKeys.has(matchKey)) continue;
      if (state.created?.[matchKey]) continue;

      const deadline = computeDeadline(
        nowSec,
        match.startTimeSec,
        match.deadlineSec,
        deadlineBufferSeconds,
        defaultWindowSeconds
      );
      if (!shouldCreate(nowSec, match.startTimeSec, deadline, leadSeconds)) {
        continue;
      }
      if (deadline <= nowSec) continue;

      const egsP1 = normalizeFelt(match.egsTokenIdP1);
      const egsP2 = normalizeFelt(match.egsTokenIdP2);
      const isEgs = Boolean(egsP1 && egsP2);

      const calldata = isEgs
        ? [
            match.gameWorld,
            match.gameId.toString(),
            match.token,
            deadline.toString(),
            egsP1,
            egsP2,
          ]
        : [
            match.gameWorld,
            match.gameId.toString(),
            match.token,
            deadline.toString(),
          ];

      console.log(
        `[pool-manager] creating ${isEgs ? "EGS" : "direct"} pool for ${matchKey} (deadline ${deadline})`
      );

      if (dryRun) {
        state.created[matchKey] = { at: nowSec, dryRun: true };
        createdThisTick += 1;
        continue;
      }

      try {
        const { transaction_hash } = await account.execute([
          {
            contractAddress: escrowAddress,
            entrypoint: isEgs ? "create_egs_pool" : "create_pool",
            calldata,
          },
        ]);

        await provider.waitForTransaction(transaction_hash);
        state.created[matchKey] = { at: nowSec, tx: transaction_hash };
        createdThisTick += 1;
      } catch (err) {
        console.error(
          `[pool-manager] create failed for ${matchKey}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    writeState(statePath, state);
  }

  await tick();
  if (!once) {
    setInterval(tick, pollMs);
  }
}

main().catch((err) => {
  console.error("[pool-manager] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
