import { chromium } from "playwright";
import { homedir } from "node:os";
import { join } from "node:path";

const FIND_HUB_URL = process.env.FIND_HUB_URL || "https://www.google.com/android/find/people";
const TARGET_PERSON = process.env.TARGET_PERSON || "Meme";
const profileDir = process.env.FINDHUB_PROFILE_DIR || join(homedir(), ".findhublogger", "chrome-auth-profile");

const context = await chromium.launchPersistentContext(profileDir, {
  channel: "chrome",
  headless: false,
  locale: "en-US",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled"]
});

try {
  const pages = context.pages();
  const page = pages[0] || await context.newPage();
  await page.goto(FIND_HUB_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log(`Sign in yourself. When ${TARGET_PERSON} is visible on the Find Hub People page, return here and press Enter.`);
  process.stdin.resume();
  await new Promise(resolve => process.stdin.once("data", resolve));

  const body = await page.locator("body").innerText();
  if (/accounts\.google\.com/.test(page.url()) || /(^|\n)\s*Sign in\s*(\n|$)/i.test(body)) {
    throw new Error("Google sign-in was not completed in the persistent Find Hub profile");
  }
  if (!body.includes(TARGET_PERSON)) {
    throw new Error(`Find Hub is signed in, but ${TARGET_PERSON} is not visible. Confirm the correct Google account and location share.`);
  }

  console.log(`Persistent Find Hub profile verified at ${profileDir}.`);
} finally {
  await context.close();
}
