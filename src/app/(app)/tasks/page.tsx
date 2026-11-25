import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { BusinessSwitch } from "@/components/BusinessSwitch";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { OPEN, TASK_LIST_SELECT, type TaskRow } from "@/lib/tasks";
import { getViewer } from "@/lib/viewer";
import { TaskList } from "./TaskList";

export const metadata = { title: "Tasks" };
const TABS = ["mine", "assigned", "team", "all", "done"] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const t = await getTranslations("tasks");
  const sp = await searchParams;
  const tabs = TABS.filter((k) => (k === "team" ? viewer.level !== "staff" : k === "all" ? viewer.level === "leader" : true));
  const tab = (tabs as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "mine";

  const supabase = await createClient();
  let q = supabase.from("tasks").select(TASK_LIST_SELECT).is("deleted_at", null);
  if (tab === "done") q = q.in("status", ["done", "cancelled"]).or(`owner_id.eq.${viewer.id},assigned_by.eq.${viewer.id}`).order("completed_at", { ascending: false, nullsFirst: false });
  else {
    q = q.filter("status", "in", OPEN).order("due_at");
    if (tab === "mine") q = q.eq("owner_id", viewer.id);
    if (tab === "assigned") q = q.eq("assigned_by", viewer.id).neq("owner_id", viewer.id);
    if (tab === "team") q = q.neq("owner_id", viewer.id);
  }
  if (viewer.defaultBusiness !== "all") q = q.eq("business", viewer.defaultBusiness);
  if (sp.q) q = q.ilike("title", `%${sp.q.replace(/[%_]/g, "")}%`);
  const { data } = await q.limit(200);
  const tasks = (data ?? []) as unknown as TaskRow[];
  const label: Record<string, string> = { mine: t("tabMine"), assigned: t("tabAssigned"), team: t("tabTeam"), all: t("tabAll"), done: t("tabDone") };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <form className="flex">
            <input type="hidden" name="tab" value={tab} />
            <input type="search" name="q" defaultValue={sp.q ?? ""} aria-label={t("search")} placeholder={t("search")} className="h-11 w-[220px] max-w-full rounded-[10px] border border-[#D5DCCB] bg-white px-3.5 text-sm" />
          </form>
          <Link href="/tasks/new" className="inline-flex h-11 items-center rounded-[10px] bg-charge px-[18px] text-sm font-semibold text-forest">{t("newTask")}</Link>
        </div>
      </div>
      <Flash ok={sp.ok ? (t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : sp.ok) : null} error={sp.error} />
      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 pt-4 pb-3.5">
          <nav className="flex flex-wrap gap-2" aria-label={t("title")}>
            {tabs.map((k) => (
              <Link key={k} href={`/tasks?tab=${k}`} aria-current={tab === k ? "page" : undefined}
                className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] ${tab === k ? "bg-forest font-semibold text-white" : "border border-[#D5DCCB] bg-white font-medium"}`}>{label[k]}</Link>
            ))}
          </nav>
          <BusinessSwitch value={viewer.defaultBusiness} />
        </div>
        <TaskList tasks={tasks} me={viewer.id} empty={
          <div className="flex items-center gap-3.5 border-t border-line px-4 py-[18px]">
            <Image src="/mascot/thumbs-up.png" alt="" width={64} height={64} className="h-16 w-16 object-contain" />
            <span className="text-sm text-muted">{t("noTasks")}</span>
          </div>} />
      </section>
    </>
  );
}
