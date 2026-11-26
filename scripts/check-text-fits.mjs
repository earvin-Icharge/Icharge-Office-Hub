// Builder check (LESSONS L-010 to L-012): every page, on a 360 px phone and a 1280 px computer, for text cut off or
// spilling out of its box, and fields or buttons pushed past the edge of their card.
// Run against a local build:  npm run build && npx next start -p 3107   then
//   node scripts/check-text-fits.mjs            (all pages)
//   OPEN=1 ONLY=/settings,/hr/checklists node scripts/check-text-fits.mjs   (with every Edit section opened)
// Signs in as the Leader (IC-0001) with the service key from .env.local and removes its test device afterwards.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config({ path: new URL("../.env.local", import.meta.url).pathname, quiet: true });
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:3107";
const WHO = process.env.WHO || "IC-0001";
const first = async (t, f = (q) => q) => (await f(admin.from(t).select("id")).limit(1).maybeSingle()).data?.id;
const emp = await first("profiles", (q) => q.eq("employee_id", "TEST-STF"));
const PAGES = process.env.ONLY ? process.env.ONLY.split(",") : ["/today", "/tasks", "/tasks/new", "/calendar", "/projects", "/projects/new", "/meetings", "/meetings/new", "/issues", "/issues/new", "/issues/report", "/issues/types",
  "/clients", "/clients/new", "/clients/usage", "/clients/payouts", "/cs", "/cs/new", "/cs/refunds", "/cs/settings", "/cs/quality", "/team",
  "/hr/employees", "/hr/employees/" + emp, "/hr/checklists", "/hr/attendance", "/hr/attendance/sites", "/hr/leave", "/hr/leave?tab=balances", "/hr/leave/holidays", "/hr/discipline", "/performance",
  "/dashboard", "/dashboard/metrics", "/reports", "/settings", "/settings/access", "/settings/updates", "/settings/backup", "/audit", "/trash", "/profile", "/notifications"];
const PUBLIC = process.env.ONLY ? [] : ["/login", "/download", "/privacy"];
const FIND = () => {
  const out = [];
  const vis = (el) => { const d = el.closest("details:not([open])"); if (d && !el.closest("summary")) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const label = (el) => `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}`;
  const canvas = document.createElement("canvas").getContext("2d");
  // 1. fields whose text is cut
  for (const el of document.querySelectorAll("main input, main select, main textarea, body > div input")) {
    if (!vis(el) || ["checkbox", "radio", "hidden", "date", "time", "datetime-local", "month", "file"].includes(el.type)) continue;
    if (el.tagName === "TEXTAREA") { if (el.value && el.scrollHeight > el.clientHeight + 2) out.push(`TEXTAREA CUT ${label(el)} "${el.value.slice(0, 40)}" needs ${el.scrollHeight}px tall has ${el.clientHeight}px`); continue; }
    const s = getComputedStyle(el); canvas.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const text = el.tagName === "SELECT" ? el.options[el.selectedIndex]?.text ?? "" : el.value || el.placeholder || "";
    const room = el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - (el.tagName === "SELECT" ? 20 : 0);
    const w = canvas.measureText(text).width;
    if (text && w > room + 2) out.push(`FIELD CUT ${label(el)} "${text.slice(0, 50)}" needs ${Math.round(w)}px has ${Math.round(room)}px`);
  }
  // 1b. boxes (fields, buttons) pushed past the edge of the card they sit in
  const cardOf = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if ((s.borderLeftWidth !== "0px" && s.borderLeftStyle !== "none") || (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent")) return e; } return null; };
  for (const el of document.querySelectorAll("main input, main select, main textarea, main button, main a")) {
    if (!vis(el) || el.type === "hidden" || el.classList.contains("sr-only")) continue;
    const c = cardOf(el); if (!c) continue;
    const cs = getComputedStyle(c); if (/(auto|scroll)/.test(cs.overflowX)) continue;
    const r = el.getBoundingClientRect(), cr = c.getBoundingClientRect();
    if (r.right > cr.right + 1.5) out.push(`BOX PAST EDGE ${label(el)} "${(el.value || el.textContent || "").trim().slice(0, 30)}" by ${Math.round(r.right - cr.right)}px`);
  }
  // 2. text spilling out of the nearest box (border or background)
  const box = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if ((s.borderLeftWidth !== "0px" && s.borderLeftStyle !== "none") || (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") || /(auto|scroll|hidden)/.test(s.overflowX)) return e; } return null; };
  const walker = document.createTreeWalker(document.querySelector("main") ?? document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const txt = n.textContent.trim(); if (!txt) continue;
    const el = n.parentElement; if (!el || !vis(el)) continue;
    const b = box(el); if (!b) continue;
    const bs = getComputedStyle(b); if (/(auto|scroll)/.test(bs.overflowX) && b.scrollWidth > b.clientWidth) continue; // sideways-scroll tables are fine
    const range = document.createRange(); range.selectNodeContents(n);
    const br = b.getBoundingClientRect();
    for (const r of range.getClientRects()) {
      if (r.width === 0) continue;
      if (r.right > br.right + 1.5 || r.left < br.left - 1.5) {
        const key = txt.slice(0, 40); if (seen.has(key)) break; seen.add(key);
        out.push(`TEXT OUT "${txt.slice(0, 50)}" in <${b.tagName.toLowerCase()} class="${String(b.className).slice(0, 50)}"> by ${Math.round(Math.max(r.right - br.right, br.left - r.left))}px`);
        break;
      }
    }
    // clipped by overflow hidden without ellipsis
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "hidden" && getComputedStyle(el).textOverflow !== "ellipsis" && !seen.has("c" + txt.slice(0, 40))) {
      seen.add("c" + txt.slice(0, 40)); out.push(`TEXT CLIPPED "${txt.slice(0, 50)}" in <${el.tagName.toLowerCase()}>`);
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`PAGE WIDER THAN SCREEN ${document.documentElement.scrollWidth}/${innerWidth}`);
  return out;
};
const b = await chromium.launch();
const report = [];
for (const [W, mobile] of [[360, true], [1280, false]]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 800 }, isMobile: mobile, hasTouch: mobile });
  const pg = await ctx.newPage();
  for (const path of PUBLIC) { await pg.goto(BASE + path, { waitUntil: "networkidle" }); const r = await pg.evaluate(FIND); r.forEach((x) => report.push(`${W} ${path} :: ${x}`)); }
  const { data: p } = await admin.from("profiles").select("id, email").eq("employee_id", WHO).single();
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: p.email });
  await pg.goto(`${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`); await pg.waitForLoadState("networkidle");
  const key = (await ctx.cookies()).find((c) => c.name === "oh_device")?.value;
  for (const path of PAGES) {
    await pg.goto(BASE + path, { waitUntil: "networkidle" }); await pg.waitForTimeout(250);
    if (process.env.OPEN) await pg.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
    const r = await pg.evaluate(FIND); r.forEach((x) => report.push(`${W} ${path} :: ${x}`));
    
  }
  await pg.evaluate(() => fetch("/auth/signout", { method: "POST" })).catch(() => {});
  if (key) await admin.from("user_devices").delete().eq("device_key", key).eq("profile_id", p.id);
  await ctx.close();
}
await b.close();
console.log(report.length ? report.join("\n") : "PASS: all text fits its boxes");
process.exitCode = report.length ? 1 : 0;
