import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());
import path from 'path';
import { runVisionConsensus } from './src/shared/vision-oracle.js';
import fs from 'fs';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("❌ Usage: npx tsx run-vod.ts <VOD_URL>");
    process.exit(1);
  }

  console.log(`🎬 Capturing VOD Frame from: ${url}`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log("📺 Loading the player...");
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait a generous amount of time for video to load and buffer, especially if it's a VOD with a timestamp
  console.log("⏳ Waiting 10 seconds for video to play and buffer at the target timestamp...");
  await new Promise(r => setTimeout(r, 10000));

  // Dismiss any overlays if possible (optional: YouTube/Twitch cookie banners)
  try {
    const matureButton = await page.$('[data-a-target="player-overlay-mature-accept"]');
    if (matureButton) await matureButton.click();
  } catch (e) {}

  const outputPath = path.join(process.cwd(), `test_images/capture_${Date.now()}.jpg`);
  console.log("📸 Snapping 1080p frame...");
  
  await page.screenshot({ 
    path: outputPath, 
    type: 'jpeg',
    quality: 80
  });

  console.log(`✅ Success! Frame extracted and saved to: ${outputPath}`);
  await browser.close();

  const base64Image = fs.readFileSync(outputPath).toString('base64');

  console.log("\n🔍 Running AI Vision Oracle Consensus...");
  const result = await runVisionConsensus(base64Image, 'image/jpeg');
  
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
  console.error("❌ Pipeline Error:", err);
  process.exit(1);
});
