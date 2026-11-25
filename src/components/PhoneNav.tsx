"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap } from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/nav";
import { NavIcon } from "./NavIcon";

type Item = { key: string; href: string; icon: NavIconName; label: string };

/** Phone bottom menu (screens under 700 px): My day, Tasks, big Time in button, Leave, Issues. */
export function PhoneNav({ left, right, timeIn, label }: { left: Item[]; right: Item[]; timeIn: { href: string; label: string }; label: string }) {
  const pathname = usePathname();
  const link = (i: Item) => {
    const active = pathname === i.href || pathname.startsWith(i.href + "/");
    return (
      <Link key={i.key} href={i.href} aria-current={active ? "page" : undefined}
        className={`flex min-w-14 flex-col items-center gap-[3px] text-[11px] font-semibold ${active ? "text-charge" : "text-mist"}`}>
        <NavIcon name={i.icon} size={22} />
        {i.label}
      </Link>
    );
  };
  return (
    <nav aria-label={label}
      className="fixed inset-x-0 bottom-0 z-10 flex items-end justify-around gap-1 border-t border-forest-line bg-forest px-2 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] min-[700px]:hidden">
      {left.map(link)}
      <Link href={timeIn.href} className="flex min-w-16 flex-col items-center gap-[3px] text-[11px] font-bold text-charge">
        <span className="-mt-[30px] flex h-14 w-14 items-center justify-center rounded-full border-4 border-forest bg-charge text-forest">
          <Zap aria-hidden size={26} fill="currentColor" strokeWidth={0} />
        </span>
        {timeIn.label}
      </Link>
      {right.map(link)}
    </nav>
  );
}
