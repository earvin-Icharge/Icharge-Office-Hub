import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SIGNED_IN_COOKIE } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import { LogOut, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SideNav } from "@/components/SideNav";
import { PhoneNav } from "@/components/PhoneNav";
import { NAV, visibleNav } from "@/lib/nav";
import { getViewer } from "@/lib/viewer";
import { PageTitle } from "@/components/PageTitle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    // An approved invite gives access right after the first code (spec 3.5).
    const supabase = await createClient();
    const { data: claimed } = await supabase.rpc("claim_invite");
    if (claimed) redirect("/today");
  }
  if (!viewer || !viewer.active) redirect("/pending");

  // An access change ends older sessions (spec 3.5).
  const signedInAt = (await cookies()).get(SIGNED_IN_COOKIE)?.value;
  if (signedInAt && new Date(viewer.accessChangedAt) > new Date(signedInAt)) redirect("/auth/reauth");

  let accessBadge = 0;
  if (viewer.level === "leader" || viewer.hr) {
    const supabase = await createClient();
    accessBadge = (await supabase.rpc("access_inbox_count")).data ?? 0;
  }

  const t = await getTranslations();
  const items = visibleNav(viewer).map((i) => ({ key: i.key, href: i.href, icon: i.icon, section: i.section, label: t(`nav.${i.key}`), badge: i.key === "access" ? accessBadge : 0 }));
  const phone = (key: string) => {
    const i = NAV.find((n) => n.key === key)!;
    return { key: i.key, href: i.href, icon: i.icon, label: t(`nav.${i.key}`) };
  };
  const titles = Object.fromEntries([...NAV.map((n) => [n.href, t(`nav.${n.key}`)]), ["/profile", t("nav.profile")]]);

  return (
    <div className="flex min-h-screen flex-wrap bg-paper">
      {/* Phone top bar */}
      <header className="sticky top-0 z-[5] flex flex-[1_1_100%] items-center justify-between gap-2.5 bg-forest px-4 py-3 text-white min-[700px]:hidden">
        <span className="flex items-center gap-2">
          <Logo size={30} wordmarkClass="text-xl" />
        </span>
        <span className="flex items-center gap-3">
          <PageTitle titles={titles} className="text-[13px] font-semibold text-mist" />
          <Link href="/profile" aria-label={t("nav.profile")} className="flex h-11 w-11 items-center justify-center rounded-full text-mist">
            <UserRound aria-hidden size={22} />
          </Link>
        </span>
      </header>

      {/* Side menu (hidden on phones) */}
      <nav aria-label={t("nav.mainMenu")} className="hidden flex-[1_1_220px] flex-col gap-1 bg-forest px-4 py-6 min-[700px]:flex min-[700px]:max-w-[260px]">
        <div className="mx-3 mb-5">
          <Logo subtitle={t("common.officeHub")} />
        </div>
        <SideNav items={items} sections={{ work: t("nav.work"), hr: t("nav.hr"), admin: t("nav.admin") }} />
        <div className="mt-auto flex flex-col gap-3 pt-5">
          <div className="flex items-center gap-2.5 rounded-[14px] border border-forest-line bg-forest-2 p-3">
            <Image src="/mascot/thumbs-up.png" alt="" width={46} height={46} className="h-[46px] w-[46px] flex-none object-contain" />
            <span className="text-xs leading-[1.45] text-mist">
              <b className="text-charge">{t("common.chargeTip")}</b> {t("common.chargeTipText")}
            </span>
          </div>
          <Link href="/profile" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-mist hover:bg-forest-2">
            <UserRound aria-hidden size={18} className="flex-none" />
            <span className="min-w-0 truncate">{viewer.name}</span>
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-mist hover:bg-forest-2">
              <LogOut aria-hidden size={18} className="flex-none" />
              {t("common.signOut")}
            </button>
          </form>
        </div>
      </nav>

      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-4 pt-4 pb-28 min-[700px]:px-8 min-[700px]:py-7">
        {children}
      </main>

      <PhoneNav
        label={t("nav.phoneMenu")}
        left={[phone("myday"), phone("tasks")]}
        right={[phone("leave"), phone("issues")]}
        timeIn={{ href: "/hr/attendance", label: t("nav.timein") }}
      />
    </div>
  );
}
