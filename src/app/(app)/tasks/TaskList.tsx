import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { BusinessPill } from "@/components/BusinessPill";
import { PriorityLabel, TaskStatusPill, Pill } from "@/components/Pills";
import { isOverdue, type TaskRow } from "@/lib/tasks";

/** Task rows used on My day and the Tasks page. */
export async function TaskList({ tasks, me, empty }: { tasks: TaskRow[]; me: string; empty: React.ReactNode }) {
  const t = await getTranslations("tasks");
  const format = await getFormatter();
  if (!tasks.length) return <>{empty}</>;
  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5">
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
            <Link href={`/tasks/${task.id}`} className="text-[15px] font-semibold text-forest hover:underline">{task.title}</Link>
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <BusinessPill business={task.business} />
              <span>
                {task.project?.name ? `${task.project.name} · ` : ""}
                {task.owner_id === me ? t("from", { name: task.assigner?.name ?? "—" }) : `${t("owner")}: ${task.owner?.name ?? "—"}`}
              </span>
            </span>
            {task.status === "waiting" && task.waiting_on && <span className="text-[13px] text-[#92400E]">{t("waitingLabel", { what: task.waiting_on })}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="min-w-[120px] text-[13px] text-muted">{format.dateTime(new Date(task.due_at), { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
            <PriorityLabel priority={task.priority} />
            {task.assign_state === "requested" ? <Pill tone="wait">{t("requested")}</Pill>
              : <TaskStatusPill status={task.status} overdue={isOverdue(task)} unacknowledged={!task.acknowledged_at && task.owner_id === me} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
