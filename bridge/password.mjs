import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
// Colon separators survive both Next.js dotenv expansion and Compose env files.
export const validPasswordHash = value => typeof value === "string" && /^scrypt:32768:8:1:[a-f0-9]{32}:[a-f0-9]{64}$/.test(value);
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password) > 256) throw new Error("Password must be 12+ characters and at most 256 bytes.");
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 32, options);
  return `scrypt:32768:8:1:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password, hash) {
  if (!validPasswordHash(hash) || typeof password !== "string" || Buffer.byteLength(password) > 256 || password.length === 0) return false;
  const [, , , , salt, expected] = hash.split(":");
  const key = await derive(password, salt, 32, options);
  return timingSafeEqual(key, Buffer.from(expected, "hex"));
}
