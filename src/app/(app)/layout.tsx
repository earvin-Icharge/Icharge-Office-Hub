import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SIGNED_IN_COOKIE } from "@/lib/session";
import { authSettings, deviceGate, getDevice, readDeviceKey } from "@/lib/device";
import { AppRuntime } from "@/components/AppRuntime";
import { NavProgress } from "@/components/NavProgress";
import { Bell } from "@/components/Bell";
import { getTranslations } from "next-intl/server";
import { LogOut, UserRound } from "lucide-react";
import { PhoneMenu } from "@/components/PhoneMenu";
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
  const store = await cookies();
  const signedInAt = store.get(SIGNED_IN_COOKIE)?.value;
  if (signedInAt && new Date(viewer.accessChangedAt) > new Date(signedInAt)) redirect("/auth/reauth");

  // Data Privacy Act: notice and consent on first sign-in (spec 10).
  if (!viewer.privacyAccepted) redirect("/privacy");

  // Everything this frame needs, fetched together (not one after another).
  const supabase = await createClient();
  const [device, settings, unreadRes, accessRes, t] = await Promise.all([
    getDevice(readDeviceKey(store), viewer.id),
    authSettings(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    viewer.level === "leader" || viewer.hr ? supabase.rpc("access_inbox_count") : Promise.resolve({ data: 0 }),
    getTranslations(),
  ]);

  // Quick sign-in (spec 3.5): removed device or 90 days -> email code; closed over 12 h -> fingerprint/PIN.
  const gate = deviceGate(device, settings);
  if (gate === "reauth") redirect("/auth/reauth?why=device");
  if (gate === "unlock") redirect("/unlock");

  const unread = unreadRes.count;
  const accessBadge = (accessRes.data as number | null) ?? 0;
  const items = visibleNav(viewer).map((i) => ({ key: i.key, href: i.href, icon: i.icon, section: i.section, label: t(`nav.${i.key}`), badge: i.key === "access" ? accessBadge : 0 }));
  const phone = (key: string) => {
    const i = NAV.find((n) => n.key === key)!;
    return { key: i.key, href: i.href, icon: i.icon, label: t(`nav.${i.key}`) };
  };
  const titles = Object.fromEntries([...NAV.map((n) => [n.href, t(`nav.${n.key}`)]), ["/profile", t("nav.profile")], ["/notifications", t("nav.notifications")]]);

  return (
    <div className="flex min-h-screen flex-wrap content-start bg-paper min-[700px]:content-stretch">
      {/* Phone top bar */}
      <header className="sticky top-[env(safe-area-inset-top)] z-[5] flex flex-[1_1_100%] items-center justify-between gap-2 bg-forest py-2 pr-2 pl-4 text-white min-[700px]:hidden">
        <span className="flex flex-none items-center gap-2">
          <Logo size={30} wordmarkClass="text-xl" />
        </span>
        <span className="flex min-w-0 items-center gap-1">
          <PageTitle titles={titles} className="line-clamp-2 min-w-0 pr-1 text-right text-[13px] leading-tight font-semibold text-mist max-[359px]:hidden" />
          <Bell count={unread ?? 0} label={t("nav.notifications")} className="flex-none text-mist" />
          <PhoneMenu items={items} name={viewer.name} sections={{ work: t("nav.work"), hr: t("nav.hr"), admin: t("nav.admin") }}
            labels={{ open: t("nav.openMenu"), close: t("nav.closeMenu"), title: t("nav.mainMenu"), profile: t("nav.profile"), signOut: t("common.signOut") }} />
        </span>
      </header>

      {/* Side menu (hidden on phones) */}
      <nav aria-label={t("nav.mainMenu")} className="hidden flex-[1_1_220px] flex-col gap-1 bg-forest px-4 py-6 min-[700px]:flex min-[700px]:max-w-[260px]">
        <div className="mx-3 mb-5 flex items-center justify-between gap-2">
          <Logo subtitle={t("common.officeHub")} />
          <Bell count={unread ?? 0} label={t("nav.notifications")} className="text-mist hover:bg-forest-2" />
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

      <AppRuntime />
      <Suspense fallback={null}><NavProgress /></Suspense>

      <PhoneNav
        label={t("nav.phoneMenu")}
        left={[phone("myday"), phone("tasks")]}
        right={[phone("leave"), phone("issues")]}
        timeIn={{ href: "/hr/attendance", label: t("nav.timein") }}
      />
    </div>
  );
}
