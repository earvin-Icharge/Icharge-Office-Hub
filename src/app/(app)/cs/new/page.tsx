import { getTranslations } from "next-intl/server";
import { ChoiceList } from "@/components/SettingsUi";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { createCase } from "../actions";

export const metadata = { title: "New case" };
const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) notFound();
  const supabase = await createClient();
  const [{ data: lead }, { data: inCs }, { data: types }, people] = await Promise.all([supabase.rpc("is_cs_lead"), supabase.rpc("in_cs"), supabase.from("cs_case_types").select("code, name_en, name_zh").order("position"), getPeople()]);
  if (!(lead || inCs || viewer.level === "leader")) notFound();
  const t = await getTranslations("cs");
  const tb = await getTranslations("business");
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("newCase").replace("+ ", "")}</h1>
      <Flash error={(await searchParams).error} />
      <form action={createCase} className="flex max-w-[720px] flex-col gap-3.5 rounded-[14px] border border-line bg-white p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <fieldset className={`${label} sm:col-span-2`}><legend className="mb-1.5">{t("f.type")}</legend><ChoiceList name="type_code" required options={(types ?? []).map((x) => ({ value: x.code, label: viewer.language === "zh-Hans" ? x.name_zh : x.name_en }))} /></fieldset>
          <label className={label}>{t("f.channel")}<select name="channel" required className={field}>{["hotline", "viber", "facebook", "app", "email", "walkin"].map((x) => <option key={x} value={x}>{t(`channel.${x}`)}</option>)}</select></label>
          <label className={label}>{t("f.customer")}<input name="customer_name" autoComplete="off" className={field} /></label>
          <label className={label}>{t("f.mobile")}<input name="customer_mobile" type="tel" autoComplete="off" className={field} /></label>
          <label className={label}>{t("f.order")}<input name="order_no" className={field} /></label>
          <label className={label}>{t("f.kiosk")}<input name="kiosk_id" className={field} /></label>
          <label className={label}>{t("f.location")}<input name="location" className={field} /></label>
          <label className={label}>{t("f.amount")}<input name="amount" type="number" min="0" step="0.01" className={field} /></label>
          <label className={label}>{t("f.business")}<select name="business" defaultValue="icharge" className={field}><option value="icharge">{tb("icharge")}</option><option value="iscreen">{tb("iscreen")}</option></select></label>
          {(lead || viewer.level === "leader") && <label className={label}>{t("f.owner")}<select name="owner_id" defaultValue={viewer.id} className={field}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        </div>
        <label className={label}>{t("f.message")}<textarea name="message" rows={3} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /></label>
        <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("create")}</button>
      </form>
    </>
  );
}
