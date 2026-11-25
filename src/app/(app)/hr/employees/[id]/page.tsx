import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { addHrNote, decideWfh, openDocument, saveEmployee, savePrivate, startChecklist } from "../../actions";
import { DocUpload } from "./DocUpload";

export const metadata = { title: "Employee" };
const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";
const lab = "flex flex-col gap-1 text-xs font-semibold";
const btn = "h-10 w-fit rounded-[10px] px-4 text-sm font-semibold";

type Priv = { address?: string; emergency_name?: string; emergency_phone?: string; emergency_relation?: string; sss?: string; philhealth?: string; pagibig?: string; tin?: string;
  wfh_address?: string; wfh_lat?: number; wfh_lng?: number; wfh_pending?: { address: string } | null };

/** 201 file. Each section shows only what the viewer's access allows (spec 3.3, 5.1). */
export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; show?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("hr");
  const format = await getFormatter();
  const d = (x?: string | null) => (x ? format.dateTime(new Date(`${x}T12:00:00Z`), { day: "numeric", month: "short", year: "numeric" }) : "—");
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const own = id === viewer.id;
  const [{ data: canView }, { data: canEdit }, { data: rec }, depts, people, { data: shifts }] = await Promise.all([
    supabase.rpc("can_view_employment", { p_profile: id }), supabase.rpc("can_edit_hr", { p_profile: id }),
    supabase.from("hr_records").select("*").eq("profile_id", id).maybeSingle(), getDepartments(), getPeople(), supabase.from("shifts").select("id, name"),
  ]);
  const fullPrivate = viewer.level === "leader" || viewer.hr;
  const canPrivate = own || fullPrivate || viewer.finance;
  const showPrivate = canPrivate && (sp.show === "1" || own);
  const priv: Priv | null = showPrivate ? ((await supabase.rpc("get_hr_private", { p_profile: id })).data as Priv | null) : null;
  const notes = fullPrivate && !own && sp.show === "1" ? ((await supabase.rpc("get_hr_notes", { p_profile: id })).data as { id: string; note: string; author: string; created_at: string }[] | null) : null;
  const { data: docs } = fullPrivate ? await supabase.from("employee_documents").select("id, name, kind, created_at").eq("profile_id", id).is("deleted_at", null).order("created_at", { ascending: false }) : { data: null };
  const open = canEdit ? ((await supabase.rpc("open_items", { p_profile: id })).data as Record<string, number> | null) : null;
  const name = (pid?: string | null) => people.find((x) => x.id === pid)?.name ?? "—";
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  return (
    <>
      <Link href="/hr/employees" className="text-sm font-semibold text-leaf">← {t("employees")}</Link>
      <h1 className="font-display text-[24px] font-bold min-[700px]:text-[28px]">{p.name}{!p.active && <span className="ml-2 text-base text-muted">(inactive)</span>}</h1>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
          <section className={card} aria-label={t("directory")}>
            <h2 className="text-base font-bold">{t("directory")}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">{t("f.position")}</dt><dd>{p.position ?? "—"}</dd>
              <dt className="text-muted">{t("f.department")}</dt><dd>{depts.find((x) => x.id === p.department_id)?.name ?? "—"}</dd>
              <dt className="text-muted">{t("f.email")}</dt><dd className="break-all">{p.email}</dd>
              <dt className="text-muted">{t("f.phone")}</dt><dd>{p.phone ?? "—"}</dd>
            </dl>
          </section>
          {canView && (
            <section className={card} aria-label={t("employment")}>
              <h2 className="text-base font-bold">{t("employment")}</h2>
              {canEdit ? (
                <form action={saveEmployee} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input type="hidden" name="id" value={id} />
                  <label className={lab}>{t("f.name")}<input name="name" defaultValue={p.name} className={field} /></label>
                  <label className={lab}>{t("f.employeeId")}<input name="employee_id" defaultValue={p.employee_id ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.position")}<input name="position" defaultValue={p.position ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.phone")}<input name="phone" defaultValue={p.phone ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.department")}<select name="department_id" defaultValue={p.department_id ?? ""} className={field}><option value="">—</option>{depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                  <label className={lab}>{t("f.supervisor")}<select name="supervisor_id" defaultValue={p.supervisor_id ?? ""} className={field}><option value="">—</option>{people.filter((x) => x.id !== id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                  <label className={lab}>{t("f.backup")}<select name="backup_approver_id" defaultValue={p.backup_approver_id ?? ""} className={field}><option value="">—</option>{people.filter((x) => x.id !== id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                  <label className={lab}>{t("f.status")}<select name="employment_status" defaultValue={rec?.employment_status ?? "probationary"} className={field}>{["probationary", "regular", "contractual", "project_based", "resigned"].map((x) => <option key={x} value={x}>{t(`statusV.${x}`)}</option>)}</select></label>
                  <label className={lab}>{t("f.start")}<input type="date" name="start_date" defaultValue={rec?.start_date ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.regularization")}<input type="date" name="regularization_date" defaultValue={rec?.regularization_date ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.end")}<input type="date" name="end_date" defaultValue={rec?.end_date ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.setup")}<select name="work_setup" defaultValue={rec?.work_setup ?? "office"} className={field}>{["office", "wfh", "hybrid"].map((x) => <option key={x} value={x}>{t(`setupV.${x}`)}</option>)}</select></label>
                  <label className={lab}>{t("f.shift")}<select name="shift_id" defaultValue={rec?.shift_id ?? ""} className={field}><option value="">—</option>{(shifts ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                  <button className={`${btn} bg-charge font-bold text-forest`}>{t("save")}</button>
                </form>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted">{t("f.status")}</dt><dd>{rec ? t(`statusV.${rec.employment_status}`) : "—"}</dd>
                  <dt className="text-muted">{t("f.start")}</dt><dd>{d(rec?.start_date)}</dd>
                  <dt className="text-muted">{t("f.regularization")}</dt><dd>{d(rec?.regularization_date)}</dd>
                  <dt className="text-muted">{t("f.setup")}</dt><dd>{rec ? t(`setupV.${rec.work_setup}`) : "—"}</dd>
                  <dt className="text-muted">{t("f.shift")}</dt><dd>{(shifts ?? []).find((x) => x.id === rec?.shift_id)?.name ?? "—"}</dd>
                  <dt className="text-muted">{t("f.supervisor")}</dt><dd>{name(p.supervisor_id)}</dd>
                </dl>
              )}
            </section>
          )}
          {canPrivate && (
            <section className={card} aria-label={t("private")}>
              <h2 className="text-base font-bold">{t("private")}</h2>
              {!showPrivate ? (
                <>
                  <p className="text-xs text-muted">{t("logged")}</p>
                  <Link href={`/hr/employees/${id}?show=1`} className={`${btn} inline-flex items-center border border-field bg-white`}>{t("show")}</Link>
                </>
              ) : canEdit ? (
                <form action={savePrivate} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input type="hidden" name="id" value={id} />
                  <label className={`${lab} sm:col-span-2`}>{t("f.address")}<input name="address" defaultValue={priv?.address ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.emergency")}<input name="emergency_name" defaultValue={priv?.emergency_name ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.emergencyPhone")}<input name="emergency_phone" defaultValue={priv?.emergency_phone ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.relation")}<input name="emergency_relation" defaultValue={priv?.emergency_relation ?? ""} className={field} /></label>
                  <span />
                  {(["sss", "philhealth", "pagibig", "tin"] as const).map((k) => <label key={k} className={lab}>{t(`f.${k}`)}<input name={k} defaultValue={priv?.[k] ?? ""} className={field} /></label>)}
                  <label className={`${lab} sm:col-span-2`}>{t("f.wfh")}<input name="wfh_address" defaultValue={priv?.wfh_address ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.lat")}<input name="wfh_lat" type="number" step="any" defaultValue={priv?.wfh_lat ?? ""} className={field} /></label>
                  <label className={lab}>{t("f.lng")}<input name="wfh_lng" type="number" step="any" defaultValue={priv?.wfh_lng ?? ""} className={field} /></label>
                  <button className={`${btn} bg-charge font-bold text-forest`}>{t("save")}</button>
                </form>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {priv?.address !== undefined && <><dt className="text-muted">{t("f.address")}</dt><dd>{priv.address ?? "—"}</dd>
                    <dt className="text-muted">{t("f.emergency")}</dt><dd>{[priv.emergency_name, priv.emergency_relation, priv.emergency_phone].filter(Boolean).join(" · ") || "—"}</dd></>}
                  {(["sss", "philhealth", "pagibig", "tin"] as const).map((k) => <Fragment key={k}><dt className="text-muted">{t(`f.${k}`)}</dt><dd>{priv?.[k] ?? "—"}</dd></Fragment>)}
                </dl>
              )}
              {showPrivate && priv?.wfh_pending && canEdit && (
                <form action={decideWfh} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] p-3 text-sm">
                  <input type="hidden" name="id" value={id} />{t("wfhPending", { address: priv.wfh_pending.address })}
                  <button name="decision" value="approve" className={`${btn} bg-charge font-bold text-forest`}>{t("approve")}</button>
                  <button name="decision" value="reject" className={`${btn} border border-field bg-white`}>{t("reject")}</button>
                </form>
              )}
            </section>
          )}
          {notes && (
            <section className={card} aria-label={t("notes")}>
              <h2 className="text-base font-bold">{t("notes")}</h2>
              <ul className="flex flex-col gap-2">{notes.map((n) => <li key={n.id} className="text-sm"><span className="text-xs text-muted">{n.author} · {format.dateTime(new Date(n.created_at), { day: "numeric", month: "short", year: "numeric" })}</span><p className="whitespace-pre-wrap">{n.note}</p></li>)}</ul>
              {canEdit && <form action={addHrNote} className="flex gap-2"><input type="hidden" name="id" value={id} /><input name="note" required aria-label={t("addNote")} className={`${field} flex-1`} /><button className={`${btn} border border-field bg-white`}>{t("addNote")}</button></form>}
            </section>
          )}
        </div>
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
          {docs && (
            <section className={card} aria-label={t("documents")}>
              <h2 className="text-base font-bold">{t("documents")}</h2>
              {docs.length === 0 && <p className="text-sm text-muted">{t("noDocs")}</p>}
              <ul className="flex flex-col gap-1">{docs.map((x) => <li key={x.id}><form action={openDocument}><input type="hidden" name="doc_id" value={x.id} /><button className="text-left text-sm font-semibold text-leaf hover:underline">{x.name}</button><span className="ml-2 text-xs text-muted">{x.kind}</span></form></li>)}</ul>
              {canEdit && <DocUpload profileId={id} label={t("upload")} />}
            </section>
          )}
          {canEdit && open && (
            <section className={card} aria-label={t("onboarding")}>
              <h2 className="text-base font-bold">{t("onboarding")}</h2>
              <form action={startChecklist} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={id} />
                <label className={lab}>{t("date")}<input type="date" name="date" required defaultValue={rec?.start_date ?? today} className={field} /></label>
                <div className="flex flex-wrap gap-2">
                  <button name="kind" value="onboarding" className={`${btn} border border-field bg-white`}>{t("startOnboarding")}</button>
                  <button name="kind" value="offboarding" className={`${btn} border border-field bg-white`}>{t("startOffboarding")}</button>
                </div>
              </form>
              <p className={`text-sm ${Object.values(open).some((n) => n > 0) ? "text-[#92400E]" : "text-leaf"}`}>
                {Object.values(open).some((n) => n > 0) ? t("openItems", open) : t("openNone")}
              </p>
              <p className="text-xs text-muted">{t("deactivateHint")}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
