import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SIGNED_IN_COOKIE } from "@/lib/session";

/** Sign out and ask for a new email code: access changed (?why=changed) or device removed / 90 days (?why=device). */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const why = request.nextUrl.searchParams.get("why") === "device" ? "device" : "changed";
  const res = NextResponse.redirect(new URL(`/login?e=${why}`, request.nextUrl.origin));
  res.cookies.delete(SIGNED_IN_COOKIE);
  return res;
}
