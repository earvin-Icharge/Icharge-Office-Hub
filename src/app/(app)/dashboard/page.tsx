import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Battery } from "@/components/Battery";
import { BusinessIcon } from "@/components/BusinessIcon";
import { BusinessSwitch } from "@/components/BusinessSwitch";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Dashboard" };
type Dept = { id: string; name: string; open: number; overdue: number; done_month: number; on_time_month: number };
type Counts = { by_department: Dept[] | null; projects: Record<string, number> | null; open_issues: Record<string, number> | null;
  attendance: Record<string, number>; pending: Record<string, number>; probation_due: number };

const tileCls = "flex flex-[1_1_150px] flex-col gap-1 rounded-[14px] border border-line bg-white px-[18px] py-4";

/** Dashboards per group (spec 8). Leader: whole company; Manager: own department; HR: attendance and leave; Finance: money issues. */
export default async function DashboardPage() {
  const viewer = await getViewer();
  if (!viewer || !(viewer.level !== "staff" || viewer.hr || viewer.finance)) notFound();
  const t = await getTranslations("dash");
  const tp = await getTranslations("projects");
  const format = await getFormatter();
  const supabase = await createClient();
  const biz = viewer.defaultBusiness;
  const leader = viewer.level === "leader", manager = viewer.level === "manager";
  const { data: countsRaw } = await supabase.rpc("dashboard_counts", { p_business: biz });
  const c = countsRaw as Counts;
  const month = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
  const [{ data: metrics }, { data: lateIssues }, { data: moneyIssues }] = await Promise.all([
    supabase.from("business_metrics").select("business, metric, value, month").order("month", { ascending: false }).limit(50),
    supabase.from("issues").select("id, type:issue_types(name)").is("deleted_at", null).not("status", "in", "(resolved,closed)").lt("fix_due", new Date().toISOString()),
    viewer.finance || leader ? supabase.from("issues").select("id, ref, title, business, type:issue_types!inner(name, is_finance), issue_amounts(amount)").is("deleted_at", null).not("status", "in", "(resolved,closed)").eq("type.is_finance", true) : Promise.resolve({ data: null }),
  ]);
  const latest = (b: string, m: string) => metrics?.find((x) => x.business === b && x.metric === m);
  const fmt = (n: number | undefined) => (n == null ? "—" : Number(n).toLocaleString());
  const peso = (n: number | undefined) => (n == null ? "—" : `₱${Number(n).toLocaleString()}`);
  const monthLabel = format.dateTime(new Date(`${month}-15T00:00:00Z`), { month: "long", year: "numeric" });
  // Managers see their own department only (spec 8).
  const depts = (c.by_department ?? []).filter((d) => leader || d.name === viewer.departmentName);
  const lateByType = [...((lateIssues ?? []) as unknown as { type: { name: string } | null }[]).reduce((m, x) => m.set(x.type?.name ?? "—", (m.get(x.type?.name ?? "—") ?? 0) + 1), new Map<string, number>())];
  const maxOpen = Math.max(1, ...depts.map((d) => d.open));

  const businessPanels = (leader || manager || viewer.finance) && (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {(biz === "all" || biz === "icharge") && (
        <section aria-label={t("icharge")} className="flex flex-col gap-3 rounded-[14px] border border-charge-line bg-white p-[18px]">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-leaf"><BusinessIcon business="icharge" size={18} />{t("icharge")}</h2>
          {!latest("icharge", "kiosk_locations") && <p className="text-xs text-muted">{t("noFigures", { month: monthLabel })}</p>}
          <div className="flex flex-wrap gap-3">
            <div className={tileCls}><span className="font-display text-2xl font-bold">{fmt(latest("icharge", "kiosk_locations")?.value)}</span><span className="text-sm">{t("kioskLocations")}</span></div>
            <div className={tileCls}><span className="font-display text-2xl font-bold">{fmt(latest("icharge", "rentals_per_day")?.value)}</span><span className="text-sm">{t("rentalsDay")}</span></div>
            <div className={tileCls}><span className="font-display text-2xl font-bold">{peso(latest("icharge", "rental_sales_per_day")?.value)}</span><span className="text-sm">{t("salesDay")}</span></div>
            <div className={tileCls}><span className="font-display text-2xl font-bold">{c.open_issues?.icharge ?? 0}</span><span className="text-sm">{t("openKioskIssues")}</span></div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm">{t("repeat")}: <b>{latest("icharge", "repeat_customer_rate") ? `${latest("icharge", "repeat_customer_rate")!.value}%` : "—"}</b></span>
            <Battery percent={Number(latest("icharge", "repeat_customer_rate")?.value ?? 0)} label={t("repeat")} />
          </div>
        </section>
      )}
      {(biz === "all" || biz === "iscreen") && (
        <section aria-label={t("iscreen")} className="flex flex-col gap-3 rounded-[14px] border border-[#D9D1FB] bg-white p-[18px]">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-screen-text"><BusinessIcon business="iscreen" size={18} />{t("iscreen")}</h2>
          {!latest("iscreen", "slots_sold") && <p className="text-xs text-muted">{t("noFigures", { month: monthLabel })}</p>}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">{t("slots")}: <b>{t("slotsOf", { n: Number(latest("iscreen", "slots_sold")?.value ?? 0) })}</b></span>
            <div role="img" aria-label={t("slotsOf", { n: Number(latest("iscreen", "slots_sold")?.value ?? 0) })} className="grid grid-cols-10 gap-1">
              {Array.from({ length: 20 }, (_, i) => <span key={i} className={`h-5 rounded ${i < Number(latest("iscreen", "slots_sold")?.value ?? 0) ? "bg-screen" : "border border-[#D9D1FB] bg-screen-soft"}`} />)}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className={tileCls}><span className="font-display text-2xl font-bold">{fmt(latest("iscreen", "proposals_waiting")?.value)}</span><span className="text-sm">{t("proposals")}</span></div>
            <div className={tileCls}><span className="font-display text-2xl font-bold">{peso(latest("iscreen", "ad_sales_month")?.value)}</span><span className="text-sm">{t("adSales")}</span></div>
            <div className={tileCls}><span className="font-display text-2xl font-bold">{c.open_issues?.iscreen ?? 0}</span><span className="text-sm">{t("openAdIssues")}</span></div>
          </div>
        </section>
      )}
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessSwitch value={biz} />
          {(leader || viewer.finance || viewer.headOf.includes("ops")) && <Link href="/dashboard/metrics" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("enterFigures")}</Link>}
        </div>
      </div>
      {businessPanels}
      {(leader || manager) && (
        <section className="overflow-x-auto rounded-[14px] border border-line bg-white p-[18px]">
          <h2 className="mb-2 text-base font-bold">{t("byDept")}</h2>
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-2">{t("dept")}</th><th className="py-2">{t("open")}</th><th className="py-2">{t("overdue")}</th><th className="py-2">{t("onTime")}</th></tr></thead>
            <tbody>{depts.map((d) => {
              const onTime = d.done_month ? Math.round((d.on_time_month / d.done_month) * 100) : null;
              return (
                <tr key={d.id} className="border-t border-line">
                  <td className="py-2 font-semibold">{d.name}</td>
                  <td className="py-2"><span className="flex items-center gap-2"><span className="inline-block h-2.5 rounded-sm bg-forest" style={{ width: `${(d.open / maxOpen) * 120 + 2}px` }} aria-hidden />{d.open}</span></td>
                  <td className={`py-2 ${d.overdue ? "font-semibold text-danger" : ""}`}>{d.overdue}</td>
                  <td className="py-2">{onTime == null ? "—" : <span className="flex items-center gap-2"><span className="w-24"><Battery percent={onTime} label={`${d.name}: ${onTime}%`} /></span>{onTime}%</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </section>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(leader || manager) && (
          <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
            <h2 className="text-base font-bold">{t("projects")}</h2>
            {["planning", "active", "on_hold", "done"].map((s) => <p key={s} className="flex justify-between text-sm"><span>{tp(`status.${s}`)}</span><b>{c.projects?.[s] ?? 0}</b></p>)}
          </section>
        )}
        {(leader || manager || viewer.hr) && (
          <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
            <h2 className="text-base font-bold">{t("attendanceToday")}</h2>
            {[["office", t("office")], ["wfh", t("wfh")], ["field", t("field")], ["leave", t("leave")], ["not_in", t("notIn")]].map(([k, l]) => <p key={k} className="flex justify-between text-sm"><span>{l}</span><b>{c.attendance[k] ?? 0}</b></p>)}
            {viewer.hr && <p className="flex justify-between text-sm"><Link href="/hr/attendance?tab=flags" className="text-leaf">{t("flags")}</Link><b>{c.attendance.flags ?? 0}</b></p>}
          </section>
        )}
        {(leader || manager || viewer.finance) && (
          <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
            <h2 className="text-base font-bold">{t("issuesLate")}</h2>
            {lateByType.length === 0 ? <p className="text-sm text-muted">{t("none")}</p> : lateByType.map(([k, n]) => <p key={k} className="flex justify-between gap-3 text-sm"><span>{k}</span><b className="text-danger">{n}</b></p>)}
          </section>
        )}
        {(leader || viewer.hr) && (
          <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
            <h2 className="text-base font-bold">{t("pending")}</h2>
            <p className="flex justify-between text-sm"><Link href="/hr/leave" className="text-leaf">{t("pendingLeave")}</Link><b>{c.pending.leave}</b></p>
            <p className="flex justify-between text-sm"><Link href="/settings/access" className="text-leaf">{t("pendingAccess")}</Link><b>{c.pending.access}</b></p>
            <p className="flex justify-between text-sm"><Link href="/performance" className="text-leaf">{t("pendingReviews")}</Link><b>{c.pending.reviews_to_sign}</b></p>
            {viewer.hr && <p className="flex justify-between text-sm"><span>{t("probation")}</span><b>{c.probation_due}</b></p>}
          </section>
        )}
        {(viewer.finance || leader) && (
          <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px] lg:col-span-2">
            <h2 className="text-base font-bold">{t("moneyIssues")}</h2>
            {((moneyIssues ?? []) as unknown as { id: string; ref: number; title: string; issue_amounts: { amount: number } | null }[]).map((i) => (
              <p key={i.id} className="flex justify-between gap-3 text-sm"><Link href={`/issues/${i.id}`} className="text-leaf">ISS-{i.ref} {i.title}</Link><b>{i.issue_amounts ? `₱${Number(i.issue_amounts.amount).toLocaleString()}` : "—"}</b></p>
            ))}
            {(moneyIssues ?? []).length === 0 && <p className="text-sm text-muted">{t("none")}</p>}
            <p className="flex justify-between text-sm"><Link href="/cs/refunds" className="text-leaf">{t("pendingRefunds")}</Link><b>{c.pending.refunds}</b></p>
            <a href={`/api/export/attendance?month=${month}`} className="text-sm font-semibold text-leaf">{t("exportAttendance")}</a>
          </section>
        )}
      </div>
    </>
  );
}
