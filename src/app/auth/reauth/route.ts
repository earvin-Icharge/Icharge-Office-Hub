import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SIGNED_IN_COOKIE } from "@/lib/session";

/** Access was changed after this session started: sign out and ask for a new code. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const res = NextResponse.redirect(new URL("/login?e=changed", request.nextUrl.origin));
  res.cookies.delete(SIGNED_IN_COOKIE);
  return res;
}
