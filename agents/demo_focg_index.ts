// FOCG Indexing Demo for Pistols at 10 Blocks
// This script demonstrates how Shobu queries native Starknet Fully On-Chain Games (FOCG)
// directly via Dojo's Torii indexer, using Pistols at 10 Blocks as an example.

export const TORII_GRAPHQL_SEPOLIA = "https://api.cartridge.gg/x/pistols-sepolia/torii/graphql";

const query = `
  query GetRecentDuels {
    pistolsChallengeModels(limit: 5) {
      edges {
        node {
          duel_id
          winner
          address_a
          address_b
          state
        }
      }
    }
  }
`;

async function fetchRecentDuels() {
  console.log("🔫 Indexing Native FOCG (Pistols at 10 Blocks) via Torii...");
  console.log(`Endpoint: ${TORII_GRAPHQL_SEPOLIA}\n`);

  try {
    const response = await fetch(TORII_GRAPHQL_SEPOLIA, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Torii HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      console.error("GraphQL Errors:", JSON.stringify(result.errors, null, 2));
      return;
    }

    const { data } = result;
    
    if (data && data.pistolsChallengeModels && data.pistolsChallengeModels.edges) {
      const duels = data.pistolsChallengeModels.edges.map((edge: any) => edge.node);
      
      for (const duel of duels) {
        console.log(`=================================================`);
        console.log(`🗡️  Duel ID: ${duel.duel_id}`);
        console.log(`📍 Challenger (A): ${duel.address_a}`);
        console.log(`📍 Challenged (B): ${duel.address_b}`);
        console.log(`⏳ State Int: ${duel.state}`);
        
        if (duel.winner === 0) console.log("🏆 Result: Draw / Unfinished");
        if (duel.winner === 1) console.log(`🏆 Result: Challenger Wins (A)`);
        if (duel.winner === 2) console.log(`🏆 Result: Challenged Wins (B)`);
      }
      console.log(`=================================================\n`);
      console.log("✅ Successfully indexed FOCG state!");
    } else {
      console.log("Unexpected data structure from Torii:", JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.error("❌ Failed to index Torii:", error);
  }
}

fetchRecentDuels();
