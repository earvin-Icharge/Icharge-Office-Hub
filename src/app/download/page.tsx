import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Android app" };

/** Office Hub for Android: direct download (staff only; the app still needs a work-email sign-in). */
export default async function DownloadPage() {
  const t = await getTranslations("download");
  const steps = ["s1", "s2", "s3", "s4"] as const;
  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-paper px-4 py-10">
      <div className="rounded-full bg-forest px-5 py-3"><Logo size={32} wordmarkClass="text-xl" /></div>
      <div className="flex w-full max-w-[440px] flex-col gap-5 rounded-[20px] border border-line bg-white p-6">
        <div className="flex items-center gap-3">
          <Image src="/icons/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 rounded-2xl" />
          <div>
            <h1 className="font-display text-2xl leading-tight font-bold">{t("title")}</h1>
            <p className="text-sm text-muted">{t("sub")}</p>
          </div>
        </div>
        <a href="/download/office-hub.apk" download="office-hub.apk"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-charge px-6 text-base font-bold text-forest">
          <Download aria-hidden size={20} />
          {t("button")}
        </a>
        <ol className="flex flex-col gap-3 text-[15px] text-ink-2">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-forest text-xs font-bold text-white">{i + 1}</span>
              <span>{t(s)}</span>
            </li>
          ))}
        </ol>
        <p className="rounded-xl bg-charge-soft p-3 text-sm text-ink-2">{t("chrome")}</p>
        <p className="text-sm text-muted">{t("iphone")}</p>
      </div>
    </div>
  );
}
