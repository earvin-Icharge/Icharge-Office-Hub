import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { saveQuickReply, saveTarget } from "../actions";

export const metadata = { title: "CS settings" };
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";

/** CS lead (with the Leader): quick replies and KPI targets (spec 11). */
export default async function CsSettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const supabase = await createClient();
  const { data: lead } = await supabase.rpc("is_cs_lead");
  if (!(lead || viewer.level === "leader")) notFound();
  const t = await getTranslations("cs");
  const sp = await searchParams;
  const [{ data: replies }, { data: targets }, { data: hours }] = await Promise.all([
    supabase.from("cs_quick_replies").select("*").order("language").order("title"), supabase.from("cs_targets").select("*"), supabase.from("app_settings").select("value").eq("key", "cs_hours").single(),
  ]);
  const h = (hours?.value ?? {}) as { start?: string; end?: string };
  const qr = (r: { id?: string; language?: string; title?: string; text?: string; active?: boolean }) => (
    <form key={r.id ?? "new"} action={saveQuickReply} className="grid grid-cols-1 gap-2 rounded-xl border border-line p-3 sm:grid-cols-[120px_1fr]">
      {r.id && <input type="hidden" name="id" value={r.id} />}
      <select name="language" defaultValue={r.language ?? "en"} aria-label={t("qrLang")} className={field}><option value="en">English</option><option value="fil">Filipino</option></select>
      <input name="title" required defaultValue={r.title ?? ""} placeholder={t("qrTitle")} aria-label={t("qrTitle")} className={field} />
      <textarea name="text" required rows={2} defaultValue={r.text ?? ""} aria-label={t("qrText")} className="rounded-[10px] border border-field px-3 py-2 text-sm sm:col-span-2" />
      <div className="flex items-center gap-3 sm:col-span-2">
        {r.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r.active} className="h-4 w-4 accent-[#2F6B0A]" />{t("qrActive")}</label>}
        <button className="h-9 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("save")}</button>
      </div>
    </form>
  );
  return (
    <>
      <Link href="/cs" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("settings")}</h1>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error} />
      <section className="flex max-w-[760px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("targets")}</h2>
        <p className="text-sm text-muted">{t("hours", { start: h.start ?? "08:00", end: h.end ?? "20:00" })}</p>
        {(targets ?? []).map((x) => (
          <form key={x.kpi} action={saveTarget} className="flex flex-wrap items-center gap-2"><input type="hidden" name="kpi" value={x.kpi} />
            <span className="min-w-[200px] text-sm">{t(`kpi.${x.kpi}`)}</span>
            <input name="target" type="number" step="0.1" defaultValue={x.target} aria-label={t(`kpi.${x.kpi}`)} className={`${field} w-28`} />
            <button className="h-9 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{t("save")}</button></form>
        ))}
      </section>
      <section className="flex max-w-[760px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("qr")}</h2>
        {(replies ?? []).map(qr)}
        {qr({})}
      </section>
    </>
  );
}
