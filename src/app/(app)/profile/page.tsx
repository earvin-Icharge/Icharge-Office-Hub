import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { LanguagePicker } from "./LanguagePicker";

export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations();
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("profile.title")}</h1>
      <section className="flex max-w-[560px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
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
      <section className="flex max-w-[560px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("common.language")}</h2>
        <p className="text-sm text-muted">{t("profile.languageHelp")}</p>
        <LanguagePicker value={viewer.language} label={t("common.language")} />
      </section>
      <section className="flex max-w-[560px] flex-col gap-2 rounded-[14px] border border-line bg-white p-[18px]">
        <h2 className="text-base font-bold">{t("profile.quickSignIn")}</h2>
        <p className="text-sm text-muted">{t("profile.quickSignInSoon")}</p>
      </section>
      <form action="/auth/signout" method="post" className="min-[700px]:hidden">
        <button type="submit" className="h-12 w-full max-w-[560px] rounded-xl border border-field bg-white text-base font-semibold">
          {t("common.signOut")}
        </button>
      </form>
    </>
  );
}
