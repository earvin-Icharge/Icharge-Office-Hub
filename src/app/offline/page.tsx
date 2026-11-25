import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Shown by the service worker when there is no signal. */
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-4 py-10">
      <div className="rounded-full bg-forest px-5 py-3"><Logo size={32} wordmarkClass="text-xl" /></div>
      <div className="flex w-full max-w-[400px] flex-col items-center gap-3 rounded-[20px] border border-line bg-white p-8 text-center">
        <Image src="/mascot/thumbs-up.png" alt="" width={84} height={84} className="h-auto w-[84px]" />
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-ink-2">{t("body")}</p>
        {/* A full page load on purpose: the app may need fresh files after being offline. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/today" className="inline-flex h-12 items-center rounded-xl bg-charge px-6 text-base font-bold text-forest">{t("retry")}</a>
      </div>
    </div>
  );
}
