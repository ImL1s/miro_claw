#!/usr/bin/env node
/**
 * MiroFish Discord Bot E2E Test via Playwright
 * Tests real user interaction through Discord Web.
 *
 * Usage: npx playwright test scripts/discord-e2e.mjs
 *   or:  node scripts/discord-e2e.mjs
 */
import { chromium } from "playwright";

const DISCORD_CHANNEL_URL = "https://discord.com/channels/372697886254694400";
const BOT_NAME = "MiroFish Bot";
const CAPTAIN_HOOK = "Captain Hook";
const TIMEOUT = 180_000; // 3 min for LLM responses
const SHORT_TIMEOUT = 30_000;

// Find #claw-main channel ID from sidebar
async function findChannel(page, channelName) {
  const link = page.locator(`a[aria-label*="${channelName}"]`).first();
  await link.waitFor({ timeout: SHORT_TIMEOUT });
  await link.click();
  await page.waitForTimeout(2000);
}

// Send a message in the current channel
async function sendMessage(page, message) {
  const input = page.locator('[role="textbox"][data-slate-editor="true"]').first();
  await input.waitFor({ timeout: SHORT_TIMEOUT });
  await input.click();
  await input.fill("");
  await page.keyboard.type(message, { delay: 30 });
  await page.keyboard.press("Enter");
  console.log(`  → Sent: "${message}"`);
}

// Wait for a bot response after a given timestamp
async function waitForBotResponse(page, botName, afterTimestamp, timeout = TIMEOUT) {
  console.log(`  ⏳ Waiting for ${botName} response...`);
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Look for messages from the bot
    const messages = page.locator(`[class*="message"]`).filter({
      has: page.locator(`span:has-text("${botName}")`)
    });

    const count = await messages.count();
    if (count > 0) {
      const lastMsg = messages.last();
      const text = await lastMsg.innerText();
      // Check if this is a new message (basic check: contains bot name)
      if (text.includes(botName)) {
        const content = text.split("\n").filter(l => !l.includes(botName) && l.trim()).join("\n");
        if (content.trim()) {
          console.log(`  ✓ ${botName} responded (${Math.round((Date.now() - start) / 1000)}s)`);
          console.log(`    Preview: ${content.slice(0, 200)}${content.length > 200 ? "..." : ""}`);
          return content;
        }
      }
    }
    await page.waitForTimeout(3000);
  }

  console.log(`  ✗ ${botName} did not respond within ${timeout / 1000}s`);
  return null;
}

// Count messages from a specific bot in view
async function countBotMessages(page, botName) {
  const messages = page.locator(`[id^="chat-messages"] [class*="username"]:has-text("${botName}")`);
  return await messages.count();
}

async function main() {
  console.log("🐟 MiroFish Discord Bot E2E Test\n");

  // Launch with user's Chrome profile for existing Discord session
  const userDataDir = `${process.env.HOME}/Library/Application Support/Google/Chrome`;

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
    args: [
      "--profile-directory=Default",
      "--disable-blink-features=AutomationControlled",
    ],
    viewport: { width: 1400, height: 800 },
  });

  const page = browser.pages()[0] || await browser.newPage();
  const results = [];

  try {
    // Navigate to Discord server
    console.log("📡 Opening Discord...");
    await page.goto(DISCORD_CHANNEL_URL, { waitUntil: "networkidle", timeout: SHORT_TIMEOUT });
    await page.waitForTimeout(3000);

    // Find and click #claw-main channel
    console.log("📺 Navigating to #claw-main...");
    await findChannel(page, "claw-main");
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/discord-e2e-start.png" });
    console.log("📸 Screenshot: /tmp/discord-e2e-start.png\n");

    const beforeCount = await countBotMessages(page, BOT_NAME);

    // ── Test 1: Report query ──
    console.log("── Test 1: 報告摘要查詢 ──");
    await sendMessage(page, "報告摘要是什麼？");
    const t1Start = Date.now();

    // Wait for MiroFish Bot to respond
    await page.waitForTimeout(5000); // Give agent time to process

    // Poll for new bot message
    let test1Pass = false;
    for (let i = 0; i < 60; i++) { // max 3 min
      const currentCount = await countBotMessages(page, BOT_NAME);
      if (currentCount > beforeCount) {
        test1Pass = true;
        const elapsed = Math.round((Date.now() - t1Start) / 1000);
        console.log(`  ✓ Bot responded in ${elapsed}s`);
        break;
      }
      await page.waitForTimeout(3000);
    }

    if (!test1Pass) {
      console.log("  ✗ Bot did not respond to report query");
    }

    await page.screenshot({ path: "/tmp/discord-e2e-test1.png" });
    results.push({ test: "報告摘要查詢", pass: test1Pass });

    // ── Test 2: Predict command ──
    console.log("\n── Test 2: 推演啟動 ──");
    const beforeHook = await countBotMessages(page, CAPTAIN_HOOK);
    await sendMessage(page, "幫我推演一下如果 Solana ETF 在2026年通過會怎樣");

    let test2Pass = false;
    const t2Start = Date.now();
    for (let i = 0; i < 40; i++) { // max 2 min
      const hookCount = await countBotMessages(page, CAPTAIN_HOOK);
      const botCount = await countBotMessages(page, BOT_NAME);
      if (hookCount > beforeHook || botCount > (test1Pass ? beforeCount + 1 : beforeCount)) {
        test2Pass = true;
        const elapsed = Math.round((Date.now() - t2Start) / 1000);
        console.log(`  ✓ Predict triggered in ${elapsed}s`);
        break;
      }
      await page.waitForTimeout(3000);
    }

    if (!test2Pass) {
      console.log("  ✗ Predict not triggered");
    }

    await page.screenshot({ path: "/tmp/discord-e2e-test2.png" });
    results.push({ test: "推演啟動", pass: test2Pass });

    // ── Test 3: Status query ──
    console.log("\n── Test 3: 狀態查詢 ──");
    const beforeStatus = await countBotMessages(page, BOT_NAME);
    await sendMessage(page, "目前有沒有正在跑的推演？");

    let test3Pass = false;
    const t3Start = Date.now();
    for (let i = 0; i < 40; i++) {
      const currentCount = await countBotMessages(page, BOT_NAME);
      if (currentCount > beforeStatus) {
        test3Pass = true;
        const elapsed = Math.round((Date.now() - t3Start) / 1000);
        console.log(`  ✓ Status response in ${elapsed}s`);
        break;
      }
      await page.waitForTimeout(3000);
    }

    if (!test3Pass) {
      console.log("  ✗ Status query not answered");
    }

    await page.screenshot({ path: "/tmp/discord-e2e-test3.png" });
    results.push({ test: "狀態查詢", pass: test3Pass });

    // ── Summary ──
    console.log("\n══════════════════════════════");
    console.log("📊 E2E Test Summary:");
    for (const r of results) {
      console.log(`  ${r.pass ? "✓" : "✗"} ${r.test}`);
    }
    const passed = results.filter(r => r.pass).length;
    console.log(`\n  ${passed}/${results.length} passed`);
    console.log("══════════════════════════════");

    // Final screenshot
    await page.screenshot({ path: "/tmp/discord-e2e-final.png" });
    console.log("\n📸 Final screenshot: /tmp/discord-e2e-final.png");

  } catch (err) {
    console.error("❌ Test error:", err.message);
    await page.screenshot({ path: "/tmp/discord-e2e-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
