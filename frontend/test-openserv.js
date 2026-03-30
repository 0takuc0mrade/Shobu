const { PlatformClient } = require('@openserv-labs/client');

async function test() {
  const apiKey = '0c4a2b5390224fd39f4eb965213f4f37';
  const workflowId = 13070;

  const client = new PlatformClient({ apiKey });

  try {
    const result = await client.triggers.fireWebhook({
      workflowId,
      input: { poolId: 1, message: "Who's looking strong?" },
    });
    console.log("SUCCESS:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}

test();
