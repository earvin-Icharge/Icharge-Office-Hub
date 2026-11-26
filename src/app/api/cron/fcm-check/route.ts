import { NextResponse, type NextRequest } from "next/server";
import { sendFcm } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Builder check: is the Firebase key in place and accepted? Sends nothing (validate only, to a dummy token). */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const r = await sendFcm("office-hub-check", { title: "check", body: "check" }, true);
    // A 400 about the dummy token means sign-in to Firebase worked.
    return NextResponse.json({ configured: r.error !== "not configured", firebaseSignIn: r.status === 400 || r.ok, status: r.status, detail: r.error.slice(0, 160) });
  } catch (e) {
    return NextResponse.json({ configured: true, firebaseSignIn: false, detail: String(e).slice(0, 160) });
  }
}
