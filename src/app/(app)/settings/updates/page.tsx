import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { APP_VERSION, compareVersions } from "@/lib/version";
import { askEveryoneToUpdate, remindToUpdate } from "./actions";

export const metadata = { title: "App updates" };

/** Settings › App updates (Leader only, spec 3.6). */
export default async function UpdatesPage({ searchParams }: { searchParams: Promise<{ asked?: string; reminded?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (viewer?.level !== "leader") notFound();
  const sp = await searchParams;
  const t = await getTranslations("updates");
  const locale = viewer.language;
  const format = await getFormatter();
  const when = (d: string) => format.dateTime(new Date(d), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  const supabase = await createClient();
  const [{ data: releases }, { data: people }, { data: devices }] = await Promise.all([
    supabase.from("app_releases").select("version, released_at, whats_new_en, whats_new_zh, min_required").order("released_at", { ascending: false }),
    supabase.from("profiles").select("id, name, active").eq("active", true).order("name"),
    supabase.from("user_devices").select("profile_id, device_name, app_version, last_seen_at").is("removed_at", null).order("last_seen_at", { ascending: false }),
  ]);
  const current = (releases ?? []).find((r) => r.version === APP_VERSION) ?? releases?.[0];
  const minRow = (releases ?? []).find((r) => r.min_required);
  const latestDevice = new Map<string, { device_name: string | null; app_version: string | null; last_seen_at: string }>();
  for (const d of devices ?? []) if (!latestDevice.has(d.profile_id)) latestDevice.set(d.profile_id, d);
  const behind = (people ?? [])
    .map((p) => ({ ...p, device: latestDevice.get(p.id) }))
    .filter((p) => !p.device?.app_version || compareVersions(p.device.app_version, APP_VERSION) < 0);
  const whatsNew: string = current ? (locale === "zh-Hans" ? current.whats_new_zh : current.whats_new_en) : "";
  const card = "flex max-w-[760px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";

  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      {sp.asked && <p role="status" className="max-w-[760px] rounded-[10px] border border-charge-line bg-charge-soft px-3 py-2.5 text-sm font-semibold">{t("asked", { version: sp.asked })}</p>}
      {sp.reminded !== undefined && (
        <p role="status" className="max-w-[760px] rounded-[10px] border border-charge-line bg-charge-soft px-3 py-2.5 text-sm font-semibold">
          {Number(sp.reminded) > 0 ? t("reminded", { count: Number(sp.reminded) }) : t("noPush")}
        </p>
      )}
      {sp.error && <p role="alert" className="max-w-[760px] rounded-[10px] bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger">{sp.error}</p>}

      <section className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">{t("current")}: {APP_VERSION}</h2>
          {current && <span className="text-sm text-muted">{t("released", { date: when(current.released_at) })}</span>}
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t("whatsNew")}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
            {whatsNew.split("\n").filter(Boolean).map((l: string, i: number) => <li key={i}>{l}</li>)}
          </ul>
        </div>
        <p className="text-sm"><span className="text-muted">{t("minVersion")}:</span> {minRow?.version ?? t("noMin")}</p>
        <form action={askEveryoneToUpdate} className="flex flex-wrap items-center gap-3">
          <button type="submit" className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("askEveryone")}</button>
          <span className="text-xs text-muted">{t("askEveryoneHelp")}</span>
        </form>
      </section>

      <section className={card}>
        <h2 className="text-base font-bold">{t("behind")} ({behind.length})</h2>
        {behind.length === 0 ? <p className="text-sm text-muted">{t("allCurrent")}</p> : (
          <ul className="flex flex-col divide-y divide-line">
            {behind.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <b className="text-sm">{p.name}</b>
                  <span className="text-xs text-muted">
                    {p.device ? `${p.device.device_name ?? "—"} · ${p.device.app_version ?? "—"} · ${t("lastSeen")} ${when(p.device.last_seen_at)}` : t("neverOpened")}
                  </span>
                </span>
                <form action={remindToUpdate}>
                  <input type="hidden" name="profile_id" value={p.id} />
                  <button type="submit" className="h-9 rounded-[10px] border border-field bg-white px-3 text-sm font-semibold">{t("remind")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
