import { getTranslations } from "next-intl/server";
import { getPeople } from "@/lib/people";
import { saveClient } from "./actions";

const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] min-w-0";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";
type C = { id?: string; name?: string; type?: string; business?: string; owner_id?: string; contact_name?: string | null; contact_phone?: string | null; status?: string; is_key_account?: boolean; kiosks?: string[] };

export async function ClientForm({ client, canChangeOwner }: { client?: C; canChangeOwner: boolean }) {
  const t = await getTranslations("clients");
  const tb = await getTranslations("business");
  const people = await getPeople();
  const c = client ?? {};
  return (
    <form action={saveClient} className="flex flex-col gap-3.5">
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <label className={label}>{t("f.name")}<input name="name" required minLength={2} defaultValue={c.name ?? ""} className={field} /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>{t("f.type")}<select name="type" defaultValue={c.type ?? "mall"} className={field}>{["mall", "hospital", "resort", "sme", "transport", "advertiser", "other"].map((x) => <option key={x} value={x}>{t(`type.${x}`)}</option>)}</select></label>
        <label className={label}>{t("f.business")}<select name="business" defaultValue={c.business ?? "icharge"} className={field}><option value="icharge">{tb("icharge")}</option><option value="iscreen">{tb("iscreen")}</option></select></label>
        <label className={label}>{t("f.status")}<select name="status" defaultValue={c.status ?? "prospect"} className={field}>{["prospect", "proposal_sent", "negotiating", "waiting_signature", "active", "renewal_talks", "renewed", "ended"].map((x) => <option key={x} value={x}>{t(`status.${x}`)}</option>)}</select></label>
        {canChangeOwner && <label className={label}>{t("f.owner")}<select name="owner_id" defaultValue={c.owner_id ?? ""} className={field}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className={label}>{t("f.contact")}<input name="contact_name" defaultValue={c.contact_name ?? ""} className={field} /></label>
        <label className={label}>{t("f.phone")}<input name="contact_phone" type="tel" defaultValue={c.contact_phone ?? ""} className={field} /></label>
      </div>
      <label className={label}>{t("f.kiosks")}<textarea name="kiosks" rows={3} defaultValue={(c.kiosks ?? []).join("\n")} className="rounded-[10px] border border-field px-3 py-2 text-[15px]" /><span className="text-xs font-normal text-muted">{t("f.kiosksHelp")}</span></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_key_account" defaultChecked={!!c.is_key_account} className="h-4 w-4 accent-[#2F6B0A]" />{t("f.key")}</label>
      <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{c.id ? t("save") : t("create")}</button>
    </form>
  );
}
