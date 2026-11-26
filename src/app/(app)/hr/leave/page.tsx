import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Battery } from "@/components/Battery";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { cancelLeave, decideLeave, fileLeave, setBalance } from "./actions";

export const metadata = { title: "Leave" };
const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const lab = "flex flex-col gap-1.5 text-[13px] font-semibold";
type Req = { id: string; profile_id: string; type_id: string; start_date: string; end_date: string; days: number; status: string; reason: string | null; approver_id: string | null; decline_reason: string | null };
type Unused = { profile_id: string; employee_id: string | null; name: string; department: string | null; entitled: number; used: number; pending: number; unused: number };
type Sum = { type_id: string; code: string; name: string; entitled: number; adjustment: number; used: number; pending: number; available: number };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; error?: string; req?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("leave");
  const format = await getFormatter();
  const sp = await searchParams;
  const year = Number(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 4));
  const d = (x: string) => format.dateTime(new Date(`${x}T12:00:00Z`), { day: "numeric", month: "short" });
  const supabase = await createClient();
  const hrView = viewer.hr || viewer.level === "leader";
  const [{ data: types }, { data: sum }, { data: mine }, { data: toApprove }, people] = await Promise.all([
    supabase.from("leave_types").select("id, name, code, legal").eq("active", true).order("position"),
    supabase.rpc("leave_summary", { p_profile: viewer.id, p_year: year }),
    supabase.from("leave_requests").select("*").eq("profile_id", viewer.id).order("start_date", { ascending: false }).limit(50),
    supabase.from("leave_requests").select("*").eq("status", "pending").neq("profile_id", viewer.id).order("start_date"),
    getPeople(),
  ]);
  const name = (pid: string | null) => people.find((p) => p.id === pid)?.name ?? "—";
  const typeName = (id: string) => types?.find((x) => x.id === id)?.name ?? "—";
  const pending = ((toApprove ?? []) as Req[]).filter((r) => r.approver_id === viewer.id || viewer.level === "leader");
  const all = hrView || viewer.finance || viewer.level === "manager" ? ((await supabase.from("leave_requests").select("*").order("start_date", { ascending: false }).limit(200)).data ?? []) as Req[] : [];
  const req = sp.req ? (all.find((r) => r.id === sp.req) ?? pending.find((r) => r.id === sp.req)) : null;
  const duringTasks = async (r: Req) => (await supabase.from("tasks").select("id, title, due_at").eq("owner_id", r.profile_id).is("deleted_at", null).in("status", ["todo", "in_progress", "waiting"])
    .gte("due_at", `${r.start_date}T00:00:00+08:00`).lte("due_at", `${r.end_date}T23:59:59+08:00`)).data ?? [];
  const reqRow = async (r: Req, opts: { who?: boolean; decide?: boolean; cancel?: boolean } = {}) => {
    const tasks = opts.decide || req?.id === r.id ? await duringTasks(r) : [];
    return (
      <li key={r.id} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm"><b>{opts.who ? `${name(r.profile_id)} · ` : ""}{typeName(r.type_id)}</b> · {d(r.start_date)}{r.end_date !== r.start_date ? ` – ${d(r.end_date)}` : ""} · {t("days", { n: r.days })}{r.reason ? ` · ${r.reason}` : ""}</span>
          <span className="flex items-center gap-2">
            {r.approver_id && r.status === "pending" && <span className="text-xs text-muted">{t("approver", { name: name(r.approver_id) })}</span>}
            <Pill tone={r.status === "approved" ? "ok" : r.status === "pending" ? "wait" : "plain"}>{t(`status.${r.status}`)}</Pill>
            {opts.cancel && r.status === "pending" && <form action={cancelLeave}><input type="hidden" name="id" value={r.id} /><button className="h-8 rounded-lg border border-field bg-white px-2.5 text-xs font-semibold">{t("cancel")}</button></form>}
          </span>
        </div>
        {r.decline_reason && <p className="text-xs text-danger">{r.decline_reason}</p>}
        {tasks.length > 0 && (
          <div className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] p-3 text-sm">
            <b>{t("tasksDuring")}:</b>
            <ul className="mt-1 list-disc pl-5">{tasks.map((x) => <li key={x.id}><Link href={`/tasks/${x.id}`} className="text-leaf hover:underline">{x.title}</Link> <span className="text-xs text-muted">({format.dateTime(new Date(x.due_at), { day: "numeric", month: "short" })})</span></li>)}</ul>
          </div>
        )}
        {opts.decide && (
          <form action={decideLeave} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={r.id} />
            <button name="decision" value="approve" className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("approve")}</button>
            <input name="reason" placeholder={t("declineReason")} aria-label={t("declineReason")} className="h-10 min-w-[180px] flex-1 rounded-[10px] border border-field px-3 text-sm" />
            <button name="decision" value="decline" className="h-10 rounded-[10px] border border-[#FCA5A5] bg-white px-4 text-sm font-semibold text-danger">{t("decline")}</button>
          </form>
        )}
      </li>
    );
  };
  // HR / Finance: one list of everyone's incentive leave (one query).
  const silType = (types ?? []).find((x) => x.code === "sil");
  const unused = sp.tab === "balances" && (hrView || viewer.finance)
    ? (((await supabase.rpc("unused_incentive_leave", { p_year: year })).data ?? []) as Unused[]) : [];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          {(hrView || viewer.finance) && <Link href={sp.tab === "balances" ? "/hr/leave" : "/hr/leave?tab=balances"} className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{sp.tab === "balances" ? t("title") : t("hrBalances", { year })}</Link>}
          {hrView && <Link href="/hr/leave/holidays" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("holidays")} · {t("types")}</Link>}
        </div>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      {sp.tab === "balances" ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-white p-4">
            <div className="min-w-0 flex-[1_1_240px]">
              <h2 className="text-base font-bold">{t("silTitle", { year })}</h2>
              <p className="text-sm text-muted">{t("silHrHelp")}</p>
            </div>
            <a href={`/api/export/leave-unused?year=${year}`} className="inline-flex h-11 items-center rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("exportUnused")}</a>
          </div>
          <ul className="overflow-hidden rounded-[14px] border border-line bg-white">
            {unused.map((u) => {
              const canEdit = !!silType && ((hrView && u.profile_id !== viewer.id) || viewer.level === "leader");
              return (
                <li key={u.profile_id} className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="min-w-0 flex-[1_1_180px]">
                      <b className="block truncate text-sm">{u.name}</b>
                      <span className="block truncate text-xs text-muted">{[u.employee_id, u.department].filter(Boolean).join(" · ")}</span>
                    </div>
                    <dl className="grid grid-cols-4 gap-4 text-center text-sm">
                      <div><dt className="text-[11px] text-muted">{t("colDays")}</dt><dd className="font-semibold">{u.entitled}</dd></div>
                      <div><dt className="text-[11px] text-muted">{t("colUsed")}</dt><dd className="font-semibold">{u.used}</dd></div>
                      <div><dt className="text-[11px] text-muted">{t("colPending")}</dt><dd className="font-semibold">{u.pending}</dd></div>
                      <div><dt className="text-[11px] text-muted">{t("colUnused")}</dt><dd className="font-bold text-leaf">{u.unused}</dd></div>
                    </dl>
                  </div>
                  {canEdit && (
                    <details>
                      <summary className="w-fit cursor-pointer text-xs font-semibold text-leaf">{t("editBalance")}</summary>
                      <form action={setBalance} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="profile_id" value={u.profile_id} /><input type="hidden" name="type_id" value={silType.id} /><input type="hidden" name="year" value={year} />
                        <label className="flex flex-col gap-1 text-xs font-semibold">{t("entitled")}<input name="entitled" type="number" step="0.5" min="0" defaultValue={u.entitled} className="h-10 w-24 rounded-[10px] border border-field px-3 text-sm" /></label>
                        <label className="flex flex-col gap-1 text-xs font-semibold">{t("adjust")}<input name="adjustment" type="number" step="0.5" defaultValue={0} className="h-10 w-24 rounded-[10px] border border-field px-3 text-sm" /></label>
                        <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-semibold">{t("note")}<input name="note" className="h-10 rounded-[10px] border border-field px-3 text-sm" /></label>
                        <button className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("save")}</button>
                      </form>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {((sum ?? []) as Sum[]).filter((x) => x.code === "sil" || x.used > 0 || x.pending > 0).map((x) => (
              <div key={x.type_id} className="flex flex-[1_1_240px] flex-col gap-1.5 rounded-[14px] border border-line bg-white p-4">
                <span className="text-xs font-semibold text-muted">{x.code === "sil" ? t("silName") : x.name}</span>
                <span className="font-display text-2xl font-bold">{t("available", { n: x.available - x.pending })}</span>
                <Battery percent={x.entitled + x.adjustment ? ((x.available - x.pending) / (x.entitled + x.adjustment)) * 100 : 0} label={`${x.name}: ${x.available}`} />
                <span className="text-xs text-muted">{t("used", { n: x.used })}{x.pending ? ` · ${t("pending", { n: x.pending })}` : ""}</span>
                {x.code === "sil" && <span className="text-xs text-ink-2">{t("silNote")}</span>}
              </div>
            ))}
          </div>
          <form action={fileLeave} className="grid max-w-[760px] grid-cols-1 gap-3 rounded-[14px] border border-line bg-white p-5 sm:grid-cols-2">
            <h2 className="text-base font-bold sm:col-span-2">{t("file")}</h2>
            <label className={lab}>{t("type")}<select name="type_id" required className={field}>{(types ?? []).map((x) => <option key={x.id} value={x.id}>{x.code === "sil" ? t("silName") : x.legal ? t("ifQualify", { name: x.name }) : x.name}</option>)}</select></label>
            <label className={lab}>{t("reason")}<input name="reason" className={field} /></label>
            <label className={lab}>{t("start")}<input type="date" name="start_date" required className={field} /></label>
            <label className={lab}>{t("end")}<input type="date" name="end_date" className={field} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="half_day" className="h-4 w-4 accent-[#2F6B0A]" />{t("half")}</label>
            <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("send")}</button>
          </form>
          {pending.length > 0 && (
            <section className="overflow-hidden rounded-[14px] border border-line bg-white">
              <h2 className="px-4 pt-4 pb-2 text-base font-bold">{t("approvals")}</h2>
              <ul>{await Promise.all(pending.map((r) => reqRow(r, { who: true, decide: true })))}</ul>
            </section>
          )}
          <section className="overflow-hidden rounded-[14px] border border-line bg-white">
            <h2 className="px-4 pt-4 pb-2 text-base font-bold">{t("mine")}</h2>
            {(mine ?? []).length === 0 ? <p className="px-4 pb-4 text-sm text-muted">{t("none")}</p> : <ul>{await Promise.all(((mine ?? []) as Req[]).map((r) => reqRow(r, { cancel: true })))}</ul>}
          </section>
          {all.length > 0 && (
            <section className="overflow-hidden rounded-[14px] border border-line bg-white">
              <h2 className="px-4 pt-4 pb-2 text-base font-bold">{t("all")}</h2>
              <ul>{await Promise.all(all.filter((r) => r.profile_id !== viewer.id).slice(0, 100).map((r) => reqRow(r, { who: true })))}</ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
