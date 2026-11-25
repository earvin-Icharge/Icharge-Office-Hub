import { getTranslations } from "next-intl/server";

export const fieldCls = "h-10 rounded-[10px] border border-field bg-white px-2.5 text-sm min-w-0";
export const btnPrimary = "h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest";
export const btnPlain = "h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold";
export const btnDanger = "h-10 rounded-[10px] border border-[#FCA5A5] bg-white px-4 text-sm font-semibold text-danger";

/** Level + HR/Finance switches (+ optional department) used by every access form. */
export async function AccessFields({
  level = "staff", hr = false, finance = false, departments, departmentId,
}: {
  level?: string; hr?: boolean; finance?: boolean;
  departments?: { id: string; name: string }[]; departmentId?: string | null;
}) {
  const t = await getTranslations();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-semibold">
        {t("access.level")}
        <select name="level" defaultValue={level} className={fieldCls}>
          <option value="staff">{t("levels.staff")}</option>
          <option value="manager">{t("levels.manager")}</option>
          <option value="leader">{t("levels.leader")}</option>
        </select>
      </label>
      {departments && (
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {t("access.department")}
          <select name="department_id" defaultValue={departmentId ?? ""} className={fieldCls}>
            <option value="">—</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      <label className="flex h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="hr" defaultChecked={hr} className="h-4 w-4 accent-[#2F6B0A]" />
        {t("access.hrAccess")}
      </label>
      <label className="flex h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="finance" defaultChecked={finance} className="h-4 w-4 accent-[#2F6B0A]" />
        {t("access.financeAccess")}
      </label>
    </div>
  );
}

export async function ReasonForm({
  action, hidden, button, cls = btnPlain, summary,
}: {
  action: (f: FormData) => Promise<void>; hidden: Record<string, string>; button: string; cls?: string; summary: string;
}) {
  const t = await getTranslations("access");
  return (
    <details className="group">
      <summary className={`${cls} inline-flex cursor-pointer list-none items-center`}>{summary}</summary>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold">
          {t("reason")}
          <input name="reason" required minLength={3} placeholder={t("reasonPlaceholder")} className={fieldCls} />
        </label>
        <button type="submit" className={cls}>{button}</button>
      </form>
    </details>
  );
}
