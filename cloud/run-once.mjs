import { chromium } from "playwright";
import { coordinatesFromHref, detailsFromLines } from "./collector-core.mjs";

const FIND_HUB_URL = process.env.FIND_HUB_URL || "https://www.google.com/android/find/people";
const TARGET_PERSON = process.env.TARGET_PERSON || "Meme";
const SHEET_ENDPOINT = required("SHEET_ENDPOINT");
const SHEET_SECRET = required("SHEET_SECRET");
const AUTH_STATE_B64 = required("AUTH_STATE_B64");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const storageState = JSON.parse(Buffer.from(AUTH_STATE_B64, "base64").toString("utf8"));
const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });

try {
  const context = await browser.newContext({ storageState, locale: "en-US" });
  const page = await context.newPage();
  await page.goto(FIND_HUB_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (/accounts\.google\.com/.test(page.url())) throw new Error("Google session expired; refresh AUTH_STATE_B64");

  const card = page.locator('[role="button"]').filter({ hasText: TARGET_PERSON }).first();
  await card.waitFor({ state: "visible", timeout: 30000 });
  if (/Location not available/i.test(await card.innerText())) {
    console.log(JSON.stringify({ ok: true, appended: 0, reason: "Location not available" }));
    process.exitCode = 0;
  } else {
    await card.click();
    const directions = page.locator('a[href*="maps/dir/"][href*="destination="]').first();
    await directions.waitFor({ state: "visible", timeout: 30000 });
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
  await browser.close();
}
