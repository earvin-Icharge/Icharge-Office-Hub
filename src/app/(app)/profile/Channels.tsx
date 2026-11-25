import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { saveChannels } from "./channels";

/** Email notifications per person (spec 7). */
export async function Channels({ profileId }: { profileId: string }) {
  const t = await getTranslations("channels");
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("notify_email").eq("id", profileId).single();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t("help")}</p>
      <form action={saveChannels} className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_email" defaultChecked={p?.notify_email} className="h-4 w-4 accent-[#2F6B0A]" />{t("email")}</label>
        <button className="h-9 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{t("save")}</button>
      </form>
    </div>
  );
}
