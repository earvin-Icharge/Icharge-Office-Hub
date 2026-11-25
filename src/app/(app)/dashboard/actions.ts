"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const METRICS = ["kiosk_locations", "rentals_per_day", "rental_sales_per_day", "repeat_customer_rate", "slots_sold", "proposals_waiting", "ad_sales_month"];
const BIZ: Record<string, string> = { kiosk_locations: "icharge", rentals_per_day: "icharge", rental_sales_per_day: "icharge", repeat_customer_rate: "icharge", slots_sold: "iscreen", proposals_waiting: "iscreen", ad_sales_month: "iscreen" };

export async function saveMetrics(f: FormData) {
  const supabase = await createClient();
  const month = `${s(f, "month")}-01`;
  for (const m of METRICS) {
    const v = s(f, m);
    if (v === "") continue;
    const { error } = await supabase.rpc("save_business_metric", { p_month: month, p_business: BIZ[m], p_metric: m, p_value: Number(v), p_note: null });
    if (error) redirect(`/dashboard/metrics?month=${s(f, "month")}&error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/dashboard/metrics?month=${s(f, "month")}&ok=1`);
}

/** CSV: month (YYYY-MM), business, metric, value. */
export async function uploadMetrics(f: FormData) {
  const file = f.get("file");
  if (!(file instanceof File)) redirect("/dashboard/metrics?error=Choose%20a%20file");
  const lines = (await (file as File).text()).replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines[0].toLowerCase().split(",").map((x) => x.trim());
  const at = (k: string) => head.indexOf(k);
  const supabase = await createClient();
  let n = 0;
  for (const l of lines.slice(1)) {
    const c = l.split(",").map((x) => x.trim());
    const month = c[at("month")]?.length === 7 ? `${c[at("month")]}-01` : c[at("month")];
    const { error } = await supabase.rpc("save_business_metric", { p_month: month, p_business: c[at("business")], p_metric: c[at("metric")], p_value: Number(c[at("value")]), p_note: null });
    if (error) redirect(`/dashboard/metrics?error=${encodeURIComponent(`Row ${n + 2}: ${error.message}`)}`);
    n++;
  }
  redirect(`/dashboard/metrics?ok=1`);
}
