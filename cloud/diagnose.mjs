import { chromium } from "playwright";
import { coordinatesFromHref } from "./collector-core.mjs";

const FIND_HUB_URL = process.env.FIND_HUB_URL || "https://www.google.com/android/find/people";
const TARGET_PERSON = process.env.TARGET_PERSON || "Meme";
const AUTH_STATE_B64 = required("AUTH_STATE_B64");
const SHEET_ENDPOINT = required("SHEET_ENDPOINT");
const SHEET_SECRET = required("SHEET_SECRET");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const checks = {
  sheet_endpoint: false,
  auth_session: false,
  target_card: false,
  directions_link: false,
  coordinates: false
};

async function probeSheetEndpoint() {
  const response = await fetch(SHEET_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: SHEET_SECRET, records: [] })
  });
  if (!response.ok) throw new Error(`Sheet endpoint returned HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Sheet endpoint rejected diagnostic request");
  checks.sheet_endpoint = true;
}

let browser;
try {
  await probeSheetEndpoint();

  let storageState;
  try {
    storageState = JSON.parse(Buffer.from(AUTH_STATE_B64, "base64").toString("utf8"));
  } catch {
    throw new Error("AUTH_STATE_B64 is not valid base64-encoded Playwright storage state");
  }

  browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const context = await browser.newContext({ storageState, locale: "en-US" });
  const page = await context.newPage();
  await page.goto(FIND_HUB_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (/accounts\.google\.com/.test(page.url())) {
    throw new Error("Google session expired; refresh AUTH_STATE_B64");
  }
  checks.auth_session = true;

  const card = page.locator('[role="button"]').filter({ hasText: TARGET_PERSON }).first();
  await card.waitFor({ state: "visible", timeout: 30000 });
  checks.target_card = true;

  if (/Location not available/i.test(await card.innerText())) {
    console.log(JSON.stringify({ ok: true, checks, status: "location_not_available" }));
    process.exitCode = 0;
  } else {
    await card.click();
    const directions = page.locator('a[href*="maps/dir/"][href*="destination="]').first();
    await directions.waitFor({ state: "visible", timeout: 30000 });
    checks.directions_link = true;

    const coordinates = coordinatesFromHref(await directions.getAttribute("href"));
    if (!coordinates) throw new Error("Find Hub detail page did not expose parseable coordinates");
    checks.coordinates = true;

    console.log(JSON.stringify({ ok: true, checks, status: "ready" }));
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, checks, error: error.message }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
