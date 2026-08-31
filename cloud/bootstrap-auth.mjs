import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const cloudDir = fileURLToPath(new URL("./", import.meta.url));
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
if (/accounts\.google\.com/.test(page.url())) {
  await context.close();
  throw new Error("Sign-in was not completed");
}
await context.storageState({ path: fileURLToPath(new URL("./auth-state.json", import.meta.url)), indexedDB: true });
await context.close();
console.log("Saved cloud/auth-state.json. Treat this file like a password; it is excluded from Git.");
