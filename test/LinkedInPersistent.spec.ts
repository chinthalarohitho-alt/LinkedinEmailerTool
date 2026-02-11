import { test, chromium, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as dotenv from "dotenv";
const sentEmailManager = require("../utils/SentEmailManager");

// Load environment variables from .env file
dotenv.config();

/**
 * LinkedIn Persistent Profile Scraper
 *
 * This script uses your ACTUAL Google Chrome profile.
 * BENEFITS:
 * - Already logged in (usually).
 * - Avoids CAPTCHAs by using your real browsing history/cookies.
 * - Looks 100% human to LinkedIn.
 *
 * CRITICAL: You MUST close all Chrome windows before running this.
 */

const EMAILS_FILE_PATH = path.join(__dirname, "../Data/Emails.txt");
const USER_DATA_DIR = path.join(__dirname, "../Data/ChromeProfile");

test("LinkedIn Persistent Scrape", async () => {
  test.setTimeout(900000); // 15 minutes

  console.log("Launching Chrome with Persistent Profile...");
  console.log(`User Data Dir: ${USER_DATA_DIR}`);

  // Launching persistent context
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome", // Use your actual Chrome app
    // No viewport set here to avoid conflicts; it will use browser defaults or maximized
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page =
    context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    // --- 1. VERIFY SESSION ---
    console.log("Checking LinkedIn session...");

    // Quick cleanup of expired sent-email entries (96 hours)
    sentEmailManager.cleanup();

    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "load" });

    if (page.url().includes("login") || page.url().includes("checkpoint")) {
      console.log("\n--- [ONE-TIME SETUP] ---");
      console.log("⚠️ LinkedIn login or CAPTCHA detected.");
      console.log("1. Please log in MANUALLY in the Chrome window.");
      console.log("2. Solve any CAPTCHAs if they appear.");
      console.log(
        "3. Once you reach your Home Feed, the script will continue and SAVE your session.",
      );
      console.log("------------------------\n");

      console.log("Waiting up to 5 minutes for you to finish...");
      await page.waitForURL("**/feed/**", { timeout: 300000 });
      console.log("✅ Session saved! You won't have to do this again.");
    } else {
      console.log("✅ Already logged in via saved session.");
    }

    // --- 2. SEARCH & FILTER PHASE ---
    const role = process.env.LINKEDIN_SEARCH_ROLE || "QA role";
    // Using direct filter URL: Past 24 hours (datePosted=["past-24h"])
    const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(role)}&datePosted=%5B%22past-24h%22%5D&origin=FACETED_SEARCH`;

    console.log(`Navigating to target results (filtered by Past 24h)...`);
    await page.goto(searchUrl, { waitUntil: "load" });
    await page.waitForTimeout(3000);

    // Close banners
    const mainDismiss = page
      .locator(
        'button[aria-label="Dismiss"], .artdeco-notification-badge__dismiss',
      )
      .first();
    if (await mainDismiss.isVisible()) {
      await mainDismiss.click({ force: true }).catch(() => {});
    }

    // --- 3. EXTRACTION PHASE ---
    let discoveredEmails: Set<string> = new Set();
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    // Load existing (Ensure directory and file exist)
    const dataDir = path.dirname(EMAILS_FILE_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(EMAILS_FILE_PATH))
      fs.writeFileSync(EMAILS_FILE_PATH, "");

    if (fs.existsSync(EMAILS_FILE_PATH)) {
      fs.readFileSync(EMAILS_FILE_PATH, "utf-8")
        .split("\n")
        .forEach((e) => {
          if (e.trim()) discoveredEmails.add(e.trim());
        });
    }

    let lastProcessedIndex = 0;
    let idleCycles = 0;
    const MAX_IDLE_CYCLES = 5;

    for (let i = 0; i < 25; i++) {
      console.log(`\n--- Cycle ${i + 1}/25 ---`);
      const posts = page.locator(
        'div[data-view-name="feed-full-update"], li.reusable-search__result-container, article',
      );
      const currentCount = await posts.count();
      console.log(`Total posts visible: ${currentCount}`);

      let newEmailsInThisCycle = 0;

      for (let j = lastProcessedIndex; j < currentCount; j++) {
        const post = posts.nth(j);
        try {
          // Expand "more" if present
          const moreBtn = post.locator("xpath=.//span[text()=' more']");
          if ((await moreBtn.count()) > 0 && (await moreBtn.isVisible())) {
            await moreBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(300); // Shorter wait for expansion
          }
        } catch (e) {}

        const text = await post.innerText();
        const matches = text.match(emailRegex);
        if (matches) {
          matches.forEach((email) => {
            if (
              !discoveredEmails.has(email) &&
              !email.includes("example.com") &&
              !sentEmailManager.isAlreadySent(email)
            ) {
              console.log(`[FOUND] ${email}`);
              discoveredEmails.add(email);
              newEmailsInThisCycle++;
              fs.appendFileSync(EMAILS_FILE_PATH, `${email}\n`);
            }
          });
        }
      }

      console.log(`New emails found in this cycle: ${newEmailsInThisCycle}`);
      lastProcessedIndex = currentCount;

      if (newEmailsInThisCycle === 0) {
        idleCycles++;
        console.log(
          `No new emails found. Idle cycles: ${idleCycles}/${MAX_IDLE_CYCLES}`,
        );
      } else {
        idleCycles = 0;
      }

      if (idleCycles >= MAX_IDLE_CYCLES) {
        console.log("Stopping: No new results found for several cycles.");
        break;
      }

      console.log("Scrolling for more content...");
      await page.evaluate(() => window.scrollBy(0, 2000));
      await page.waitForTimeout(4000);
    }

    // --- 4. SUCCESS PHASE: Run Email Sender ---
    console.log("Closing browser context...");
    await context.close();

    if (discoveredEmails.size > 0) {
      console.log("Triggering Email Sender...");
      try {
        execSync("node utils/EmailSender.js", {
          stdio: "inherit",
          cwd: path.join(__dirname, ".."),
        });
      } catch (e) {
        console.error("Email Sender failed.");
      }
    }
  } catch (error) {
    console.error("An error occurred during the scrape:", error);
    await context.close().catch(() => {});
  }
});
