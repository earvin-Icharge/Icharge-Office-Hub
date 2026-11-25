import { getFormatter, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getDevice, readDeviceKey } from "@/lib/device";
import { QuickSignIn } from "./QuickSignIn";
import { MyDevices, type DeviceItem } from "./MyDevices";
import { InstallApp, PushToggle } from "./PushAndInstall";
import { Channels } from "./Channels";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { LanguagePicker } from "./LanguagePicker";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations();
  const format = await getFormatter();
  const thisDevice = await getDevice(readDeviceKey(await cookies()), viewer.id);
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("user_devices")
    .select("id, device_name, last_seen_at, app_version, quick_method")
    .eq("profile_id", viewer.id)
    .is("removed_at", null)
    .order("last_seen_at", { ascending: false });
  const devices: DeviceItem[] = (rows ?? []).map((d) => ({
    id: d.id, name: d.device_name ?? "—", version: d.app_version, method: d.quick_method,
    lastSeen: format.dateTime(new Date(d.last_seen_at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
    isThis: d.id === thisDevice?.id,
  }));
  const card = "flex max-w-[640px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("profile.title")}</h1>
      <section className="flex max-w-[640px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("profile.details")}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{t("profile.name")}</dt>
          <dd className="font-semibold">{viewer.name}</dd>
          <dt className="text-muted">{t("profile.email")}</dt>
          <dd className="break-all">{viewer.email}</dd>
          <dt className="text-muted">{t("today.department")}</dt>
          <dd>{viewer.departmentName ?? t("today.none")}</dd>
          <dt className="text-muted">{t("today.position")}</dt>
          <dd>{viewer.position ?? t("today.none")}</dd>
          <dt className="text-muted">{t("today.level")}</dt>
          <dd>{t(`levels.${viewer.level}`)}</dd>
        </dl>
      </section>
      <section className="flex max-w-[640px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("common.language")}</h2>
        <p className="text-sm text-muted">{t("profile.languageHelp")}</p>
        <LanguagePicker value={viewer.language} label={t("common.language")} />
      </section>
      <section id="quick" className={card}>
        <h2 className="text-base font-bold">{t("quick.title")}</h2>
        <QuickSignIn hasPasskey={!!thisDevice?.passkey_credential_id} hasPin={!!thisDevice?.pin_hash} />
      </section>
      <section className={card}>
        <h2 className="text-base font-bold">{t("push.title")}</h2>
        <PushToggle />
      </section>
      <section className={card}>
        <h2 className="text-base font-bold">{t("channels.title")}</h2>
        <Channels profileId={viewer.id} />
      </section>
      <section className={card}>
        <h2 className="text-base font-bold">{t("install.title")}</h2>
        <InstallApp />
      </section>
      <section className={card}>
        <h2 className="text-base font-bold">{t("devices.title")}</h2>
        <MyDevices devices={devices} />
      </section>
      <form action="/auth/signout" method="post" className="min-[700px]:hidden">
        <button type="submit" className="h-12 w-full max-w-[560px] rounded-xl border border-field bg-white text-base font-semibold">
          {t("common.signOut")}
        </button>
      </form>
    </>
  );
}
