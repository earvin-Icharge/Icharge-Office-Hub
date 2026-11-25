import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Battery } from "@/components/Battery";
import { BusinessSwitch } from "@/components/BusinessSwitch";
import { getViewer } from "@/lib/viewer";
import { TaskTabs } from "./TaskTabs";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { myDayTasks } from "@/lib/tasks";
import { manilaDayBounds } from "@/lib/time";
import { TaskList } from "../tasks/TaskList";
import { QuickPrompt } from "./QuickPrompt";
import { cookies } from "next/headers";
import { getDevice, readDeviceKey } from "@/lib/device";

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

  const lists = await myDayTasks(viewer.id, viewer.defaultBusiness);
  const day = manilaDayBounds();
  const supabase = await createClient();
  const { data: dueToday } = await supabase.from("tasks").select("status").eq("owner_id", viewer.id).is("deleted_at", null)
    .gte("due_at", day.start).lt("due_at", day.end).neq("status", "cancelled");
  const totalToday = (dueToday ?? []).length;
  const doneToday = (dueToday ?? []).filter((x) => x.status === "done").length;
  const pct = totalToday ? (doneToday / totalToday) * 100 : 0;
  const chargeLabel = totalToday ? t("chargeLabel", { done: doneToday, total: totalToday }) : t("noTasksYet");
  const tiles = [
    { key: "due", label: t("tileDueToday"), n: lists.today.length },
    { key: "overdue", label: t("tileOverdue"), n: lists.overdue.length },
    { key: "waiting", label: t("tileWaiting"), n: lists.waiting.length },
    { key: "assigned", label: t("tileAssigned"), n: lists.assigned.length },
  ];
  const empty = (
    <div className="flex items-center gap-3.5 border-t border-line px-4 py-[18px]">
      <Image src="/mascot/thumbs-up.png" alt="" width={64} height={64} className="h-16 w-16 flex-none object-contain" />
      <span className="text-sm text-muted"><b className="text-forest">{t("emptyTitle")}</b> {t("emptyBody")}</span>
    </div>
  );
  const yesNo = (b: boolean) => (b ? t("yes") : t("no"));
  const device = await getDevice(readDeviceKey(await cookies()), viewer.id);

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-muted">{format.dateTime(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{greeting}</h1>
      </div>

      {!device?.quick_method && <QuickPrompt />}

      <div className="flex flex-wrap items-center gap-[18px] rounded-[18px] bg-forest px-[22px] py-3.5 text-white">
        <Image src="/mascot/thumbs-up.png" alt="iCharge mascot giving a thumbs up" width={104} height={104} className="h-[104px] w-[104px] flex-none object-contain" />
        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
          <span className="font-display text-[19px] font-bold">{t("cheer")}</span>
          <span className="text-sm text-mist">{lists.overdue.length ? t("overdueNote", { n: lists.overdue.length }) : t("cheerSub")}</span>
        </div>
        <div className="flex flex-[0_1_220px] flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-[1px] text-sage">{t("todaysCharge")}</span>
          <Battery percent={pct} label={chargeLabel} />
          <span className="text-[13px] text-mist">{chargeLabel}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {tiles.map((tile) => (
          <div key={tile.key} className={`flex flex-[1_1_150px] flex-col items-start gap-1 rounded-[14px] border px-[18px] py-4 ${tile.key === "overdue" && tile.n ? "border-[#FCA5A5] bg-danger-soft text-danger" : "border-line bg-white"}`}>
            <span className="font-display text-[32px] font-bold">{tile.n}</span>
            <span className="text-sm">{tile.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label={t("myTasks")} className="min-w-0 flex-[2_1_520px] overflow-hidden rounded-[14px] border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 pt-4">
            <h2 className="font-display text-[17px] font-bold">{t("myTasks")}</h2>
            <Link href="/tasks/new" className="inline-flex h-9 items-center rounded-[10px] bg-charge px-3.5 text-[13px] font-semibold text-forest">{t("newTask")}</Link>
            <BusinessSwitch value={viewer.defaultBusiness} />
          </div>
          <TaskTabs
            tabs={[
              { key: "today", label: t("tabToday"), count: lists.today.length },
              { key: "week", label: t("tabWeek"), count: lists.week.length },
              { key: "overdue", label: t("tabOverdue"), count: lists.overdue.length },
              { key: "waiting", label: t("tabWaiting"), count: lists.waiting.length },
              { key: "assigned", label: t("tabAssigned"), count: lists.assigned.length },
            ]}
            panels={{
              today: <TaskList tasks={lists.today} me={viewer.id} empty={empty} />,
              week: <TaskList tasks={lists.week} me={viewer.id} empty={empty} />,
              overdue: <TaskList tasks={lists.overdue} me={viewer.id} empty={empty} />,
              waiting: <TaskList tasks={lists.waiting} me={viewer.id} empty={empty} />,
              assigned: <TaskList tasks={lists.assigned} me={viewer.id} empty={empty} />,
            }}
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
