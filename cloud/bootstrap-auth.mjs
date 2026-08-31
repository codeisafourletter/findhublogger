import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const cloudDir = fileURLToPath(new URL("./", import.meta.url));
const targetPerson = process.env.TARGET_PERSON || "Meme";
const savedProfileDir = join(cloudDir, "chrome-auth-profile");
const launchOptions = {
  channel: "chrome", headless: false, locale: "en-US",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled"]
};
let context;
try {
  context = await chromium.launchPersistentContext(savedProfileDir, launchOptions);
} catch (error) {
  const refreshProfileDir = join(cloudDir, `chrome-auth-profile-refresh-${Date.now()}`);
  console.warn(`Saved sign-in profile could not open; preserving it and using a fresh profile at ${refreshProfileDir}`);
  context = await chromium.launchPersistentContext(refreshProfileDir, launchOptions);
}
const page = await context.newPage();
await page.goto("https://www.google.com/android/find/people");
console.log("Sign in yourself. When the Find Hub People page is visible, return here and press Enter.");
process.stdin.resume();
await new Promise(resolve => process.stdin.once("data", resolve));
const signedOut = /accounts\.google\.com/.test(page.url()) || await page.getByText("Sign in", { exact: true }).first().isVisible().catch(() => false);
const targetVisible = await page.locator('[role="button"]').filter({ hasText: targetPerson }).first().isVisible().catch(() => false);
if (signedOut || !targetVisible) {
  await context.close();
  throw new Error(`Sign-in was not completed: Find Hub must show ${targetPerson} before authentication can be saved`);
}
await context.storageState({ path: fileURLToPath(new URL("./auth-state.json", import.meta.url)), indexedDB: true });
await context.close();
console.log("Saved cloud/auth-state.json. Treat this file like a password; it is excluded from Git.");
