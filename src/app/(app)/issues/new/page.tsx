import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { reportIssue } from "../actions";

export const metadata = { title: "Report issue" };
const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

/** Anyone can report an issue (spec 4.7). */
export default async function NewIssuePage({ searchParams }: { searchParams: Promise<{ error?: string; kiosk_id?: string; type?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("issues");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: types }, people] = await Promise.all([supabase.from("issue_types").select("id, name, business").eq("active", true).order("name"), getPeople()]);
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("report").replace("+ ", "")}</h1>
      <Flash error={sp.error} />
      <form action={reportIssue} className="flex max-w-[720px] flex-col gap-3.5 rounded-[14px] border border-line bg-white p-5">
        <label className={label}>{t("f.type")}
          <select name="type_id" required defaultValue={sp.type ?? ""} className={field}><option value="" disabled>…</option>{(types ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}{x.business === "iscreen" ? " (iScreen)" : ""}</option>)}</select></label>
        <label className={label}>{t("f.title")}<input name="title" required minLength={2} maxLength={200} className={field} /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={label}>{t("f.kiosk")}<input name="kiosk_id" defaultValue={sp.kiosk_id ?? ""} className={field} /></label>
          <label className={label}>{t("f.location")}<input name="location" className={field} /></label>
          <label className={label}>{t("f.source")}<select name="source" defaultValue="staff" className={field}>{["hotline", "email", "viber", "social", "partner", "staff"].map((x) => <option key={x} value={x}>{t(`source.${x}`)}</option>)}</select></label>
          <label className={label}>{t("f.severity")}<select name="severity" defaultValue="medium" className={field}>{["low", "medium", "high", "critical"].map((x) => <option key={x} value={x}>{t(`severity.${x}`)}</option>)}</select></label>
          <label className={label}>{t("f.owner")}<select name="owner_id" defaultValue="" className={field}><option value="">{t("f.ownerDefault")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className={label}>{t("f.amount")}<input name="amount" type="number" min="0" step="0.01" className={field} /></label>
        </div>
        <label className={label}>{t("f.notes")}<textarea name="notes" rows={3} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /></label>
        <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("send")}</button>
      </form>
    </>
  );
}
