"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { setLanguage } from "@/app/actions/preferences";

export function LanguagePicker({ value, label }: { value: "en" | "zh-Hans"; label: string }) {
  const router = useRouter();
  const [current, setCurrent] = useOptimistic(value);
  const [, start] = useTransition();
  return (
    <div role="group" aria-label={label} className="inline-flex w-fit gap-0.5 rounded-full border border-field bg-white p-[3px]">
      {([["en", "English"], ["zh-Hans", "简体中文"]] as const).map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={current === v}
          onClick={() => start(async () => { setCurrent(v); await setLanguage(v); router.refresh(); })}
          className={`h-9 rounded-full px-4 text-[13px] font-bold ${current === v ? "bg-forest text-white" : "text-ink-2"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
