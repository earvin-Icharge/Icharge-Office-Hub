import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { BACKUP_TABLES } from "@/lib/backup";

export const metadata = { title: "Backup" };

/** Weekly backup: the Leader downloads all tables as CSV (spec 10). */
export default async function BackupPage() {
  const viewer = await getViewer();
  if (viewer?.level !== "leader") notFound();
  const t = await getTranslations("backup");
  return (
    <>
      <Link href="/settings" className="text-sm font-semibold text-leaf">← Settings</Link>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <p className="max-w-[760px] text-sm text-muted">{t("help")}</p>
      <ul className="grid max-w-[860px] grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {BACKUP_TABLES.map((name) => <li key={name}><a href={`/api/export/table/${name}`} className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold hover:bg-charge-soft"><span>{name}</span><span className="text-leaf">{t("download")}</span></a></li>)}
      </ul>
    </>
  );
}
