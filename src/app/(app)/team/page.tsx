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
  const rows = team.map((p) => {
    const mine = (tasks ?? []).filter((x) => x.owner_id === p.id);
    const over = mine.filter((x) => new Date(x.due_at).getTime() < now).length;
    const a = (att ?? []).find((x) => x.profile_id === p.id);
    const onLeave = (leave ?? []).find((x) => x.profile_id === p.id && x.status === "approved" && x.start_date <= today && x.end_date >= today);
    const pend = (leave ?? []).filter((x) => x.profile_id === p.id && x.status === "pending").length;
    const todayPill = onLeave ? <Pill tone="wait">{t("onLeave")}</Pill> : a ? <Pill tone={a.location_ok ? "ok" : "wait"}>{ta(a.mode)} · {format.dateTime(new Date(a.time_in), { hour: "numeric", minute: "2-digit" })}{a.location_ok ? ` · ${ta("verified")}` : a.in_distance_m ? ` · ${ta("awayM", { m: a.in_distance_m })}` : ""}</Pill> : <Pill>{t("notIn")}</Pill>;
    return { p, open: mine.length, over, pend, todayPill };
  });
  const name = (p: (typeof team)[number]) => <Link href={`/performance?who=${p.id}`} className="font-semibold text-leaf hover:underline">{p.name}</Link>;
  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("title")}</h1>
      {/* Phones: one card per person */}
      <ul className="flex flex-col gap-2.5 min-[700px]:hidden">
        {rows.map(({ p, open, over, pend, todayPill }) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-4">
            <div>{name(p)}<p className="text-xs text-muted">{p.position ?? ""}</p></div>
            <div>{todayPill}</div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-muted">{t("open")}</dt><dd className="font-semibold">{open}</dd></div>
              <div><dt className="text-xs text-muted">{t("overdue")}</dt><dd className="font-semibold">{over ? <Pill tone="bad">{over}</Pill> : 0}</dd></div>
              <div><dt className="text-xs text-muted">{t("pendingLeave")}</dt><dd className="font-semibold">{pend ? <Link href="/hr/leave" className="text-leaf">{pend}</Link> : "—"}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-[14px] border border-line bg-white min-[700px]:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="p-3">{t("title")}</th><th className="p-3">{t("open")}</th><th className="p-3">{t("overdue")}</th><th className="p-3">{t("today")}</th><th className="p-3">{t("pendingLeave")}</th></tr></thead>
          <tbody>
            {rows.map(({ p, open, over, pend, todayPill }) => (
              <tr key={p.id} className="border-t border-line">
                <td className="p-3">{name(p)}<br /><span className="text-xs text-muted">{p.position ?? ""}</span></td>
                <td className="p-3">{open}</td>
                <td className="p-3">{over ? <Pill tone="bad">{over}</Pill> : 0}</td>
                <td className="p-3">{todayPill}</td>
                <td className="p-3">{pend ? <Link href="/hr/leave" className="text-leaf">{pend}</Link> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
