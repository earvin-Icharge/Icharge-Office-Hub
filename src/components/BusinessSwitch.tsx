"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { setDefaultBusiness } from "@/app/actions/preferences";
import { BusinessIcon } from "./BusinessIcon";

type Value = "all" | "icharge" | "iscreen";

const ON: Record<Value, string> = {
  all: "bg-forest text-white",
  icharge: "bg-charge text-forest",
  iscreen: "bg-screen text-white",
};

/** All business / iCharge / iScreen. Remembered per user and carried between pages (spec 4.1). */
export function BusinessSwitch({ value }: { value: Value }) {
  const t = useTranslations("business");
  const [current, setCurrent] = useOptimistic(value);
  const [, start] = useTransition();
  return (
    <div role="group" aria-label={t("label")} className="inline-flex max-w-full gap-0.5 rounded-full border border-field bg-white p-[3px]">
      {(["all", "icharge", "iscreen"] as const).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={current === k}
          onClick={() => start(async () => { setCurrent(k); await setDefaultBusiness(k); })}
          className={`inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-bold min-[400px]:px-3.5 ${current === k ? ON[k] : "text-ink-2"}`}
        >
          <BusinessIcon business={k} />
          {t(k)}
        </button>
      ))}
    </div>
  );
}
