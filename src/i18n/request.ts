import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/session";

export const LOCALES = ["en", "zh-Hans"] as const;
export type Locale = (typeof LOCALES)[number];

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale: Locale = store.get(LOCALE_COOKIE)?.value === "zh-Hans" ? "zh-Hans" : "en";
  return {
    locale,
    timeZone: "Asia/Manila",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
