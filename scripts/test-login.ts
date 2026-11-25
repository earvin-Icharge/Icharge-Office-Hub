/**
 * Prints a one-time sign-in link for a TEST account (SPEC.md 14.1).
 *   npm run test-login manager|hr|finance|staff
 * Runs only on the builder's computer. Never deployed (.vercelignore).
 * Refuses every email except the four plus-address test accounts.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const ALLOWED: Record<string, string> = {
  manager: "earvin+manager@icharge.com.ph",
  hr: "earvin+hr@icharge.com.ph",
  finance: "earvin+finance@icharge.com.ph",
  staff: "earvin+staff@icharge.com.ph",
};

const group = (process.argv[2] ?? "").toLowerCase();
const email = ALLOWED[group];
if (!email) {
  console.error("Use one of: manager, hr, finance, staff. (Only the four test accounts are allowed.)");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = (process.argv[3] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

db.auth.admin.generateLink({ type: "magiclink", email }).then(({ data, error }) => {
  if (error || !data.properties?.hashed_token) {
    console.error(error?.message ?? "No link returned");
    process.exit(1);
  }
  console.log(`Sign-in link for ${email} (works once, expires in 10 minutes):\n`);
  console.log(`${site}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
});
