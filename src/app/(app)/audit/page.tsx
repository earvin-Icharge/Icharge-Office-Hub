import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Audit log" };
type Row = { id: number; actor_id: string | null; action: string; table_name: string | null; subject_profile_id: string | null; old: Record<string, unknown> | null; new: Record<string, unknown> | null; at: string };
const SKIP = new Set(["updated_at", "created_at", "last_seen_at"]);

/** Leader: everything. HR: HR changes (spec 3.3). Rows come through the database's own access rules. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string; person?: string; from?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.level === "leader" || viewer.hr)) notFound();
  const t = await getTranslations("audit");
  const format = await getFormatter();
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(300);
  if (sp.table) q = q.eq("table_name", sp.table);
  if (sp.person) q = q.eq("subject_profile_id", sp.person);
  if (sp.from) q = q.gte("at", `${sp.from}T00:00:00+08:00`);
  const [{ data }, people] = await Promise.all([q, getPeople()]);
  const name = (pid: string | null) => (pid ? people.find((p) => p.id === pid)?.name ?? "—" : "system");
  const changed = (r: Row) => {
    if (r.action === "view_sensitive") return t("viewed", { what: String(r.new?.viewed ?? r.table_name) });
    if (!r.old || !r.new) return r.action;
    const keys = Object.keys(r.new).filter((k) => !SKIP.has(k) && JSON.stringify(r.old?.[k]) !== JSON.stringify(r.new?.[k]));
    const show = (v: unknown) => { const s = v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v); return s.length > 40 ? `${s.slice(0, 40)}…` : s; };
    const sensitive = ["pin_hash", "passkey_public_key", "passkey_credential_id"];
    return keys.slice(0, 6).map((k) => sensitive.includes(k) ? k : `${k}: ${show(r.old?.[k])} → ${show(r.new?.[k])}`).join("; ") || r.action;
  };
  const tables = ["profiles", "access_requests", "invites", "access_changes", "hr_records", "hr_private", "hr_notes", "employee_documents", "attendance", "attendance_location", "leave_requests", "leave_balances", "disciplinary_cases", "issues", "clients", "client_terms", "cs_refund_requests", "app_settings"];
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <p className="text-sm text-muted">{t("help")}</p>
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">{t("table")}<select name="table" defaultValue={sp.table ?? ""} className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm"><option value="">{t("all")}</option>{tables.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">{t("person")}<select name="person" defaultValue={sp.person ?? ""} className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm"><option value="">{t("all")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">{t("from")}<input type="date" name="from" defaultValue={sp.from ?? ""} className="h-10 rounded-[10px] border border-field bg-white px-3 text-sm" /></label>
        <button className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">OK</button>
      </form>
      {(data ?? []).length > 0 && (
        /* Phones: one card per change */
        <ul className="flex flex-col gap-2 min-[700px]:hidden">
          {((data ?? []) as Row[]).map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-[14px] border border-line bg-white p-3.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <b>{name(r.actor_id)}</b>
                <span className="text-xs text-muted">{format.dateTime(new Date(r.at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              </div>
              <p className="text-xs break-words text-muted">{r.table_name ?? "—"} · {r.action}{r.subject_profile_id ? ` · ${name(r.subject_profile_id)}` : ""}</p>
              <p className="text-xs break-words text-ink-2">{changed(r)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className={`overflow-x-auto rounded-[14px] border border-line bg-white ${(data ?? []).length > 0 ? "hidden min-[700px]:block" : ""}`}>
        {(data ?? []).length === 0 ? <p className="p-4 text-sm text-muted">{t("none")}</p> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="p-3">When</th><th className="p-3">{t("actor")}</th><th className="p-3">{t("table")}</th><th className="p-3">{t("person")}</th><th className="p-3">What</th></tr></thead>
            <tbody>{((data ?? []) as Row[]).map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="p-3 whitespace-nowrap text-xs">{format.dateTime(new Date(r.at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                <td className="p-3">{name(r.actor_id)}</td><td className="p-3 text-xs">{r.table_name ?? "—"} · {r.action}</td><td className="p-3">{name(r.subject_profile_id)}</td>
                <td className="p-3 text-xs text-ink-2">{changed(r)}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
