// -----------------------------------------------------------------------
// Shōbu Stream Ingestion — Puppeteer Stealth Screenshot Capture
// -----------------------------------------------------------------------
// Launches a stealth headless browser to capture screenshots from public
// video sources (Twitch VODs, YouTube clips, community uploads).
//
// Design principle: Point-in-time sampler, NOT a continuous watcher.
// Spin up → grab frames → close browser → free RAM. Zero residual cost.
// -----------------------------------------------------------------------

import puppeteerExtra from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type { Browser, Page } from 'puppeteer-core'

// Register stealth plugin to bypass Twitch/YouTube bot detection
puppeteerExtra.use(StealthPlugin())

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface CapturedFrame {
  /** Base64-encoded PNG screenshot */
  base64: string
  /** MIME type (always image/png) */
  mimeType: string
  /** Unix timestamp when this frame was captured */
  capturedAt: number
  /** Source URL this frame was captured from */
  source: string
  /** Frame index in the capture sequence */
  frameIndex: number
}

export interface CaptureOptions {
  /** Stream/VOD URL to capture from */
  url: string
  /** Number of screenshots to take (default: 3) */
  frameCount?: number
  /** Delay between captures in ms (default: 2000) */
  delayBetweenMs?: number
  /** Max time to wait for video to load in ms (default: 30000) */
  timeout?: number
  /** Viewport width (default: 1920) */
  viewportWidth?: number
  /** Viewport height (default: 1080) */
  viewportHeight?: number
}

export interface CaptureResult {
  success: boolean
  frames: CapturedFrame[]
  error?: string
  /** Total elapsed time in ms */
  elapsedMs: number
  /** Detected platform */
  platform: 'twitch' | 'youtube' | 'unknown'
}

// -----------------------------------------------------------------------
// Platform detection
// -----------------------------------------------------------------------

function detectPlatform(url: string): 'twitch' | 'youtube' | 'unknown' {
  const lower = url.toLowerCase()
  if (lower.includes('twitch.tv')) return 'twitch'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube'
  return 'unknown'
}

// -----------------------------------------------------------------------
// Chrome executable path resolution
// -----------------------------------------------------------------------

function findChromePath(): string {
  // Environment variable override
  if (process.env.CHROME_EXECUTABLE_PATH) {
    return process.env.CHROME_EXECUTABLE_PATH
  }
  // Common Linux paths
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ]
  // On this system we know it's at /usr/bin/google-chrome
  // but we check all candidates for portability
  for (const path of candidates) {
    try {
      const fs = require('fs')
      if (fs.existsSync(path)) return path
    } catch {
      // continue
    }
  }
  return '/usr/bin/google-chrome'
}

// -----------------------------------------------------------------------
// Twitch-specific automation
// -----------------------------------------------------------------------

async function handleTwitchPage(page: Page): Promise<void> {
  // 1. Dismiss mature content warning
  try {
    const matureButton = await page.waitForSelector(
      '[data-a-target="player-overlay-mature-accept"], ' +
      'button[data-a-target="content-classification-gate-overlay-start-watching-button"], ' +
      '[data-a-target="player-overlay-accept"]',
      { timeout: 5000 }
    )
    if (matureButton) {
      await matureButton.click()
      console.log('[stream-ingestion] ✅ Dismissed Twitch mature content warning')
      await sleep(1000)
    }
  } catch {
    // No mature content warning — normal
  }

  // 2. Dismiss cookie consent banners
  try {
    const cookieButton = await page.waitForSelector(
      '[data-a-target="consent-banner-accept"], ' +
      'button.consent-banner__button--accept, ' +
      '[aria-label="Accept"]',
      { timeout: 3000 }
    )
    if (cookieButton) {
      await cookieButton.click()
      console.log('[stream-ingestion] ✅ Dismissed cookie consent')
      await sleep(500)
    }
  } catch {
    // No cookie banner — normal
  }

  // 3. Wait for the video player to render
  try {
    await page.waitForSelector('video', { timeout: 15000 })
    console.log('[stream-ingestion] ✅ Twitch video element found')
    // Extra wait for video to actually start playing
    await sleep(3000)
  } catch {
    console.warn('[stream-ingestion] ⚠️ Video element not found within timeout')
  }

  // 4. Try to hide Twitch UI overlays for cleaner screenshots
  await page.evaluate(() => {
    const selectors = [
      '.top-nav', '.stream-info-bar', '.channel-info-content',
      '.chat-shell', '.right-column', '.player-controls__right-control-group',
      '[data-a-target="player-controls"]', '.tw-c-background-overlay',
    ]
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        ;(el as HTMLElement).style.display = 'none'
      })
    }
  }).catch(() => {})
}

// -----------------------------------------------------------------------
// YouTube-specific automation
// -----------------------------------------------------------------------

