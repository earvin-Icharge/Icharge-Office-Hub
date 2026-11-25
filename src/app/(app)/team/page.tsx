import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Pill } from "@/components/Pills";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Team" };

/** One Team page for Managers (their team) and the Leader (everyone): workload, attendance today, pending leave (spec 4.5, 6). */
export default async function TeamPage() {
  const viewer = await getViewer();
  if (!viewer || !(viewer.level === "manager" || viewer.level === "leader")) notFound();
  const t = await getTranslations("team");
  const ta = await getTranslations("att");
  const format = await getFormatter();
  const supabase = await createClient();
  const people = (await getPeople()).filter((p) => p.id !== viewer.id);
  const team = viewer.level === "leader" ? people : (await Promise.all(people.map(async (p) => ((await supabase.rpc("is_manager_of", { target_id: p.id })).data ? p : null)))).filter(Boolean) as typeof people;
  const ids = team.map((p) => p.id);
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const [{ data: tasks }, { data: att }, { data: leave }] = await Promise.all([
    ids.length ? supabase.from("tasks").select("owner_id, due_at").in("owner_id", ids).is("deleted_at", null).in("status", ["todo", "in_progress", "waiting"]).eq("assign_state", "accepted") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("attendance").select("profile_id, mode, time_in, location_ok, in_distance_m").in("profile_id", ids).eq("day", today) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("leave_requests").select("id, profile_id, start_date, end_date, status").in("profile_id", ids).in("status", ["approved", "pending"]).gte("end_date", today) : Promise.resolve({ data: [] }),
  ]);
  const now = Date.now();
  if (!team.length) return <p className="text-sm text-muted">{t("none")}</p>;
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="p-3">{t("title")}</th><th className="p-3">{t("open")}</th><th className="p-3">{t("overdue")}</th><th className="p-3">{t("today")}</th><th className="p-3">{t("pendingLeave")}</th></tr></thead>
          <tbody>
            {team.map((p) => {
              const mine = (tasks ?? []).filter((x) => x.owner_id === p.id);
              const over = mine.filter((x) => new Date(x.due_at).getTime() < now).length;
              const a = (att ?? []).find((x) => x.profile_id === p.id);
              const onLeave = (leave ?? []).find((x) => x.profile_id === p.id && x.status === "approved" && x.start_date <= today && x.end_date >= today);
              const pend = (leave ?? []).filter((x) => x.profile_id === p.id && x.status === "pending");
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="p-3"><Link href={`/performance?who=${p.id}`} className="font-semibold text-leaf hover:underline">{p.name}</Link><br /><span className="text-xs text-muted">{p.position ?? ""}</span></td>
                  <td className="p-3">{mine.length}</td>
                  <td className="p-3">{over ? <Pill tone="bad">{over}</Pill> : 0}</td>
                  <td className="p-3">{onLeave ? <Pill tone="wait">{t("onLeave")}</Pill> : a ? <Pill tone={a.location_ok ? "ok" : "wait"}>{ta(a.mode)} · {format.dateTime(new Date(a.time_in), { hour: "numeric", minute: "2-digit" })}{a.location_ok ? ` · ${ta("verified")}` : a.in_distance_m ? ` · ${ta("awayM", { m: a.in_distance_m })}` : ""}</Pill> : <Pill>{t("notIn")}</Pill>}</td>
                  <td className="p-3">{pend.length ? <Link href="/hr/leave" className="text-leaf">{pend.length}</Link> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
