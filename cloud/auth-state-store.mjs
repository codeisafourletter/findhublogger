import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const FORMAT_VERSION = 1;

function decodeKey(encodedKey) {
  const key = Buffer.from(encodedKey || "", "base64");
  if (key.length !== 32) throw new Error("AUTH_STATE_KEY_B64 must encode exactly 32 bytes");
  return key;
}

export function encryptAuthState(state, encodedKey) {
  const key = decodeKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return JSON.stringify({
    version: FORMAT_VERSION,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  });
}

export function decryptAuthState(payload, encodedKey) {
  const key = decodeKey(encodedKey);
  const envelope = JSON.parse(payload);
  if (envelope.version !== FORMAT_VERSION) throw new Error("Unsupported encrypted auth-state version");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

export async function loadAuthState({ encryptedPath, encodedKey, fallbackBase64 }) {
  try {
    return decryptAuthState(await readFile(encryptedPath, "utf8"), encodedKey);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return JSON.parse(Buffer.from(fallbackBase64, "base64").toString("utf8"));
  }
}

export async function saveAuthState({ state, encryptedPath, encodedKey }) {
  await mkdir(dirname(encryptedPath), { recursive: true });
  await writeFile(encryptedPath, encryptAuthState(state, encodedKey), { encoding: "utf8", mode: 0o600 });
}
