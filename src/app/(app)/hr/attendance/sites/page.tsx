import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { saveFieldSite, saveOfficePin } from "../actions";

export const metadata = { title: "Field sites" };
const field = "h-10 rounded-[10px] border border-field bg-white px-2.5 text-sm min-w-0";
type Site = { id?: string; name?: string; business?: string; kiosk_id?: string | null; lat?: number; lng?: number; radius_m?: number; active?: boolean };

/** Office pin (Leader, HR) and field sites list (HR with the Ops head) — spec 5.2, 11. */
export default async function SitesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.hr || viewer.level === "leader" || viewer.headOf.includes("ops"))) notFound();
  const t = await getTranslations("att");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: sites }, { data: settings }] = await Promise.all([
    supabase.from("field_sites").select("*").order("name"), supabase.from("app_settings").select("key, value").in("key", ["office_pin", "location_radius_m"]),
  ]);
  const pin = (settings?.find((s) => s.key === "office_pin")?.value ?? {}) as { name?: string; lat?: number; lng?: number };
  const radius = Number(settings?.find((s) => s.key === "location_radius_m")?.value ?? 200);
  const siteForm = (x: Site) => (
    <form key={x.id ?? "new"} action={saveFieldSite} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 sm:grid-cols-6">
      {x.id && <input type="hidden" name="id" value={x.id} />}
      <input name="name" required defaultValue={x.name ?? ""} placeholder={t("name")} aria-label={t("name")} className={`${field} col-span-2`} />
      <input name="kiosk_id" defaultValue={x.kiosk_id ?? ""} placeholder={t("kiosk")} aria-label={t("kiosk")} className={field} />
      <select name="business" defaultValue={x.business ?? "icharge"} aria-label="Business" className={field}><option value="icharge">iCharge</option><option value="iscreen">iScreen</option></select>
      <input name="lat" type="number" step="any" required defaultValue={x.lat ?? ""} placeholder={t("lat")} aria-label={t("lat")} className={field} />
      <input name="lng" type="number" step="any" required defaultValue={x.lng ?? ""} placeholder={t("lng")} aria-label={t("lng")} className={field} />
      <input name="radius_m" type="number" defaultValue={x.radius_m ?? 200} aria-label={t("radius")} title={t("radius")} className={field} />
      {x.id && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={x.active} className="h-4 w-4 accent-[#2F6B0A]" />Active</label>}
      <button className="h-10 rounded-[10px] bg-charge px-3 text-sm font-bold text-forest">{x.id ? t("save") : t("addSite")}</button>
    </form>
  );
  return (
    <>
      <Link href="/hr/attendance" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("sites")}</h1>
      <Flash ok={sp.ok ? t("ok.saved") : null} error={sp.error} />
      {(viewer.hr || viewer.level === "leader") && (
        <form action={saveOfficePin} className="grid max-w-[860px] grid-cols-2 gap-2 rounded-[14px] border border-line bg-white p-[18px] sm:grid-cols-5">
          <h2 className="col-span-2 text-base font-bold sm:col-span-5">{t("officePin")}</h2>
          <input name="name" defaultValue={pin.name ?? "iCharge office"} aria-label={t("name")} className={`${field} col-span-2`} />
          <input name="lat" type="number" step="any" required defaultValue={pin.lat ?? ""} placeholder={t("lat")} aria-label={t("lat")} className={field} />
          <input name="lng" type="number" step="any" required defaultValue={pin.lng ?? ""} placeholder={t("lng")} aria-label={t("lng")} className={field} />
          <input name="radius_m" type="number" defaultValue={radius} aria-label={t("radius")} title={t("radius")} className={field} />
          <button className="h-10 w-fit rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("save")}</button>
        </form>
      )}
      <section className="flex max-w-[860px] flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("sites")}</h2>
        {((sites ?? []) as Site[]).map(siteForm)}
        {siteForm({})}
      </section>
    </>
  );
}
