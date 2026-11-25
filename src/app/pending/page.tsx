import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Waiting for approval" };

/** A signed-in person with no active employee record sees only this page (spec 3.5). */
export default async function PendingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const viewer = await getViewer();
  if (viewer?.active) redirect("/today");
  const inactive = viewer && !viewer.active;
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-4 py-10">
      <div className="rounded-full bg-forest px-5 py-3">
        <Logo size={32} wordmarkClass="text-xl" />
      </div>
      <div className="flex w-full max-w-[440px] flex-col items-center gap-3.5 rounded-[20px] border border-line bg-white p-8 text-center">
        <Image src="/mascot/thumbs-up.png" alt="" width={84} height={84} className="h-auto w-[84px]" />
        <h1 className="font-display text-2xl font-bold">{inactive ? t("pending.inactiveTitle") : t("pending.title")}</h1>
        {inactive ? (
          <p className="text-sm leading-relaxed text-ink-2">{t("pending.inactiveBody")}</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-2">{t.rich("pending.body", { email: user.email ?? "", b: (c) => <b>{c}</b> })}</p>
            <p className="w-full rounded-xl border border-charge-line bg-charge-soft px-3.5 py-3 text-left text-[13px] leading-relaxed">{t("pending.next")}</p>
          </>
        )}
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm font-semibold text-leaf">{t("common.signOut")}</button>
        </form>
      </div>
    </div>
  );
}
