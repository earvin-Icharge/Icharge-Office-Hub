import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getMyLatestRequest } from "@/lib/requests";

export const metadata = { title: "Waiting for approval" };

/** A signed-in person without active access sees only this page (spec 3.5). */
export default async function PendingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const viewer = await getViewer();
  if (viewer?.active) redirect("/today");
  const t = await getTranslations();
  const format = await getFormatter();
  const req = viewer ? null : await getMyLatestRequest();

  let body: React.ReactNode;
  if (viewer && !viewer.active) {
    body = (
      <>
        <h1 className="font-display text-2xl font-bold">{t("pending.inactiveTitle")}</h1>
        <p className="text-sm leading-relaxed text-ink-2">{t("pending.inactiveBody")}</p>
      </>
    );
  } else if (!req) {
    body = (
      <>
        <h1 className="font-display text-2xl font-bold">{t("pendingRequest.noRequestTitle")}</h1>
        <p className="text-sm leading-relaxed text-ink-2">{t.rich("pendingRequest.noRequestBody", { email: user.email ?? "", b: (c) => <b>{c}</b> })}</p>
        <Link href="/welcome" className="inline-flex h-12 items-center rounded-xl bg-charge px-6 text-base font-bold text-forest">{t("pendingRequest.fillForm")}</Link>
      </>
    );
  } else if (req.status === "declined") {
    body = (
      <>
        <h1 className="font-display text-2xl font-bold">{t("pendingRequest.declinedTitle")}</h1>
        <p className="text-sm leading-relaxed text-ink-2">{t("pendingRequest.declinedBody", { reason: req.decline_reason ?? "—" })}</p>
        <Link href="/welcome" className="inline-flex h-12 items-center rounded-xl bg-charge px-6 text-base font-bold text-forest">{t("pendingRequest.newRequest")}</Link>
      </>
    );
  } else {
    const statusText = req.status === "proposed" ? t("pendingRequest.statusProposed") : req.status === "sent_back" ? t("pendingRequest.statusSentBack") : t("pendingRequest.statusPending");
    body = (
      <>
        <h1 className="font-display text-2xl font-bold">{t("pending.title")}</h1>
        <p className="text-sm leading-relaxed text-ink-2">{t.rich("pending.body", { email: user.email ?? "", b: (c) => <b>{c}</b> })}</p>
        <div className="w-full rounded-xl border border-charge-line bg-charge-soft px-3.5 py-3 text-left text-[13px] leading-relaxed">
          <b>{t("pendingRequest.yourRequest")}</b>
          <br />
          {req.full_name} · {req.position} · {req.department?.name ?? "—"}
          <br />
          {req.supervisor?.name ? `${t("welcome.supervisor")}: ${req.supervisor.name} · ` : ""}
          {t("pendingRequest.sent", { date: format.dateTime(new Date(req.created_at), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })}
          <br />
          <b>{statusText}</b>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-4 py-10">
      <div className="rounded-full bg-forest px-5 py-3">
        <Logo size={32} wordmarkClass="text-xl" />
      </div>
      <div className="flex w-full max-w-[440px] flex-col items-center gap-3.5 rounded-[20px] border border-line bg-white p-8 text-center">
        <Image src="/mascot/thumbs-up.png" alt="" width={84} height={84} className="h-auto w-[84px]" />
        {body}
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm font-semibold text-leaf">{t("common.signOut")}</button>
        </form>
      </div>
    </div>
  );
}
