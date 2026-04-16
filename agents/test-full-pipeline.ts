import dotenv from 'dotenv';
dotenv.config();

import { discoverEsportsStreams } from './src/shared/youtube.js';
import { captureSettlementFrame } from './src/shared/stream-ingestion.js';
import { runVisionConsensus } from './src/shared/vision-oracle.js';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Shōbu — Full Autonomous Pipeline Test');
  console.log('  YouTube Discovery → Puppeteer Capture → Vision AI');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📡 Step 1: Discovering live esports streams on YouTube...\n');
  const streams = await discoverEsportsStreams(['Dota 2 tournament live', 'Dota 2 stream']);
  
  if (streams.length === 0) {
     console.log('❌ No live streams found right now.');
     return;
  }

  for (const s of streams) {
    console.log(`  🎮 "${s.title}"\n     Channel: ${s.channelTitle} | URL: ${s.watchUrl}\n`);
  }

  const target = streams[0];
  console.log(`🎯 Targeting: "${target.title}" by ${target.channelTitle}\n`);

  console.log('📸 Step 2: Launching stealth browser to capture screenshot...\n');
  
  try {
    const frame = await captureSettlementFrame(target.watchUrl, { timeout: 35000 });
    
    if (!frame) {
      console.log('❌ Failed to capture frame.');
      return;
    }

    console.log(`   ✅ Captured screenshot\n`);

    console.log('🧠 Step 3: Running 2-of-3 Vision AI Consensus...\n');
    const result = await runVisionConsensus(frame.base64, frame.mimeType);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`  Stream: ${target.channelTitle} — ${target.title}`);
    console.log(`  URL:    ${target.watchUrl}\n`);
    
    console.log(`  Consensus: ${result.consensus ? '✅ YES' : '🚨 NO'}`);
    console.log(`  Agreeing:  ${result.agreeing_models.join(' + ')}`);
    console.log(`  Verdict:   ${JSON.stringify(result.verdict)}\n`);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✅ PIPELINE COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
  } catch (err) {
    console.error('Error during capture or vision processing:', err);
  }
}

main().catch(console.error);
