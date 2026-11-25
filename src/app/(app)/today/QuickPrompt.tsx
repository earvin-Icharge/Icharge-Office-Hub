"use client";

import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const KEY = "oh_quick_prompt_skipped";

/** After the first email-code sign-in on a device: offer quick sign-in (skippable, spec 3.5). */
export function QuickPrompt() {
  const t = useTranslations("quick");
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { setShow(!localStorage.getItem(KEY)); } catch { setShow(true); }
  }, []);
  if (!show) return null;
  return (
    <section aria-label={t("promptTitle")} className="flex flex-wrap items-center gap-4 rounded-[14px] border border-charge-line bg-charge-soft p-4">
      <Fingerprint aria-hidden size={36} className="flex-none text-leaf" />
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
        <b className="text-[15px]">{t("promptTitle")}</b>
        <span className="text-sm text-ink-2">{t("promptBody")}</span>
      </div>
      <div className="flex gap-2">
        <Link href="/profile#quick" className="inline-flex h-10 items-center rounded-[10px] bg-charge px-4 text-sm font-bold text-forest">{t("promptSetUp")}</Link>
        <button type="button" onClick={() => { try { localStorage.setItem(KEY, "1"); } catch {} setShow(false); }} className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{t("promptSkip")}</button>
      </div>
    </section>
  );
}