async function handleYouTubePage(page: Page): Promise<void> {
  // 1. Dismiss cookie consent
  try {
    const consentButton = await page.waitForSelector(
      'button[aria-label="Accept all"], ' +
      'button[aria-label="Accept the use of cookies and other data for the purposes described"], ' +
      '#yDmH0d button:last-child, ' +
      'tp-yt-paper-button.ytd-consent-bump-v2-lightbox:last-child',
      { timeout: 5000 }
    )
    if (consentButton) {
      await consentButton.click()
      console.log('[stream-ingestion] ✅ Dismissed YouTube cookie consent')
      await sleep(1000)
    }
  } catch {
    // No consent dialog
  }

  // 2. Wait for video player
  try {
    await page.waitForSelector('video', { timeout: 15000 })
    console.log('[stream-ingestion] ✅ YouTube video element found')
    await sleep(3000)
  } catch {
    console.warn('[stream-ingestion] ⚠️ Video element not found within timeout')
  }

  // 3. Skip ads if present
  try {
    const skipButton = await page.waitForSelector(
      '.ytp-ad-skip-button, .ytp-skip-ad-button, button.ytp-ad-skip-button-modern',
      { timeout: 8000 }
    )
    if (skipButton) {
      await skipButton.click()
      console.log('[stream-ingestion] ✅ Skipped YouTube ad')
      await sleep(1000)
    }
  } catch {
    // No ad to skip
  }

  // 4. Hide YouTube chrome for cleaner screenshots
  await page.evaluate(() => {
    const selectors = [
      '#masthead-container', '#related', '#comments', '#chat',
      '.ytp-chrome-bottom', '.ytp-chrome-top',
    ]
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        ;(el as HTMLElement).style.display = 'none'
      })
    }
    // Make the video player full-width
    const player = document.querySelector('#movie_player') as HTMLElement
    if (player) {
      player.style.width = '100vw'
      player.style.height = '100vh'
      player.style.position = 'fixed'
      player.style.top = '0'
      player.style.left = '0'
      player.style.zIndex = '9999'
    }
  }).catch(() => {})
}

// -----------------------------------------------------------------------
// Core capture function
// -----------------------------------------------------------------------

/**
 * Captures screenshots from a public video stream or VOD.
 *
 * Launches a stealth headless browser, navigates to the URL,
 * handles platform-specific UI (mature content warnings, cookie
 * banners, ads), captures N screenshots, then immediately closes
 * the browser to free RAM.
 *
 * Cost model: ~30s of Chrome per invocation. At 50 pools/day,
 * that's ~25 minutes of total compute — negligible.
 */
export async function captureStreamFrames(
  options: CaptureOptions
): Promise<CaptureResult> {
  const {
    url,
    frameCount = 3,
    delayBetweenMs = 2000,
    timeout = 30000,
    viewportWidth = 1920,
    viewportHeight = 1080,
  } = options

  const startTime = Date.now()
  const platform = detectPlatform(url)
  let browser: Browser | null = null

  console.log(`[stream-ingestion] 🚀 Launching stealth browser for ${platform} URL: ${url}`)

  try {
    // Launch stealth browser with system Chrome
    browser = await puppeteerExtra.launch({
      headless: true,
      executablePath: findChromePath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        // Reduce memory footprint (but avoid --single-process as it crashes on YT)
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--mute-audio',
      ],
    }) as unknown as Browser

    const page = await browser.newPage()

    // Set viewport to full HD for crisp screenshots
    await page.setViewport({ width: viewportWidth, height: viewportHeight })

    // Spoof a realistic user agent (stealth plugin handles most signals,
    // but we add an extra layer of realism)
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    )

    // Navigate to the stream/VOD
    // IMPORTANT: Use 'domcontentloaded' not 'networkidle2' — streaming
    // platforms continuously fetch video chunks and never become "idle"
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout,
    }).catch(err => {
      console.warn(`[stream-ingestion] ⚠️ page.goto timeout/error (ignoring): ${err.message}`)
    })

    console.log(`[stream-ingestion] ✅ Page loaded (${Date.now() - startTime}ms)`)

    // Handle platform-specific UI elements
    switch (platform) {
      case 'twitch':
        await handleTwitchPage(page)
        break
      case 'youtube':
        await handleYouTubePage(page)
        break
      default:
        // Unknown platform — just wait for any video element
        try {
          await page.waitForSelector('video', { timeout: 10000 })
          await sleep(3000)
        } catch {
          console.warn('[stream-ingestion] ⚠️ No video element found on unknown platform')
        }
    }

    // Capture the frames
    const frames: CapturedFrame[] = []

    for (let i = 0; i < frameCount; i++) {
      const screenshotBuffer = await page.screenshot({
        encoding: 'base64',
        type: 'png',
        fullPage: false,
      })

      frames.push({
        base64: screenshotBuffer as string,
        mimeType: 'image/png',
        capturedAt: Date.now(),
        source: url,
        frameIndex: i,
      })

      console.log(`[stream-ingestion] 📸 Captured frame ${i + 1}/${frameCount}`)

      // Wait between captures (except after the last one)
      if (i < frameCount - 1) {
        await sleep(delayBetweenMs)
      }
    }

    const elapsedMs = Date.now() - startTime
    console.log(`[stream-ingestion] ✅ Capture complete: ${frames.length} frames in ${elapsedMs}ms`)

    return {
      success: true,
      frames,
      elapsedMs,
      platform,
    }
  } catch (err: any) {
    const elapsedMs = Date.now() - startTime
    const errorMsg = err?.message ?? String(err)
    console.error(`[stream-ingestion] ❌ Capture failed after ${elapsedMs}ms: ${errorMsg}`)

    return {
      success: false,
      frames: [],
      error: errorMsg,
      elapsedMs,
      platform,
    }
  } finally {
    // CRUCIAL: Always close the browser to prevent memory leaks
    if (browser) {
      try {
        await browser.close()
        console.log('[stream-ingestion] 🧹 Browser closed — RAM freed')
      } catch (closeErr: any) {
        console.error('[stream-ingestion] ⚠️ Browser close error:', closeErr?.message)
      }
    }
  }
}

