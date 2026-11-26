import Link from "next/link";
import { isCsStaff } from "@/lib/nav";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDepartments } from "@/lib/people";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Employees" };

/** Employee directory: name, position, department, work email, work phone — everyone (spec 3.3). */
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  if (isCsStaff(viewer)) redirect("/cs"); // CS staff: CS menu only (src/lib/nav.ts)
  const t = await getTranslations("hr");
  const sp = await searchParams;
  const supabase = await createClient();
  const depts = await getDepartments();
  let q = supabase.from("profiles").select("id, name, position, email, phone, department_id, active").order("name");
  if (!(viewer.hr || viewer.level === "leader")) q = q.eq("active", true);
  if (sp.dept) q = q.eq("department_id", sp.dept);
  if (sp.q) q = q.or(`name.ilike.%${sp.q.replace(/[%,()]/g, "")}%,position.ilike.%${sp.q.replace(/[%,()]/g, "")}%`);
  const { data } = await q;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("employees")}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/hr/employees/${viewer.id}`} className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("myFile")}</Link>
          {(viewer.hr || viewer.level === "leader") && <Link href="/hr/checklists" className="inline-flex h-11 items-center rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("checklists")}</Link>}
        </div>
      </div>
      <form className="flex flex-wrap gap-2">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("search")} aria-label={t("search")} className="h-11 w-[240px] max-w-full rounded-[10px] border border-[#D5DCCB] bg-white px-3.5 text-sm" />
        <select name="dept" defaultValue={sp.dept ?? ""} aria-label={t("f.department")} className="h-11 rounded-[10px] border border-[#D5DCCB] bg-white px-3 text-sm"><option value="">{t("allDepts")}</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <button className="h-11 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">OK</button>
      </form>
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        {(data ?? []).length === 0 && <p className="p-4 text-sm text-muted">{t("none")}</p>}
        <ul>
          {(data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 first:border-t-0">
              <span className="flex min-w-0 flex-col">
                <Link href={`/hr/employees/${p.id}`} className={`font-semibold hover:underline ${p.active ? "text-forest" : "text-muted line-through"}`}>{p.name}</Link>
                <span className="text-[13px] text-muted">{p.position ?? "—"} · {depts.find((d) => d.id === p.department_id)?.name ?? "—"}</span>
              </span>
              <span className="text-[13px] text-muted"><a href={`mailto:${p.email}`} className="text-leaf">{p.email}</a>{p.phone ? ` · ${p.phone}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
