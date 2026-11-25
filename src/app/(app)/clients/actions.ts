"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (id: string, error: { message: string } | null, ok: string): never => {
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}?${error ? `error=${encodeURIComponent(error.message)}` : `ok=${ok}`}`);
};

export async function saveClient(f: FormData) {
  const id = s(f, "id") || null;
  const { data, error } = await (await createClient()).rpc("save_client", { p_id: id, p: {
    name: s(f, "name"), type: s(f, "type"), business: s(f, "business"), owner_id: s(f, "owner_id"), contact_name: s(f, "contact_name"),
    contact_phone: s(f, "contact_phone"), status: s(f, "status"), is_key_account: f.get("is_key_account") === "on",
    kiosks: s(f, "kiosks").split(/[\n,]+/).map((x) => x.trim()).filter(Boolean),
  } });
  if (error) redirect(`${id ? `/clients/${id}` : "/clients/new"}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/clients");
  redirect(`/clients/${data}?ok=${id ? "saved" : "created"}`);
}
export async function saveContract(f: FormData) {
  const id = s(f, "client_id");
  const { error } = await (await createClient()).rpc("save_contract", { p_client: id, p: {
    start_date: s(f, "start_date"), end_date: s(f, "end_date"), auto_renew: f.get("auto_renew") === "on", notice_days: s(f, "notice_days"), special_terms: s(f, "special_terms"),
  } });
  back(id, error, "contract");
}
export async function setTerm(f: FormData) {
  const id = s(f, "client_id");
  const { error } = await (await createClient()).rpc("set_client_term", { p_client: id, p: {
    kind: s(f, "kind"), value: Number(s(f, "value")), unit: s(f, "unit"), basis: s(f, "basis"), payout_timing: s(f, "payout_timing"), term_text: s(f, "term_text"), reason: s(f, "reason"),
  } });
  back(id, error, "term");
}
export async function decideTerm(f: FormData) {
  const id = s(f, "client_id");
  const { error } = await (await createClient()).rpc("decide_client_term", { p_term: s(f, "term_id"), p_approve: s(f, "decision") === "approve" });
  back(id, error, "saved");
}
export async function addNote(f: FormData) {
  const id = s(f, "client_id");
  const { error } = await (await createClient()).rpc("add_client_note", { p_client: id, p_text: s(f, "text"), p_tag: s(f, "tag"), p_noted_on: s(f, "noted_on") || null });
  back(id, error, "note");
}
export async function editNote(f: FormData) {
  const id = s(f, "client_id");
  const { error } = await (await createClient()).rpc("edit_client_note", { p_note: s(f, "note_id"), p_text: s(f, "text"), p_tag: s(f, "tag") });
  back(id, error, "saved");
}
/** CSV: kiosk_id, month (YYYY-MM or YYYY-MM-DD), rentals, sales. */
export async function uploadUsage(f: FormData) {
  const file = f.get("file");
  if (!(file instanceof File)) redirect("/clients/usage?error=Choose%20a%20CSV%20file.");
  const text = (await (file as File).text()).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (k: string) => head.indexOf(k);
  if (idx("kiosk_id") < 0 || idx("month") < 0 || idx("rentals") < 0) redirect("/clients/usage?error=" + encodeURIComponent("Columns needed: kiosk_id, month, rentals, sales"));
  const rows = lines.slice(1).map((l) => l.split(",").map((x) => x.trim())).map((c) => ({
    kiosk_id: c[idx("kiosk_id")], month: (c[idx("month")].length === 7 ? `${c[idx("month")]}-01` : c[idx("month")]), rentals: Number(c[idx("rentals")] || 0),
    sales: idx("sales") >= 0 ? Number(c[idx("sales")] || 0) : 0,
  })).filter((r) => r.kiosk_id && /^\d{4}-\d{2}-\d{2}$/.test(r.month));
  const { data, error } = await (await createClient()).rpc("upload_kiosk_usage", { p_rows: rows });
  redirect(`/clients/usage?${error ? `error=${encodeURIComponent(error.message)}` : `n=${data}`}`);
}
