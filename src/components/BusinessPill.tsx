import { useTranslations } from "next-intl";
import { BusinessIcon, type Business } from "./BusinessIcon";

const LOOK: Record<Business, string> = {
  icharge: "bg-charge-soft text-leaf",
  iscreen: "bg-screen-soft text-screen-text",
  company: "bg-company-soft text-ink-2",
};

/** Business pill: always icon + name, never color alone (spec 4.1). */
export function BusinessPill({ business }: { business: Business }) {
  const t = useTranslations("business");
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${LOOK[business]}`}>
      <BusinessIcon business={business} />
      {t(business)}
    </span>
  );
}
