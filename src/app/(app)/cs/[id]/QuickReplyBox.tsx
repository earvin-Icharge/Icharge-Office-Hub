"use client";

import { useState } from "react";

/** Reply box with quick replies; the quick reply used is logged on the trail. */
export function QuickReplyBox({ replies, placeholder, quickLabel }: { replies: { id: string; title: string; text: string; language: string }[]; placeholder: string; quickLabel: string }) {
  const [text, setText] = useState("");
  const [quick, setQuick] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <select aria-label={quickLabel} value="" onChange={(e) => { const r = replies.find((x) => x.id === e.target.value); if (r) { setText(r.text); setQuick(r.id); } }}
        className="h-10 w-fit rounded-[10px] border border-field bg-white px-3 text-sm">
        <option value="">{quickLabel}</option>
        {replies.map((r) => <option key={r.id} value={r.id}>{r.language === "fil" ? "Filipino · " : "English · "}{r.title}</option>)}
      </select>
      <input type="hidden" name="quick_id" value={quick} />
      <textarea name="text" required rows={3} value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setQuick(""); }} placeholder={placeholder} className="rounded-[10px] border border-field px-3 py-2 text-sm" />
    </div>
  );
}
