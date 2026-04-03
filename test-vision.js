import puppeteer from 'puppeteer';
import path from 'path';

// Usage: node test-vision.js [twitch_channel_name]
// Example: node test-vision.js doublelift
const channel = process.argv[2] || 'riotgames';

async function captureStream(channelName) {
  console.log(`🤖 [V2 Vision MVP] Booting headless browser for Twitch.tv/${channelName}...`);
  
  // Launch a hidden Chromium browser
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--mute-audio']
  });

  const page = await browser.newPage();
  
  // Set viewport to 1080p for clear scoreboard resolution
  await page.setViewport({ width: 1920, height: 1080 });

  console.log("📺 Loading the stream... (Waiting for player to initialize)");
  await page.goto(`https://www.twitch.tv/${channelName}`, { waitUntil: 'networkidle2' });

  // Wait an extra 8 seconds to ensure pre-roll ads (if any) or cookie banners pass
  // and the actual video starts rendering frames.
  await new Promise(r => setTimeout(r, 8000));

  // --- OPTIONAL: Click the "Accept Cookies" or "Start Watching" mature overlay if it exists ---
  try {
    const matureButton = await page.$('[data-a-target="player-overlay-mature-accept"]');
    if (matureButton) {
        console.log("🔞 Clicking mature warning overlay...");
        await matureButton.click();
        await new Promise(r => setTimeout(r, 2000));
    }
  } catch(e) {}

  const outputPath = path.join(process.cwd(), `capture_${channelName}_${Date.now()}.jpg`);
  
  console.log("📸 Snapping 1080p frame of the live broadcast...");
  // Take a high-quality JPEG screenshot
  await page.screenshot({ 
      path: outputPath, 
      type: 'jpeg', 
      quality: 80 
  });

  console.log(`✅ Success! Frame extracted and saved to: ${outputPath}`);
  console.log(`➡️ Next step in V2 Pipeline: Send this image to Gemini Pro Vision or Tesseract OCR to read the Kills/Gold differences.`);

  await browser.close();
}

captureStream(channel).catch(err => {
  console.error("❌ Pipeline Error:", err);
  process.exit(1);
});
