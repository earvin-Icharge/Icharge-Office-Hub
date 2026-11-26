import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { languageFor } from "@/lib/auth-rules";
import { DEVICE_COOKIE, LOCALE_COOKIE, SIGNED_IN_COOKIE, deviceCookieOptions, signedInCookieOptions } from "@/lib/session";
import { authSettings, newDeviceKey, readDeviceKey, recordEmailSignIn } from "@/lib/device";

const TYPES: EmailOtpType[] = ["magiclink", "email", "invite", "signup", "recovery", "email_change"];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * One-time sign-in link, step 1 (GET): only shows a "Continue" button. Nothing is used up here, because browsers
 * (Chrome loading pages in advance), email and chat apps open links by themselves before the person does.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "magiclink";
  if (!/^[a-f0-9]{20,100}$/i.test(tokenHash) || !TYPES.includes(type as EmailOtpType)) return NextResponse.redirect(new URL("/login?e=link", url.origin));
  const zh = request.cookies.get("locale")?.value === "zh-Hans";
  const html = `<!doctype html><html lang="${zh ? "zh-Hans" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>Office Hub</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F6F8F1;color:#16210F;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:24px;box-sizing:border-box}
.card{max-width:380px;width:100%;background:#fff;border:1px solid #E3E8DA;border-radius:20px;padding:28px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#3D4734;font-size:15px;line-height:1.5;margin:0 0 20px}
button{width:100%;height:52px;border:0;border-radius:12px;background:#8FD220;color:#16210F;font-size:17px;font-weight:700;cursor:pointer}</style></head>
<body><form class="card" method="post" action="/auth/confirm"><h1>${zh ? "登录 Office Hub" : "Sign in to Office Hub"}</h1>
<p>${zh ? "点下面的按钮完成登录。此链接只能使用一次。" : "Tap the button to finish signing in. This link works once."}</p>
<input type="hidden" name="token_hash" value="${esc(tokenHash)}"><input type="hidden" name="type" value="${esc(type)}">
<button type="submit">${zh ? "继续进入 Office Hub" : "Continue to Office Hub"}</button></form></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

/** Step 2 (POST, after the person taps Continue): signs in on this device. */
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "magiclink") as EmailOtpType;
  const fail = NextResponse.redirect(new URL("/login?e=link", origin), { status: 303 });
  if (!tokenHash || !TYPES.includes(type)) return fail;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return fail;

  const res = NextResponse.redirect(new URL("/today", origin), { status: 303 });
  res.cookies.set(SIGNED_IN_COOKIE, new Date().toISOString(), { ...signedInCookieOptions, maxAge: (await authSettings()).sessionDays * 86400 });
  res.cookies.set(LOCALE_COOKIE, await languageFor(data.user.id), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  let key = readDeviceKey(request.cookies);
  if (!key) {
    key = newDeviceKey();
    res.cookies.set(DEVICE_COOKIE, key, deviceCookieOptions);
  }
  await recordEmailSignIn(key, data.user.id, request.headers.get("user-agent")).catch(() => undefined);
  return res;
}
