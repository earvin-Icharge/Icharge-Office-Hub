"use client";

import { useState } from "react";

/** My day tabs (spec 4.5): Today, This week, Overdue, Waiting on others, Assigned by me. */
export function TaskTabs({ tabs, panels, initial = "today" }: { tabs: { key: string; label: string; count: number }[]; panels: Record<string, React.ReactNode>; initial?: string }) {
  const [tab, setTab] = useState(initial);
  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 pt-3 pb-3.5">
        {tabs.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] ${tab === t.key ? "bg-forest font-semibold text-white" : "border border-[#D5DCCB] bg-white font-medium text-forest"}`}>
            {t.label}
            <span className={`rounded-full px-1.5 text-[11px] ${tab === t.key ? "bg-charge text-forest" : "bg-company-soft"}`}>{t.count}</span>
          </button>
        ))}
      </div>
      {panels[tab]}
    </>
  );
}
