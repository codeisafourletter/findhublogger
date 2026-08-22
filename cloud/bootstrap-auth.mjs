import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ locale: "en-US" });
const page = await context.newPage();
await page.goto("https://www.google.com/android/find/people");
console.log("Sign in yourself. When the Find Hub People page is visible, return here and press Enter.");
process.stdin.resume();
await new Promise(resolve => process.stdin.once("data", resolve));
if (/accounts\.google\.com/.test(page.url())) {
  await browser.close();
  throw new Error("Sign-in was not completed");
}
await context.storageState({ path: new URL("./auth-state.json", import.meta.url), indexedDB: true });
await browser.close();
console.log("Saved cloud/auth-state.json. Treat this file like a password; it is excluded from Git.");
