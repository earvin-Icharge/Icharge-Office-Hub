import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Privacy notice" };

async function accept() {
  "use server";
  const supabase = await createClient();
  await supabase.rpc("accept_privacy");
  revalidatePath("/", "layout");
  redirect("/today");
}

/** Data Privacy Act (RA 10173): privacy notice and consent on first sign-in (spec 10). */
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const t = await getTranslations("privacy");
  const viewer = await getViewer();
  const viewOnly = (await searchParams).view === "1";
  if (!viewer && !viewOnly) redirect("/pending");
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-4 py-10">
      <div className="rounded-full bg-forest px-5 py-3"><Logo size={32} wordmarkClass="text-xl" /></div>
      <section className="flex w-full max-w-[620px] flex-col gap-3 rounded-[20px] border border-line bg-white p-7">
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        {(["intro", "p1", "p2", "p3", "p4"] as const).map((k) => <p key={k} className="text-sm leading-relaxed text-ink-2">{t(k)}</p>)}
        {viewer && !viewer.privacyAccepted && !viewOnly && (
          <form action={accept}><button className="h-12 rounded-xl bg-charge px-6 text-base font-bold text-forest">{t("agree")}</button></form>
        )}
      </section>
    </div>
  );
}
