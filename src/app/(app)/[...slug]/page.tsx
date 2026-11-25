import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { findNav } from "@/lib/nav";
import { getViewer } from "@/lib/viewer";

/**
 * Placeholder for menu pages that later build steps deliver.
 * A page the person's access doesn't allow returns "not found", same as a hidden menu item.
 */
export default async function ComingSoon({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const item = findNav("/" + slug.join("/"));
  if (!item) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  if (!item.canSee(viewer)) notFound();

  const t = await getTranslations();
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t(`nav.${item.key}`)}</h1>
      <section className="flex max-w-[560px] flex-wrap items-center gap-4 rounded-[14px] border border-line bg-white p-5">
        <Image src="/mascot/thumbs-up.png" alt="" width={72} height={72} className="h-[72px] w-[72px] flex-none object-contain" />
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
          <h2 className="font-display text-lg font-bold">{t("common.comingSoonTitle")}</h2>
          <p className="text-sm text-muted">
            {item.step === "later" ? t("common.comingSoonLater") : t("common.comingSoonBody", { step: item.step })}
          </p>
          <Link href="/today" className="mt-1 text-sm font-semibold text-leaf">{t("common.backToMyDay")}</Link>
        </div>
      </section>
    </>
  );
}
