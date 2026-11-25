import { getTranslations } from "next-intl/server";
import { humanDuration, timer, TONE_CLS } from "@/lib/timers";

/** Shows "Respond: 35 min left" etc. Colour plus words, never colour alone. */
export async function TimerPill({ label, start, due, stopped }: { label: string; start: string; due: string; stopped?: string | null }) {
  const t = await getTranslations("issues");
  const x = timer(start, due, stopped);
  const text = stopped ? (x.met ? t("met") : t("late", { time: humanDuration(x.msLeft) })) : x.msLeft >= 0 ? t("left", { time: humanDuration(x.msLeft) }) : t("late", { time: humanDuration(x.msLeft) });
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${stopped && x.met ? TONE_CLS.green : TONE_CLS[x.tone]}`}>{label}: {text}</span>;
}
