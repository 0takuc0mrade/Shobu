const { PlatformClient } = require('@openserv-labs/client');

async function test() {
  const apiKey = '0c4a2b5390224fd39f4eb965213f4f37';
  const workflowId = 13109; // pool-creator
  const client = new PlatformClient({ apiKey });

  try {
    const rawClient = client.rawClient;
    console.log("Resolving token...");
    const token = await client.triggers.resolveWebhookToken({ workflowId });
    console.log("Token:", token);
    
    console.log("Firing webhook to start processing on agent...");
    const taskPayload = {
      task: "A user requested to create a new betting market: 'I tried creating the pool for demo player'. Use the 'create_from_prompt' capability with starknetBettor='0xTest' to process this natural language request. Follow its instructions perfectly and return ONLY the final status string."
    };
    
    const res = await rawClient.post(`/webhooks/trigger/${token}`, taskPayload, { timeout: 30000 });
    console.log("SUCCESS:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.error("ERROR from OpenServ:", err.response.status, err.response.data);
    } else {
      console.error("ERROR:", err.message);
    }
  }
}

test();
