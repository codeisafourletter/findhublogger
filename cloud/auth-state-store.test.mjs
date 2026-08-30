import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encryptAuthState, decryptAuthState, loadAuthState, saveAuthState } from "./auth-state-store.mjs";

const key = Buffer.alloc(32, 7).toString("base64");
const state = { cookies: [{ name: "session", value: "private" }], origins: [] };

test("auth state round-trips through authenticated encryption", () => {
  const encrypted = encryptAuthState(state, key);
  assert.deepEqual(decryptAuthState(encrypted, key), state);
  assert.equal(encrypted.includes("private"), false);
});

test("rolling state file takes precedence over the bootstrap secret", async () => {
  const directory = await mkdtemp(join(tmpdir(), "findhub-auth-"));
  const encryptedPath = join(directory, "auth-state.enc");
  await saveAuthState({ state, encryptedPath, encodedKey: key });
  const saved = await readFile(encryptedPath, "utf8");
  assert.equal(saved.includes("private"), false);
  const fallback = Buffer.from(JSON.stringify({ cookies: [], origins: [] })).toString("base64");
  assert.deepEqual(await loadAuthState({ encryptedPath, encodedKey: key, fallbackBase64: fallback }), state);
});
