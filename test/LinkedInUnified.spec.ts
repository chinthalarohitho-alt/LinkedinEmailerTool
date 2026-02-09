import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config();

/**
 * LinkedIn Unified Login & Scraper (Final Robust Version)
 *
 * 1. Logs in using credentials from .env
 * 2. Navigates directly to filtered search URL for "QA role" posts
 * 3. Filters for "Past 24 hours"
 * 4. Scrapes emails from the entire results area using broad extraction.
 */

const EMAILS_FILE_PATH = path.join(__dirname, "../Data/Emails.txt");

test("LinkedIn Unified Flow: Login and Scrape", async ({ page }) => {
  // Increase timeout for this test significantly
  test.setTimeout(900000); // 15 minutes

  // --- 1. LOGIN PHASE ---
  console.log("Starting LinkedIn Login...");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "load" });

  const email = process.env.LINKEDIN_USERNAME;
  const password = process.env.LINKEDIN_PASSWORD;

  if (!email || !password || email === "your_email@example.com") {
    throw new Error(
      "Please set LINKEDIN_USERNAME and LINKEDIN_PASSWORD in your .env file.",
    );
  }

  // Helper for human-like behavior
  const randomDelay = async (min = 1000, max = 3000) => {
    const delay = Math.floor(Math.random() * (max - min) + min);
    await page.waitForTimeout(delay);
  };

  await page.fill("#username", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');

  // Wait for login success
  console.log("Waiting for Login Confirmation...");
  try {
    await page.waitForSelector(
      'input[placeholder="Search"], #global-nav-typeahead',
      { timeout: 30000 },
    );
    console.log("Login verified.");
  } catch (e) {
    console.log(
      "Login verification timed out. Checking for security checks...",
    );

    const isCheckpoint =
      page.url().includes("checkpoint") ||
      (await page.getByText(/quick security check/i).isVisible());

    if (isCheckpoint) {
      console.log("\n⚠️ [ACTION REQUIRED] ⚠️");
      console.log(
        "LinkedIn blocked automation with a Security Check (Captcha).",
      );
      console.log("Please SOLVE THE CAPTCHA in the headed browser window now.");
      console.log(
        "The script will wait up to 2 minutes for you to finish...\n",
      );

      // Wait for the search bar to appear after user solves captcha
      await page.waitForSelector('input[placeholder="Search"]', {
        timeout: 120000,
      });
      console.log("✅ Checkpoint cleared! Continuing...");
    } else if (await page.getByPlaceholder("Search").first().isVisible()) {
      console.log("Login appears successful.");
    } else {
      await page.screenshot({ path: "login_error.png" });
      throw new Error("Login failed or blocked permanently.");
    }
  }

  // --- 2. SEARCH & FILTER PHASE ---
  const searchUrl =
    "https://www.linkedin.com/search/results/content/?keywords=QA%20role";
  console.log(`Navigating directly to target results page...`);
  await page.goto(searchUrl, { waitUntil: "load" });

  await page.waitForTimeout(5000); // Allow UI to stabilize

  // Close any interrupting banners (Main Page or Iframes)
  console.log("Checking for interrupting banners...");
  const mainDismiss = page
    .locator(
      'button[aria-label="Dismiss"], .artdeco-notification-badge__dismiss',
    )
    .first();
  if (await mainDismiss.isVisible()) {
    await mainDismiss.click({ force: true }).catch(() => {});
  }

  // Handle the specific payment banner often seen in an iframe
  const iframes = page.frames();
  for (const frame of iframes) {
    try {
      const dismissBtn = frame
        .locator('button:has-text("Dismiss"), button[aria-label="Dismiss"]')
        .first();
      if (await dismissBtn.isVisible()) {
        console.log("Dismissing banner in iframe...");
        await dismissBtn.click({ force: true });
      }
    } catch (e) {}
  }

  // Apply "Date posted" filter -> "Past 24 hours"
  console.log('Interacting with "Date posted" filter...');

  // getByRole is more robust as it handles nested labels and icons automatically
  const datePostedButton = page
    .getByRole("button", { name: /Date posted/i })
    .first();

  try {
    await datePostedButton.waitFor({ state: "visible", timeout: 45000 });
    await datePostedButton.click({ force: true });
    console.log('Opened "Date posted" dropdown.');
  } catch (e) {
    console.log(
      "'Date posted' button not found by role. Trying fallback text locator...",
    );
    await page
      .locator('button:has-text("Date posted")')
      .first()
      .click({ force: true });
  }

  await page.waitForTimeout(3000);

  console.log('Selecting "Past 24 hours"...');
  // Use getByRole for reliable radio button interaction
  const past24Option = page.getByRole("radio", { name: /Past 24 hours/i });
  await past24Option.waitFor({ state: "visible", timeout: 15000 });
  await past24Option.click({ force: true });
  console.log('Selected "Past 24 hours".');

  console.log("Applying filters...");
  const showResultsButton = page
    .getByRole("button", { name: /Show .* results|Show results/i })
    .last();
  await showResultsButton.waitFor({ state: "visible", timeout: 15000 });
  await showResultsButton.click({ force: true });

  await page.waitForTimeout(5000);
  console.log("Filters applied successfully. Starting extraction...");

  // --- 3. EXTRACTION PHASE ---
  let discoveredEmails: Set<string> = new Set();
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  // Load existing emails
  if (fs.existsSync(EMAILS_FILE_PATH)) {
    const existingContent = fs.readFileSync(EMAILS_FILE_PATH, "utf-8");
    existingContent.split("\n").forEach((e) => {
      const trimmed = e.trim();
      if (trimmed) discoveredEmails.add(trimmed);
    });
  }

  // Scroll and extract (25 cycles)
  for (let i = 0; i < 25; i++) {
    console.log(`Extraction Cycle ${i + 1}/25...`);

    // Surgical Scan: Iterate through each individual post container
    // "data-view-name='feed-full-update'" is the most stable selector for LinkedIn posts
    const posts = page.locator(
      'div[data-view-name="feed-full-update"], li.reusable-search__result-container, article',
    );

    let containerCount = await posts.count();

    if (containerCount === 0) {
      console.log("No containers found. Waiting for results to load...");
      await page.waitForTimeout(5000);
      containerCount = await posts.count();
    }

    console.log(`Scanning ${containerCount} post containers in this cycle...`);

    for (let j = 0; j < containerCount; j++) {
      const post = posts.nth(j);

      try {
        // User requested locator: //span[text()=' more']
        // This targets the specific span inside the expansion button
        const targetBtn = post.locator("xpath=.//span[text()=' more']");

        if ((await targetBtn.count()) > 0) {
          console.log(`[EXPANDING] Post ${j + 1}/${containerCount}...`);
          // Use force click and scroll because LinkedIn masks these
          await targetBtn
            .scrollIntoViewIfNeeded({ timeout: 2000 })
            .catch(() => {});
          await targetBtn.click({ force: true, timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(1000); // Wait for content expansion
        } else {
          // Check for Unicode "…" version just in case
          const dotsBtn = post
            .locator("button")
            .filter({ hasText: /…|see more/i })
            .first();
          if ((await dotsBtn.count()) > 0) {
            console.log(
              `[EXPANDING] Post ${j + 1}/${containerCount} (fallback)...`,
            );
            await dotsBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1000);
          }
        }
      } catch (e) {
        // Ignore expansion failures
      }

      // Extract text from just this post
      const postText = await post.innerText();
      const matches = postText.match(emailRegex);

      if (matches) {
        matches.forEach((email) => {
          const cleanEmail = email.toLowerCase();
          // Filter out obvious noise
          if (
            cleanEmail.includes("example.com") ||
            cleanEmail.length < 5 ||
            cleanEmail.startsWith("img_")
          )
            return;

          if (!discoveredEmails.has(email)) {
            console.log(`[SURGICAL DISCOVERY] Found: ${email}`);
            discoveredEmails.add(email);
            fs.appendFileSync(EMAILS_FILE_PATH, `${email}\n`);
          }
        });
      }
    }

    // Scroll trigger (Increased distance to fetch fresh batch)
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(5000); // 5s for network/rendering stabilization

    // Handle "Load more" at the bottom of the feed
    const loadMore = page
      .locator("button")
      .filter({ hasText: /Load more|See more results/i })
      .first();
    if (await loadMore.isVisible()) {
      console.log("Found 'Load more' button. Fetching next page...");
      await loadMore.click({ force: true });
      await page.waitForTimeout(3000);
    }
  }

  console.log(
    `Scraping finished. Total emails saved: ${discoveredEmails.size}`,
  );

  // --- 4. SUCCESS PHASE: Run Email Sender ---
  if (discoveredEmails.size > 0) {
    console.log("Starting Email Sender script...");
    try {
      // Run the EmailSender.js script
      execSync("node EmailSender.js", {
        stdio: "inherit",
        cwd: path.join(__dirname, ".."),
      });

      console.log("Email Sender finished processing.");
    } catch (error) {
      console.error(
        "Email Sender failed or was interrupted. Check logs for details.",
      );
    }
  } else {
    console.log("No new emails found. Skipping Email Sender.");
  }
});
