"use client";

import { usePathname } from "next/navigation";

/** Page name in the phone top bar. */
export function PageTitle({ titles, className }: { titles: Record<string, string>; className?: string }) {
  const pathname = usePathname();
  const match = Object.keys(titles)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return <span className={className}>{match ? titles[match] : ""}</span>;
}
