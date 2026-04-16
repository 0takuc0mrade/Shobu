import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runVisionConsensus } from './src/shared/vision-oracle.js';

async function main() {
  console.log("🚀 Testing the Positive Case (Extraction Successful)");
  const imagePath = path.join(process.cwd(), 'test_images/shrapnel_win.png');
  
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Image not found at ${imagePath}`);
    process.exit(1);
  }

  const base64Image = fs.readFileSync(imagePath).toString('base64');
  console.log("📸 Loaded local image: shrapnel_win.png");

  // Run the Vision Consensus Oracle
  const result = await runVisionConsensus(base64Image, 'image/png');
  
  console.log("\n=================================");
  console.log("🏆 SETTLEMENT RESULT");
  console.log("=================================");
  console.log(`Consensus Reached: ${result.consensus}`);
  if (result.consensus) {
    console.log(`Verdict: ${JSON.stringify(result.verdict)}`);
    console.log(`Agreeing Models: ${result.agreeing_models.join(' + ')}`);
  } else {
    console.log("DISPUTE: Swarm agents disagree or failed to process the image.");
  }
}

main().catch(err => {
  console.error("Test failed", err);
});
