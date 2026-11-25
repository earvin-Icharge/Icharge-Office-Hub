"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLoginLanguage } from "./actions";

export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const options = [
    { value: "en", label: "English" },
    { value: "zh-Hans", label: "简体中文" },
  ] as const;
  return (
    <div role="group" aria-label="Language / 语言" className="inline-flex gap-0.5 rounded-full border border-field bg-white p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={locale === o.value}
          disabled={pending}
          onClick={() => start(async () => { await setLoginLanguage(o.value); router.refresh(); })}
          className={`h-9 rounded-full px-4 text-[13px] font-bold ${locale === o.value ? "bg-forest text-white" : "text-ink-2"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
