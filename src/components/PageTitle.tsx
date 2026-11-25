"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Page name in the phone top bar: the menu name, or the page heading for pages outside the menu. */
export function PageTitle({ titles, className }: { titles: Record<string, string>; className?: string }) {
  const pathname = usePathname();
  const match = Object.keys(titles)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
  const [heading, setHeading] = useState("");
  useEffect(() => {
    if (!match) setHeading(document.querySelector("main h1")?.textContent?.trim() ?? "");
  }, [match, pathname]);
  return <span className={className}>{match ? titles[match] : heading}</span>;
}
