"use client";

import Image from "next/image";
import { useState } from "react";

/** My day tabs (spec 4.5). Tasks arrive in step 2; until then every tab is empty. */
export function TaskTabs({ tabs, emptyTitle, emptyBody }: { tabs: { key: string; label: string }[]; emptyTitle: string; emptyBody: string }) {
  const [tab, setTab] = useState(tabs[0].key);
  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 pt-3 pb-3.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`h-9 rounded-full px-3.5 text-[13px] ${tab === t.key ? "bg-forest font-semibold text-white" : "border border-[#D5DCCB] bg-white font-medium text-forest"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3.5 border-t border-line px-4 py-[18px]">
        <Image src="/mascot/thumbs-up.png" alt="" width={64} height={64} className="h-16 w-16 flex-none object-contain" />
        <span className="text-sm text-muted">
          <b className="text-forest">{emptyTitle}</b> {emptyBody}
        </span>
      </div>
    </>
  );
}
