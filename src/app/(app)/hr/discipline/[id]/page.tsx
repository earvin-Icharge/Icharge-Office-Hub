import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { FileUpload } from "@/components/FileUpload";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { getViewer } from "@/lib/viewer";
import { openAttachment } from "../../../tasks/actions";
import { acknowledge, decide, respond } from "../actions";

export const metadata = { title: "Disciplinary case" };
const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";

/** Full case: the employee (own), HR and the Leader only (spec 5.4). */
export default async function DisciplineCasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("disc");
  const format = await getFormatter();
  const d = (x: string) => format.dateTime(new Date(x.length === 10 ? `${x}T12:00:00Z` : x), { day: "numeric", month: "short", year: "numeric" });
  const supabase = await createClient();
  const { data: c } = await supabase.from("disciplinary_cases").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: files }, people] = await Promise.all([supabase.from("attachments").select("id, name").eq("entity", "discipline").eq("entity_id", id).is("deleted_at", null), getPeople()]);
  const name = (pid: string | null) => people.find((p) => p.id === pid)?.name ?? "—";
  const own = c.profile_id === viewer.id;
  return (
    <>
      <Link href="/hr/discipline" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
      <h1 className="font-display text-[24px] font-bold min-[700px]:text-[28px]">{t("ref", { ref: c.ref })} · {t(`types.${c.type}`)}</h1>
      <div className="flex flex-wrap items-center gap-2"><Pill tone="info">{t(`status.${c.status}`)}</Pill><span className="text-sm text-muted">{name(c.profile_id)} · {d(c.case_date)}</span></div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      <section className={card}>
        <p className="whitespace-pre-wrap text-sm">{c.description}</p>
        <p className="text-xs text-muted">{name(c.filed_by)} · {d(c.created_at)}{c.response_due ? ` · ${t("due", { date: d(c.response_due) })}` : ""}</p>
        <p className="text-sm">{c.acknowledged_at ? t("acknowledged", { date: d(c.acknowledged_at) }) : t("notAck")}</p>
        {own && !c.acknowledged_at && <form action={acknowledge}><input type="hidden" name="id" value={id} /><button className="h-11 rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("acknowledge")}</button></form>}
      </section>
      <section className={card}>
        <h2 className="text-base font-bold">{t("respond")}</h2>
        {c.response ? <><p className="whitespace-pre-wrap text-sm">{c.response}</p><p className="text-xs text-muted">{t("responded", { date: d(c.responded_at) })}</p></> : own ? (
          <form action={respond} className="flex flex-col gap-2"><input type="hidden" name="id" value={id} />
            <textarea name="text" required rows={4} aria-label={t("respond")} className="rounded-[10px] border border-field px-3 py-2 text-sm" />
            <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("sendResponse")}</button></form>
        ) : <p className="text-sm text-muted">—</p>}
      </section>
      <section className={card}>
        <h2 className="text-base font-bold">{t("decision")}</h2>
        {c.decision ? <p className="whitespace-pre-wrap text-sm">{c.decision} <span className="text-xs text-muted">· {name(c.decided_by)} · {d(c.decided_at)}</span></p> : <p className="text-sm text-muted">—</p>}
        {viewer.level === "leader" && !own && (
          <form action={decide} className="flex flex-col gap-2"><input type="hidden" name="id" value={id} />
            <textarea name="decision" required rows={3} defaultValue={c.decision ?? ""} aria-label={t("decision")} className="rounded-[10px] border border-field px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="close" className="h-4 w-4 accent-[#2F6B0A]" />{t("close")}</label>
            <button className="h-11 w-fit rounded-[10px] bg-charge px-5 text-sm font-bold text-forest">{t("record")}</button></form>
        )}
      </section>
      <section className={card}>
        <h2 className="text-base font-bold">{t("files")}</h2>
        <ul>{(files ?? []).map((a) => <li key={a.id}><form action={openAttachment}><input type="hidden" name="attachment_id" value={a.id} /><button className="text-sm font-semibold text-leaf hover:underline">{a.name}</button></form></li>)}</ul>
        <FileUpload entity="discipline" entityId={id} />
      </section>
    </>
  );
}
