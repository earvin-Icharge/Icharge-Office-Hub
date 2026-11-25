import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";
import { LanguageToggle } from "./LanguageToggle";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const t = await getTranslations();
  const { e } = await searchParams;
  return (
    <div className="flex min-h-screen flex-wrap bg-paper">
      <section className="order-2 flex flex-[1_1_380px] min-[700px]:order-none flex-col justify-center gap-7 bg-forest px-6 py-10 text-white sm:px-10 sm:py-12">
        <Logo size={48} subtitle={t("common.officeHub")} wordmarkClass="text-[30px]" />
        <Image src="/mascot/thumbs-up.png" alt="iCharge mascot giving a thumbs up" width={150} height={150} priority className="h-auto w-[150px]" />
        <div className="flex max-w-[420px] flex-col gap-2.5">
          <h1 className="font-display text-[30px] leading-tight font-bold">{t("login.staffOnly")}</h1>
          <p className="text-[15px] leading-relaxed text-mist">
            {t.rich("login.intro", { b: (c) => <b className="text-charge">{c}</b> })}
          </p>
        </div>
        <ul className="flex flex-col gap-2 text-[13px] text-[#C9D9B8]">
          <li>{t("login.rule1")}</li>
          <li>{t("login.rule2")}</li>
          <li>{t("login.rule3")}</li>
          <li>{t("login.rule4")}</li>
        </ul>
      </section>
      <main className="flex min-w-0 flex-[999_1_460px] flex-col items-center justify-center gap-4 px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-full bg-forest px-5 py-3 min-[700px]:hidden">
          <Logo size={32} wordmarkClass="text-xl" />
        </div>
        <LanguageToggle />
        <div className="flex w-full max-w-[440px] flex-col gap-4 rounded-[20px] border border-line bg-white p-6 sm:p-8">
          <LoginForm initialError={e === "link" ? t("login.errors.linkFailed") : e === "inactive" ? t("login.errors.inactive") : e === "changed" ? t("login.errors.accessChanged") : e === "device" ? t("login.errors.signInAgain") : undefined} />
        </div>
        <p className="max-w-[440px] text-center text-xs leading-normal text-muted">{t("login.privacy")}</p>
      </main>
    </div>
  );
}
