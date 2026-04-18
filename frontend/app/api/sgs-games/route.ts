import { NextResponse } from "next/server";
import type { SgsActiveGame, SgsGameEnded, SgsIndexerState } from "@/lib/sgs-types";
import { resolveSgsGameName } from "@/lib/sgs-types";

/**
 * Lightweight in-memory cache for SGS game state.
 * Persists across API calls within one Next.js server process.
 */
let indexerState: SgsIndexerState = {
  lastLedger: 0,
  activeGames: [],
  endedSessionIds: [],
  updatedAt: new Date().toISOString(),
};

const GAME_HUB_ADDRESS =
  process.env.NEXT_PUBLIC_SGS_GAME_HUB_ADDRESS ??
  "CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG";

const RPC_URL =
  process.env.NEXT_PUBLIC_SGS_RPC_URL ??
  "https://soroban-testnet.stellar.org";

// Minimum time between RPC polls (prevents hammering on rapid API hits)
const MIN_POLL_GAP_MS = 5_000;
let lastPollAt = 0;

/**
 * Poll Soroban RPC getEvents() for GameStarted/GameEnded events
 * from the Game Hub contract and update in-memory state.
 */
async function pollGameHubEvents(): Promise<void> {
  const now = Date.now();
  if (now - lastPollAt < MIN_POLL_GAP_MS) return;
  lastPollAt = now;

  try {
    const { rpc, xdr, Address, scValToNative } = await import(
      "@stellar/stellar-sdk"
    );
    const server = new rpc.Server(RPC_URL);

    // Get current ledger info to know the valid range
    const latestLedger = await server.getLatestLedger();
    // Soroban getEvents supports ~17280 ledgers lookback (~24h)
    // Use a conservative window of 4320 (~6h) to stay safe
    const startLedger = indexerState.lastLedger > 0
      ? indexerState.lastLedger + 1
      : Math.max(latestLedger.sequence - 4320, 1);

    if (startLedger > latestLedger.sequence) return;

    // Fetch events from the Game Hub contract
    const eventsResponse = await server.getEvents({
      startLedger,
      filters: [
        {
          type: "contract" as any,
          contractIds: [GAME_HUB_ADDRESS],
        },
      ],
      limit: 100,
    });

    if (!eventsResponse.events || eventsResponse.events.length === 0) {
      indexerState.lastLedger = latestLedger.sequence;
      indexerState.updatedAt = new Date().toISOString();
      return;
    }

    for (const event of eventsResponse.events) {
      const topicValues = event.topic;
      if (!topicValues || topicValues.length === 0) continue;

      // The first topic is the event name as a Symbol
      let eventName = "";
      try {
        // Topic values are already ScVal objects in newer SDK versions
        const firstTopic = topicValues[0];
        if (typeof firstTopic === "string") {
          // XDR string
          const scVal = xdr.ScVal.fromXDR(firstTopic, "base64");
          eventName =
            scVal.switch().name === "scvSymbol" ? scVal.sym().toString() : "";
        } else if (firstTopic && typeof firstTopic === "object") {
          eventName = scValToNative(firstTopic)?.toString() ?? "";
        }
      } catch {
        continue;
      }

      const ledgerTimestamp = Math.floor(
        new Date((event as any).createdAt || (event as any).ledgerClosedAt || Date.now()).getTime() / 1000
      );

      if (eventName === "GameStarted" || eventName === "game_started") {
        try {
          const val = typeof event.value === "string"
            ? xdr.ScVal.fromXDR(event.value, "base64")
            : event.value;
          
          const native = scValToNative(val);
          
          // The event data is a struct with fields
          const game: SgsActiveGame = {
            sessionId: Number(native?.session_id ?? native?.[0] ?? 0),
            gameContractAddress: String(native?.game_id ?? native?.[1] ?? ""),
            player1: String(native?.player1 ?? native?.[2] ?? ""),
            player2: String(native?.player2 ?? native?.[3] ?? ""),
            player1Points: String(native?.player1_points ?? native?.[4] ?? "0"),
            player2Points: String(native?.player2_points ?? native?.[5] ?? "0"),
            startedAt: ledgerTimestamp,
            startLedger: event.ledger ?? startLedger,
            gameName: resolveSgsGameName(
              String(native?.game_id ?? native?.[1] ?? "")
            ),
            gameHubAddress: GAME_HUB_ADDRESS,
          };

          // Only add if not already tracked and not already ended
          if (
            !indexerState.endedSessionIds.includes(game.sessionId) &&
            !indexerState.activeGames.some(
              (g) => g.sessionId === game.sessionId
            )
          ) {
            indexerState.activeGames.push(game);
          }
        } catch (e) {
          console.error("[sgs-indexer] Failed to parse GameStarted:", e);
        }
      }

      if (eventName === "GameEnded" || eventName === "game_ended") {
        try {
          const val = typeof event.value === "string"
            ? xdr.ScVal.fromXDR(event.value, "base64")
            : event.value;

          const native = scValToNative(val);
          const sessionId = Number(native?.session_id ?? native?.[0] ?? 0);
          const player1Won = Boolean(native?.player1_won ?? native?.[1] ?? false);

          // Move from active to ended
          indexerState.activeGames = indexerState.activeGames.filter(
            (g) => g.sessionId !== sessionId
          );
          if (!indexerState.endedSessionIds.includes(sessionId)) {
            indexerState.endedSessionIds.push(sessionId);
          }

          // Keep ended list bounded
          if (indexerState.endedSessionIds.length > 500) {
            indexerState.endedSessionIds = indexerState.endedSessionIds.slice(-250);
          }
        } catch (e) {
          console.error("[sgs-indexer] Failed to parse GameEnded:", e);
        }
      }
    }

    indexerState.lastLedger = latestLedger.sequence;
    indexerState.updatedAt = new Date().toISOString();
  } catch (err) {
    console.error("[sgs-indexer] Poll error:", err);
  }
}

/**
 * GET /api/sgs-games
 * Returns the list of active SGS games from the in-memory cache,
 * triggering a fresh poll if the cache is stale.
 */
export async function GET() {
  // Trigger a poll (debounced internally)
  await pollGameHubEvents();

  return NextResponse.json({
    games: indexerState.activeGames,
    lastLedger: indexerState.lastLedger,
    updatedAt: indexerState.updatedAt,
    gameHubAddress: GAME_HUB_ADDRESS,
    totalActive: indexerState.activeGames.length,
    totalEnded: indexerState.endedSessionIds.length,
  });
}
