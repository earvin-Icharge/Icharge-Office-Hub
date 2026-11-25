"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavIcon as NavIconName } from "@/lib/nav";
import { NavIcon } from "./NavIcon";

export type SideNavItem = { key: string; href: string; icon: NavIconName; label: string; section: "work" | "hr" | "admin"; badge?: number };

export function SideNav({ items, sections }: { items: SideNavItem[]; sections: Record<"work" | "hr" | "admin", string> }) {
  const pathname = usePathname();
  // Highlight only the closest match (so /settings/access lights up Access, not Settings too).
  const activeHref = items
    .map((i) => i.href)
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  const groups = (["work", "hr", "admin"] as const).filter((s) => items.some((i) => i.section === s));
  return (
    <>
      {groups.map((section, gi) => (
        <div key={section} className="flex flex-col gap-1">
          <p className={`${gi === 0 ? "mt-2" : "mt-4"} mx-3 mb-1 text-[11px] font-semibold tracking-[1px] text-sage`}>{sections[section]}</p>
          {items
            .filter((i) => i.section === section)
            .map((i) => {
              const active = i.href === activeHref;
              return (
                <Link
                  key={i.key}
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                    active ? "bg-charge font-semibold text-forest" : "text-mist hover:bg-forest-2"
                  }`}
                >
                  <NavIcon name={i.icon} />
                  {i.label}
                  {!!i.badge && (
                    <span className="ml-auto min-w-5 rounded-[10px] bg-charge px-[7px] py-px text-center text-[11px] font-bold text-forest">
                      {i.badge}
                    </span>
                  )}
                </Link>
              );
            })}
        </div>
      ))}
    </>
  );
}
