import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { saveChecklistItem } from "../actions";

export const metadata = { title: "Checklists" };
const field = "h-10 rounded-[10px] border border-field bg-white px-2.5 text-sm min-w-0";
type Item = { id?: string; kind?: string; text?: string; owner_role?: string; days_offset?: number; position?: number; active?: boolean };

/** Onboarding / offboarding checklists, editable by HR (spec 5.5). */
export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.hr || viewer.level === "leader")) notFound();
  const t = await getTranslations("hr");
  const sp = await searchParams;
  const { data } = await (await createClient()).from("checklist_templates").select("*").order("kind").order("position");
  const row = (x: Item) => (
    <form key={x.id ?? `new-${x.kind}`} action={saveChecklistItem} className="grid grid-cols-1 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_130px_110px_auto]">
      {x.id && <input type="hidden" name="id" value={x.id} />}<input type="hidden" name="kind" value={x.kind} /><input type="hidden" name="position" value={x.position ?? 99} />
      <input name="text" required defaultValue={x.text ?? ""} aria-label="Item" placeholder={t("add")} className={field} />
      <select name="owner_role" defaultValue={x.owner_role ?? "hr"} aria-label="Owner" className={field}>{["hr", "manager", "employee"].map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select>
      <input name="days_offset" type="number" defaultValue={x.days_offset ?? 0} aria-label={t("offset")} title={t("offset")} className={field} />
      <span className="flex items-center gap-2">
        {x.id && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={x.active} className="h-4 w-4 accent-[#2F6B0A]" />{t("active")}</label>}
        <button className="h-10 rounded-[10px] bg-charge px-3 text-sm font-bold text-forest">{t("save")}</button>
      </span>
    </form>
  );
  return (
    <>
      <Link href="/hr/employees" className="text-sm font-semibold text-leaf">← {t("employees")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("checklists")}</h1>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error} />
      <p className="text-sm text-muted">{t("offset")}</p>
      {(["onboarding", "offboarding"] as const).map((k) => (
        <section key={k} className="flex max-w-[860px] flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
          <h2 className="text-base font-bold capitalize">{k}</h2>
          {((data ?? []) as Item[]).filter((x) => x.kind === k).map(row)}
          {row({ kind: k })}
        </section>
      ))}
    </>
  );
}
