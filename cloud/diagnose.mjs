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

async function findTargetText(page) {
  const exact = page.getByText(TARGET_PERSON, { exact: true }).first();
  try {
    await exact.waitFor({ state: "visible", timeout: 15000 });
    return exact;
  } catch {
    const partial = page.getByText(TARGET_PERSON, { exact: false }).first();
    await partial.waitFor({ state: "visible", timeout: 15000 });
    return partial;
  }
}

async function safePageState(page) {
  if (!page) return null;
  const body = await page.locator("body").innerText().catch(() => "");
  let url = page.url();
  try {
    const parsed = new URL(url);
    url = `${parsed.origin}${parsed.pathname}`;
  } catch {}
  return {
    url,
    text_length: body.length,
    has_target_text: body.includes(TARGET_PERSON),
    has_people: /\bPeople\b/i.test(body),
    has_devices: /\bDevices\b/i.test(body),
    has_sign_in: /\bSign in\b/i.test(body),
    has_verify_identity: /verify (?:it'?s )?you|verify your identity/i.test(body),
    has_location_not_available: /Location not available/i.test(body),
    has_enable_javascript: /enable JavaScript/i.test(body)
  };
}

let browser;
let page;
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
  page = await context.newPage();
  await page.goto(FIND_HUB_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (/accounts\.google\.com/.test(page.url())) {
    throw new Error("Google session expired; refresh AUTH_STATE_B64");
  }
  checks.auth_session = true;

  const target = await findTargetText(page);
  checks.target_card = true;
  await target.click();

  const directions = page.locator('a[href*="maps/dir/"][href*="destination="]').first();
  try {
    await directions.waitFor({ state: "visible", timeout: 20000 });
  } catch (error) {
    const unavailable = page.getByText(/Location not available/i).first();
    if (await unavailable.isVisible().catch(() => false)) {
      console.log(JSON.stringify({ ok: true, checks, status: "location_not_available" }));
      process.exitCode = 0;
    } else {
      throw error;
    }
  }

  if (process.exitCode !== 0) {
    checks.directions_link = true;
    const coordinates = coordinatesFromHref(await directions.getAttribute("href"));
    if (!coordinates) throw new Error("Find Hub detail page did not expose parseable coordinates");
    checks.coordinates = true;
    console.log(JSON.stringify({ ok: true, checks, status: "ready" }));
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, checks, page_state: await safePageState(page), error: error.message }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
