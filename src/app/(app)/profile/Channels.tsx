import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { newTelegramCode, saveChannels } from "./channels";

/** Email / Telegram per person (spec 7). */
export async function Channels({ profileId }: { profileId: string }) {
  const t = await getTranslations("channels");
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("notify_email, notify_telegram, telegram_chat_id, telegram_link_code").eq("id", profileId).single();
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t("help")}</p>
      <form action={saveChannels} className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_email" defaultChecked={p?.notify_email} className="h-4 w-4 accent-[#2F6B0A]" />{t("email")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_telegram" defaultChecked={p?.notify_telegram} className="h-4 w-4 accent-[#2F6B0A]" />{t("telegram")}</label>
        <button className="h-9 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{t("save")}</button>
      </form>
      <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
        <b className="text-sm">{t("telegram")}{p?.telegram_chat_id && <span className="ml-2 rounded-full bg-charge-soft px-2 py-0.5 text-xs text-leaf">{t("telegramConnected")}</span>}</b>
        {!bot ? <p className="text-sm text-muted">{t("telegramNotReady")}</p> : p?.telegram_link_code ? (
          <>
            <p className="text-sm">{t("telegramSteps")} <b className="font-mono text-base tracking-[2px]">{p.telegram_link_code}</b></p>
            <a href={`https://t.me/${bot}?start=${p.telegram_link_code}`} target="_blank" rel="noreferrer" className="inline-flex h-10 w-fit items-center rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("telegramOpen")}</a>
          </>
        ) : (
          <form action={newTelegramCode}><button className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("telegramConnect")}</button></form>
        )}
      </div>
    </div>
  );
}
