import { getTranslations } from "next-intl/server";

/** Phones: tells people a wide table scrolls sideways. */
export async function SwipeHint({ className = "" }: { className?: string }) {
  const t = await getTranslations("common");
  return <p className={`text-xs text-muted min-[700px]:hidden ${className}`}>{t("swipe")}</p>;
}
