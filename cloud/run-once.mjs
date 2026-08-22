import { chromium } from "playwright";
import { homedir } from "node:os";
import { join } from "node:path";
import { coordinatesFromHref, detailsFromLines } from "./collector-core.mjs";

const FIND_HUB_URL = process.env.FIND_HUB_URL || "https://www.google.com/android/find/people";
const TARGET_PERSON = process.env.TARGET_PERSON || "Meme";
const SHEET_ENDPOINT = required("SHEET_ENDPOINT");
const SHEET_SECRET = required("SHEET_SECRET");
const profileDir = process.env.FINDHUB_PROFILE_DIR || join(homedir(), ".findhublogger", "chrome-auth-profile");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function targetLocator(page) {
  const exact = page.getByText(TARGET_PERSON, { exact: true }).first();
  try {
    await exact.waitFor({ state: "visible", timeout: 15000 });
    return exact;
  } catch {
    const legacy = page.locator('[role="button"]').filter({ hasText: TARGET_PERSON }).first();
    await legacy.waitFor({ state: "visible", timeout: 15000 });
    return legacy;
  }
}

const context = await chromium.launchPersistentContext(profileDir, {
  channel: "chrome",
  headless: true,
  locale: "en-US",
  args: ["--disable-dev-shm-usage"]
});

try {
  const pages = context.pages();
  const page = pages[0] || await context.newPage();
  await page.goto(FIND_HUB_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  const body = await page.locator("body").innerText();
  if (/accounts\.google\.com/.test(page.url()) || /(^|\n)\s*Sign in\s*(\n|$)/i.test(body)) {
    throw new Error(`Find Hub profile is not authenticated on this runner. Run npm run auth under the same Windows account. Profile: ${profileDir}`);
  }

  const target = await targetLocator(page);
  await target.click();

  const directions = page.locator('a[href*="maps/dir/"][href*="destination="]').first();
  try {
    await directions.waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    const unavailable = page.getByText(/Location not available/i).first();
    if (await unavailable.isVisible().catch(() => false)) {
      console.log(JSON.stringify({ ok: true, appended: 0, reason: "Location not available" }));
      process.exitCode = 0;
    } else {
      throw error;
    }
  }

  if (process.exitCode !== 0) {
    const coordinates = coordinatesFromHref(await directions.getAttribute("href"));
    if (!coordinates) throw new Error("Find Hub detail page did not expose coordinates");

    const details = detailsFromLines((await page.locator("body").innerText()).split("\n"), TARGET_PERSON);
    const record = {
      captured_at: new Date().toISOString(),
      person: TARGET_PERSON,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      ...details
    };

    const response = await fetch(SHEET_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: SHEET_SECRET, records: [record] })
    });
    if (!response.ok) throw new Error(`Sheet endpoint returned HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "Sheet endpoint rejected the record");
    console.log(JSON.stringify({ ok: true, appended: result.appended ?? 1, captured_at: record.captured_at }));
  }
} finally {
  await context.close();
}
