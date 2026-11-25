import "server-only";
import { headers } from "next/headers";

/** Relying party (this website) for passkeys: the host the person is using. */
export async function relyingParty() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")).split(",")[0].trim();
  return { rpID: host.split(":")[0], origin: `${proto}://${host}`, rpName: "iCharge Office Hub" };
}

export const CHALLENGE_COOKIE = "oh_wa_challenge";
export const challengeCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 300,
};
