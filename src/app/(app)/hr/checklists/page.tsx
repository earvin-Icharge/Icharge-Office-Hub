import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { SaveButton, Switch, WrapField, inputCls } from "@/components/SettingsUi";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { saveChecklistItem } from "../actions";

export const metadata = { title: "Checklists" };
type Item = { id?: string; kind?: string; text?: string; owner_role?: string; days_offset?: number; position?: number; active?: boolean };

/** Onboarding / offboarding checklists, editable by HR (spec 5.5). Each step reads as a sentence; Edit opens the form. */
export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.hr || viewer.level === "leader")) notFound();
  const t = await getTranslations("hr");
  const sp = await searchParams;
  const { data } = await (await createClient()).from("checklist_templates").select("*").order("kind").order("position");
  const when = (x: Item) => {
    const n = Number(x.days_offset ?? 0), ref = t(`ck.ref.${x.kind}`);
    return n === 0 ? t("ck.onDay", { ref }) : n < 0 ? t("ck.before", { n: -n, ref }) : t("ck.after", { n, ref });
  };
  const form = (x: Item) => (
    <form action={saveChecklistItem} className="mt-3 flex flex-col gap-3">
      {x.id && <input type="hidden" name="id" value={x.id} />}<input type="hidden" name="kind" value={x.kind} /><input type="hidden" name="position" value={x.position ?? 99} />
      <label className="flex flex-col gap-1 text-[13px] font-semibold">{t("ck.step")}<WrapField name="text" required value={x.text} label={t("ck.step")} /></label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">{t("ck.who")}
          <select name="owner_role" defaultValue={x.owner_role ?? "hr"} className={inputCls}>{["hr", "manager", "employee"].map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select></label>
        <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-1 text-[13px] font-semibold">{t("ck.when")}
          <span className="flex flex-wrap items-center gap-2">
            <input name="when_days" type="number" min="0" defaultValue={Math.abs(Number(x.days_offset ?? 0))} aria-label={t("ck.daysLabel")} className={`${inputCls} w-20 text-right`} />
            <span className="text-sm text-muted">{t("ck.days")}</span>
            <select name="when_dir" defaultValue={Number(x.days_offset ?? 0) < 0 ? "before" : Number(x.days_offset ?? 0) > 0 ? "after" : "on"} aria-label={t("ck.when")} className={`${inputCls} min-w-0 flex-[1_1_180px]`}>
              <option value="before">{t("ck.dirBefore", { ref: t(`ck.ref.${x.kind}`) })}</option>
              <option value="on">{t("ck.dirOn", { ref: t(`ck.ref.${x.kind}`) })}</option>
              <option value="after">{t("ck.dirAfter", { ref: t(`ck.ref.${x.kind}`) })}</option>
            </select>
          </span></label>
        {x.id && <span className="flex h-11 items-center gap-2 text-sm font-semibold">{t("active")}<Switch name="active" on={x.active !== false} label={t("active")} /></span>}
      </div>
      <SaveButton label={x.id ? t("save") : t("add")} />
    </form>
  );
  return (
    <>
      <Link href="/hr/employees" className="text-sm font-semibold text-leaf">← {t("employees")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("checklists")}</h1>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error} />
      <p className="max-w-[860px] text-sm text-muted">{t("ck.help")}</p>
      {(["onboarding", "offboarding"] as const).map((k) => (
        <section key={k} className="flex max-w-[860px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
          <h2 className="text-base font-bold">{t(`ck.title.${k}`)}</h2>
          <ol className="flex flex-col">
            {((data ?? []) as Item[]).filter((x) => x.kind === k).map((x, i) => (
              <li key={x.id} className="border-t border-line py-3 first:border-t-0 first:pt-0">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-paper text-xs font-bold text-ink-2">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold break-words ${x.active === false ? "text-muted line-through" : ""}`}>{x.text}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>{t(`role.${x.owner_role ?? "hr"}`)}</span><span aria-hidden>·</span><span>{when(x)}</span>
                      {x.active === false && <Pill>{t("ck.off")}</Pill>}
                    </p>
                    <details>
                      <summary className="mt-1 w-fit cursor-pointer text-xs font-semibold text-leaf">{t("ck.edit")}</summary>
                      {form(x)}
                    </details>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <details className="rounded-xl border border-dashed border-field p-3">
            <summary className="cursor-pointer text-sm font-semibold text-leaf">+ {t("add")}</summary>
            {form({ kind: k })}
          </details>
        </section>
      ))}
    </>
  );
}
