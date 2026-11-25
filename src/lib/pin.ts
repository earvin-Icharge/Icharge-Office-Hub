import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/** PIN rules (spec 3.5): 6 digits, not all the same digit, not 123456 or 654321. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "pinFormat";
  if (/^(\d)\1{5}$/.test(pin)) return "pinSame";
  if (pin === "123456" || pin === "654321") return "pinSequence";
  return null;
}

/** Stored only as a salted scrypt hash, per device. */
export function hashPin(pin: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function checkPin(pin: string, stored: string) {
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  const hash = scryptSync(pin, Buffer.from(s, "base64url"), 32);
  const expected = Buffer.from(h, "base64url");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}