// -----------------------------------------------------------------------
// Convenience: capture + select best frame
// -----------------------------------------------------------------------

/**
 * Check if Puppeteer/Chrome is available on this platform.
 * Returns false on Android/Termux where Chrome can't be installed.
 */
function isPuppeteerAvailable(): boolean {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ].filter(Boolean) as string[]

  try {
    const fs = require('fs')
    return candidates.some(p => fs.existsSync(p))
  } catch {
    return false
  }
}

/**
 * Fetches a live thumbnail from a Twitch or YouTube URL via their APIs.
 * This is the headless fallback when Puppeteer/Chrome is not available
 * (e.g. on Android/Termux). Twitch thumbnails update every ~5 minutes,
 * YouTube thumbnails are high-res snapshots of the current stream.
 */
async function fetchThumbnailFallback(
  url: string
): Promise<{ base64: string; mimeType: string } | null> {
  const platform = detectPlatform(url)
  let thumbnailUrl: string | null = null

  if (platform === 'twitch') {
    // Extract channel name from URL (e.g. twitch.tv/faker -> faker)
    const match = url.match(/twitch\.tv\/([^/?#]+)/i)
    if (!match) return null
    const channel = match[1]

    // Use Twitch Helix API to get live thumbnail
    const clientId = process.env.TWITCH_CLIENT_ID
    const clientSecret = process.env.TWITCH_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      console.warn('[stream-ingestion] Twitch credentials not available for thumbnail fallback')
      return null
    }

    try {
      // Get app token
      const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        }),
      })
      if (!tokenRes.ok) return null
      const { access_token } = await tokenRes.json()

      // Get stream info with thumbnail
      const streamRes = await fetch(
        `https://api.twitch.tv/helix/streams?user_login=${channel}`,
        { headers: { 'Client-ID': clientId, Authorization: `Bearer ${access_token}` } }
      )
      if (!streamRes.ok) return null
      const streamData = await streamRes.json()
      const stream = streamData.data?.[0]
      if (!stream?.thumbnail_url) return null

      // Twitch thumbnails have {width}x{height} placeholders — fill them
      thumbnailUrl = stream.thumbnail_url
        .replace('{width}', '1920')
        .replace('{height}', '1080')
    } catch (err: any) {
      console.warn(`[stream-ingestion] Twitch thumbnail fetch failed: ${err?.message}`)
      return null
    }
  } else if (platform === 'youtube') {
    // Extract video ID from various YouTube URL formats
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    if (!match) return null
    const videoId = match[1]
    // YouTube provides thumbnails at predictable URLs — maxresdefault is 1920x1080
    thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  }

  if (!thumbnailUrl) return null

  try {
    console.log(`[stream-ingestion] 📸 Fetching ${platform} thumbnail (headless fallback): ${thumbnailUrl}`)
    const res = await fetch(thumbnailUrl)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    console.log(`[stream-ingestion] ✅ Thumbnail fetched (${Math.round(buffer.byteLength / 1024)}KB)`)
    return { base64, mimeType: contentType }
  } catch (err: any) {
    console.warn(`[stream-ingestion] Thumbnail download failed: ${err?.message}`)
    return null
  }
}

/**
 * Captures multiple frames from a stream and returns the single best
 * frame (last captured — most likely to show the final game state).
 *
 * This is the primary entry point for the settler agent:
 *   const { base64, mimeType } = await captureSettlementFrame(vodUrl)
 *   const result = await runVisionConsensus(base64, mimeType)
 *
 * When Puppeteer/Chrome is not available (Android/Termux), automatically
 * falls back to fetching the stream's live thumbnail via the platform API.
 */
export async function captureSettlementFrame(
  url: string,
  options?: Partial<CaptureOptions>
): Promise<{ base64: string; mimeType: string } | null> {
  
  // Try Puppeteer pipeline first
  const result = await captureStreamFrames({
    url,
    frameCount: 3,
    delayBetweenMs: 2000,
    ...options,
  })

  if (!result.success || result.frames.length === 0) {
    console.error(`[stream-ingestion] Puppeteer capture failed or no frames for ${url}. Trying thumbnail fallback...`)
    return fetchThumbnailFallback(url)
  }

  // Return the last frame (most likely to show final game state / scoreboard)
  const bestFrame = result.frames[result.frames.length - 1]
  return {
    base64: bestFrame.base64,
    mimeType: bestFrame.mimeType,
  }
}

// -----------------------------------------------------------------------
// Utility
// -----------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
