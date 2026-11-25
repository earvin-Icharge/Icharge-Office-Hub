import { useTranslations } from "next-intl";

const base = "inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold";
const STATUS: Record<string, string> = {
  todo: "bg-company-soft text-ink-2",
  in_progress: "bg-[#DBEAFE] text-[#1E40AF]",
  waiting: "bg-[#FEF3C7] text-[#92400E]",
  done: "bg-[#DCFCE7] text-[#166534]",
  cancelled: "bg-company-soft text-muted line-through",
  overdue: "bg-danger-soft text-danger",
  new: "bg-[#E0E7FF] text-[#3730A3]",
};

export function TaskStatusPill({ status, overdue, unacknowledged }: { status: string; overdue?: boolean; unacknowledged?: boolean }) {
  const t = useTranslations("tasks");
  if (overdue) return <span className={`${base} ${STATUS.overdue}`}>{t("overdue")}</span>;
  if (unacknowledged && status === "todo") return <span className={`${base} ${STATUS.new}`}>{t("newPleaseAck")}</span>;
  return <span className={`${base} ${STATUS[status] ?? STATUS.todo}`}>{t(`status.${status}`)}</span>;
}

export function PriorityLabel({ priority }: { priority: string }) {
  const t = useTranslations("tasks");
  const cls = priority === "urgent" ? "text-danger font-bold" : priority === "high" ? "text-[#B45309] font-bold" : "text-muted font-semibold";
  return <span className={`text-xs ${cls}`}>{t(`priority.${priority}`)}</span>;
}

export function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "new" | "wait" | "ok" | "bad" | "info" }) {
  const c = { plain: STATUS.todo, new: STATUS.new, wait: STATUS.waiting, ok: STATUS.done, bad: STATUS.overdue, info: STATUS.in_progress }[tone];
  return <span className={`${base} ${c}`}>{children}</span>;
}
