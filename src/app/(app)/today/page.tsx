import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Battery } from "@/components/Battery";
import { BusinessSwitch } from "@/components/BusinessSwitch";
import { getViewer } from "@/lib/viewer";
import { TaskTabs } from "./TaskTabs";

export const metadata = { title: "My day" };

function manilaHour(d: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }).format(d));
}

export default async function TodayPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("today");
  const tl = await getTranslations("levels");
  const format = await getFormatter();
  const now = new Date();
  const hour = manilaHour(now);
  const first = viewer.name.split(" ")[0];
  const greeting = hour < 12 ? t("goodMorning", { name: first }) : hour < 18 ? t("goodAfternoon", { name: first }) : t("goodEvening", { name: first });

  const tiles = [
    { key: "due", label: t("tileDueToday") },
    { key: "overdue", label: t("tileOverdue") },
    { key: "waiting", label: t("tileWaiting") },
    { key: "assigned", label: t("tileAssigned") },
  ];
  const yesNo = (b: boolean) => (b ? t("yes") : t("no"));

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-muted">{format.dateTime(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{greeting}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-[18px] rounded-[18px] bg-forest px-[22px] py-3.5 text-white">
        <Image src="/mascot/thumbs-up.png" alt="iCharge mascot giving a thumbs up" width={104} height={104} className="h-[104px] w-[104px] flex-none object-contain" />
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
          <span className="font-display text-[19px] font-bold">{t("cheer")}</span>
          <span className="text-sm text-mist">{t("cheerSub")}</span>
        </div>
        <div className="flex flex-[0_1_220px] flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-[1px] text-sage">{t("todaysCharge")}</span>
          <Battery percent={0} label={t("noTasksYet")} />
          <span className="text-[13px] text-mist">{t("noTasksYet")}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="flex flex-[1_1_150px] flex-col items-start gap-1 rounded-[14px] border border-line bg-white px-[18px] py-4">
            <span className="font-display text-[32px] font-bold">0</span>
            <span className="text-sm">{tile.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label={t("myTasks")} className="min-w-0 flex-[2_1_520px] overflow-hidden rounded-[14px] border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 pt-4">
            <h2 className="font-display text-[17px] font-bold">{t("myTasks")}</h2>
            <BusinessSwitch value={viewer.defaultBusiness} />
          </div>
          <TaskTabs
            tabs={[
              { key: "today", label: t("tabToday") },
              { key: "week", label: t("tabWeek") },
              { key: "overdue", label: t("tabOverdue") },
              { key: "waiting", label: t("tabWaiting") },
              { key: "assigned", label: t("tabAssigned") },
            ]}
            emptyTitle={t("emptyTitle")}
            emptyBody={t("emptyBody")}
          />
        </section>

        <aside aria-label={t("myAccess")} className="flex min-w-0 flex-[1_1_260px] flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]">
          <h2 className="text-base font-bold">{t("myAccess")}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">{t("level")}</dt>
            <dd className="font-semibold">{tl(viewer.level)}</dd>
            <dt className="text-muted">{t("hrAccess")}</dt>
            <dd>{yesNo(viewer.hr)}</dd>
            <dt className="text-muted">{t("financeAccess")}</dt>
            <dd>{yesNo(viewer.finance)}</dd>
            <dt className="text-muted">{t("department")}</dt>
            <dd>{viewer.departmentName ?? t("none")}</dd>
            <dt className="text-muted">{t("position")}</dt>
            <dd>{viewer.position ?? t("none")}</dd>
            <dt className="text-muted">{t("heads")}</dt>
            <dd>{viewer.headOf.length ? viewer.headOf.join(", ").toUpperCase() : t("none")}</dd>
          </dl>
        </aside>
      </div>
    </>
  );
}
