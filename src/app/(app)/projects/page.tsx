import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Battery } from "@/components/Battery";
import { BusinessPill } from "@/components/BusinessPill";
import { BusinessSwitch } from "@/components/BusinessSwitch";
import { Flash } from "@/components/Flash";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { moveProject } from "./actions";

export const metadata = { title: "Projects" };
const STATUSES = ["planning", "active", "on_hold", "done"] as const;
type Project = { id: string; name: string; business: "icharge" | "iscreen" | "company"; status: string; due_date: string | null; owner_id: string; owner: { name: string } | null };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ view?: string; ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const t = await getTranslations("projects");
  const format = await getFormatter();
  const supabase = await createClient();
  let q = supabase.from("projects").select("id, name, business, status, due_date, owner_id, owner:profiles!projects_owner_id_fkey(name)").is("deleted_at", null).order("due_date", { nullsFirst: false });
  if (viewer.defaultBusiness !== "all") q = q.eq("business", viewer.defaultBusiness);
  const projects = ((await q).data ?? []) as unknown as Project[];
  const progress = new Map<string, { done: number; total: number }>();
  await Promise.all(projects.map(async (p) => {
    const { data } = await supabase.rpc("project_progress", { p_project: p.id });
    const row = (Array.isArray(data) ? data[0] : data) as { done: number; total: number } | undefined;
    progress.set(p.id, row ?? { done: 0, total: 0 });
  }));

  const cardOf = (p: Project) => {
    const pr = progress.get(p.id) ?? { done: 0, total: 0 };
    const label = t("progress", pr);
    return (
      <article key={p.id} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
        <Link href={`/projects/${p.id}`} className="font-semibold text-forest hover:underline">{p.name}</Link>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted"><BusinessPill business={p.business} />{p.owner?.name}{p.due_date ? ` · ${t("due", { date: format.dateTime(new Date(p.due_date), { day: "numeric", month: "short" }) })}` : ""}</span>
        <Battery percent={pr.total ? (pr.done / pr.total) * 100 : 0} label={label} />
        <span className="text-xs text-muted">{label}</span>
        <form action={moveProject} className="flex items-center gap-2">
          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={`/projects?view=${view}`} />
          <label className="sr-only" htmlFor={`mv-${p.id}`}>{t("moveTo")}</label>
          <select id={`mv-${p.id}`} name="status" defaultValue={p.status} className="h-8 rounded-lg border border-field bg-white px-2 text-xs">
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
          <button className="h-8 rounded-lg border border-field bg-white px-2.5 text-xs font-semibold">{t("moveTo")}</button>
        </form>
      </article>
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessSwitch value={viewer.defaultBusiness} />
          <nav className="inline-flex gap-0.5 rounded-full border border-field bg-white p-[3px]" aria-label={t("title")}>
            {(["board", "list"] as const).map((v) => (
              <Link key={v} href={`/projects?view=${v}`} aria-current={view === v ? "page" : undefined} className={`inline-flex h-[34px] items-center rounded-full px-3.5 text-[13px] font-bold ${view === v ? "bg-forest text-white" : "text-ink-2"}`}>{t(v)}</Link>
            ))}
          </nav>
          <Link href="/projects/new" className="inline-flex h-11 items-center rounded-[10px] bg-charge px-[18px] text-sm font-semibold text-forest">{t("newProject")}</Link>
        </div>
      </div>
      <Flash ok={sp.ok ? (t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null) : null} error={sp.error} />
      {projects.length === 0 ? (
        <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-white p-4">
          <Image src="/mascot/thumbs-up.png" alt="" width={64} height={64} className="h-16 w-16 object-contain" /><span className="text-sm text-muted">{t("noProjects")}</span>
        </div>
      ) : view === "board" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((s) => (
            <section key={s} aria-label={t(`status.${s}`)} className="flex flex-col gap-3 rounded-[14px] bg-company-soft p-3">
              <h2 className="flex items-center justify-between text-sm font-bold">{t(`status.${s}`)}<span className="rounded-full bg-white px-2 text-xs">{projects.filter((p) => p.status === s).length}</span></h2>
              {projects.filter((p) => p.status === s).map(cardOf)}
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{projects.map(cardOf)}</div>
      )}
    </>
  );
}
