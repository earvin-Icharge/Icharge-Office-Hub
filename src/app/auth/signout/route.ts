import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SIGNED_IN_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const res = NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
  res.cookies.delete(SIGNED_IN_COOKIE);
  return res;
}
