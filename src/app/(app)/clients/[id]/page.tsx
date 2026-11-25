import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { BusinessPill } from "@/components/BusinessPill";
import { FileUpload } from "@/components/FileUpload";
import { Flash } from "@/components/Flash";
import { Pill } from "@/components/Pills";
import { countdown, type Term } from "@/lib/clients";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/people";
import { TONE_CLS } from "@/lib/timers";
import { getViewer } from "@/lib/viewer";
import { openAttachment } from "../../tasks/actions";
import { addNote, decideTerm, editNote, saveContract, setTerm } from "../actions";
import { ClientForm } from "../ClientForm";

export const metadata = { title: "Client" };
const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-[18px]";
const field = "h-10 rounded-[10px] border border-field bg-white px-3 text-sm min-w-0";
const lab = "flex flex-col gap-1 text-xs font-semibold";
const btn = "h-10 w-fit rounded-[10px] px-4 text-sm font-semibold";

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/pending");
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("clients");
  const format = await getFormatter();
  const d = (x: string) => format.dateTime(new Date(x.length === 10 ? `${x}T12:00:00Z` : x), { day: "numeric", month: "short", year: "numeric" });
  const supabase = await createClient();
  const { data: c } = await supabase.from("clients").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) notFound();
  const [{ data: kiosks }, { data: contracts }, { data: terms }, { data: notes }, { data: canEdit }, { data: bdHead }, { data: plan }, { data: canSeeBd }, { data: zero }, { data: files }, people] = await Promise.all([
    supabase.from("client_kiosks").select("kiosk_id").eq("client_id", id),
    supabase.from("contracts").select("*").eq("client_id", id).order("end_date", { ascending: false }),
    supabase.from("client_terms").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("client_notes").select("*").eq("client_id", id).order("noted_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.rpc("can_edit_client", { p_client: id }),
    supabase.rpc("is_bd_head"),
    supabase.rpc("bd_plan_rate", { p_client: id }),
    supabase.rpc("can_see_bd_share", { p_client: id }),
    supabase.rpc("client_zero_usage", { p_client: id }),
    supabase.from("attachments").select("id, name").eq("entity", "client").eq("entity_id", id).is("deleted_at", null),
    getPeople(),
  ]);
  const kioskIds = (kiosks ?? []).map((k) => k.kiosk_id);
  const { data: issues } = kioskIds.length ? await supabase.from("issues").select("id, ref, title, status").in("kiosk_id", kioskIds).is("deleted_at", null).order("reported_at", { ascending: false }).limit(20) : { data: [] };
  const name = (pid: string | null) => people.find((p) => p.id === pid)?.name ?? "—";
  const T = (terms ?? []) as Term[];
  const active = (kind: string) => T.find((x) => x.kind === kind && x.status === "active");
  const pending = T.filter((x) => x.status === "pending");
  const clientKind = c.business === "iscreen" ? "client_price" : "venue_share";
  const fmtTerm = (x?: Term) => x ? `${x.value}${x.unit === "percent" ? "%" : ""} ${x.unit === "percent" ? (x.basis ? t(`bases.${x.basis}`) : "") : t(`units.${x.unit}`)}${x.payout_timing ? ` · ${x.payout_timing}` : ""}${x.term_text ? ` · ${x.term_text}` : ""}` : t("noTerm");
  const contract = (contracts ?? [])[0];
  const cd = countdown(contract?.end_date);
  // BD share: only the BD person who owns this client and Leaders see it; Leaders approve off-plan rates.
  const canDecide = viewer.level === "leader";
  const termForm = (kind: string) => (
    <details>
      <summary className={`${btn} inline-flex cursor-pointer list-none items-center border border-field bg-white`}>{t("setTerm")}</summary>
      <form action={setTerm} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input type="hidden" name="client_id" value={id} /><input type="hidden" name="kind" value={kind} />
        <label className={lab}>{t("value")}<input name="value" type="number" step="0.01" min="0" required className={field} /></label>
        <label className={lab}>{t("unit")}<select name="unit" defaultValue={kind === "client_price" ? "php_per_kiosk_month" : "percent"} className={field}>{["percent", "php_per_kiosk_month", "php_package"].map((u) => <option key={u} value={u}>{t(`units.${u}`)}</option>)}</select></label>
        <label className={lab}>{t("basis")}<select name="basis" defaultValue={kind === "bd_share" ? (c.business === "iscreen" ? "ad_contract_first_3_months" : "gross_operating_profit") : kind === "venue_share" ? "gross_rental_sales" : ""} className={field}>
          <option value="">—</option>{["gross_rental_sales", "gross_operating_profit", "ad_contract_first_3_months"].map((b) => <option key={b} value={b}>{t(`bases.${b}`)}</option>)}</select></label>
        <label className={lab}>{kind === "client_price" ? t("termText") : t("payout")}<input name={kind === "client_price" ? "term_text" : "payout_timing"} className={field} /></label>
        <label className={`${lab} sm:col-span-2`}>{t("reason")}<input name="reason" className={field} /></label>
        <button className={`${btn} bg-charge font-bold text-forest`}>{t("save")}</button>
      </form>
    </details>
  );
  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/clients" className="text-sm font-semibold text-leaf">← {t("title")}</Link>
        <h1 className="font-display text-[24px] font-bold min-[700px]:text-[28px]">{c.name}</h1>
        <div className="flex flex-wrap items-center gap-2"><BusinessPill business={c.business} /><Pill tone="info">{t(`status.${c.status}`)}</Pill><span className="text-sm text-muted">{t(`type.${c.type}`)} · {name(c.owner_id)}</span></div>
      </div>
      <Flash ok={sp.ok && t.has(`ok.${sp.ok}`) ? t(`ok.${sp.ok}`) : null} error={sp.error} />
      {zero && <p className="rounded-[14px] bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{t("zero")}</p>}
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
          <section className={card} aria-label={t("terms")}>
            <h2 className="text-base font-bold">{t("terms")}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[{ kind: clientKind, title: t(`kind.${clientKind}`) }, ...(canSeeBd ? [{ kind: "bd_share", title: t("bdShare") }] : [])].map((k) => (
                <div key={k.kind} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                  <span className="text-xs font-semibold text-muted">{k.title}</span>
                  <span className="font-display text-xl font-bold">{fmtTerm(active(k.kind))}</span>
                  {k.kind === "bd_share" && <span className="text-xs text-muted">{plan == null ? t("planNone") : t("plan", { rate: `${plan}%` })}</span>}
                  {canEdit && (k.kind !== "bd_share" || canSeeBd) && termForm(k.kind)}
                </div>
              ))}
            </div>
            {pending.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] p-3 text-sm">
                <b>{t("pending")}:</b> {t(`kind.${x.kind}`)} {fmtTerm(x)}{x.reason ? ` · ${x.reason}` : ""}
                <span className="text-xs text-muted">{t("approvedBy")}</span>
                {canDecide && x.set_by !== viewer.id && (
                  <form action={decideTerm} className="flex gap-2"><input type="hidden" name="client_id" value={id} /><input type="hidden" name="term_id" value={x.id} />
                    <button name="decision" value="approve" className={`${btn} bg-charge font-bold text-forest`}>{t("approve")}</button>
                    <button name="decision" value="reject" className={`${btn} border border-[#FCA5A5] bg-white text-danger`}>{t("reject")}</button></form>
                )}
              </div>
            ))}
          </section>
          <section className={card} aria-label={t("log")}>
            <h2 className="text-base font-bold">{t("log")}</h2>
            {(notes ?? []).length === 0 && <p className="text-sm text-muted">{t("noNotes")}</p>}
            <ul className="flex flex-col gap-3">
              {(notes ?? []).map((n) => {
                const editable = n.author_id === viewer.id && Date.now() - new Date(n.created_at).getTime() < 24 * 3600_000;
                return (
                  <li key={n.id} className="flex flex-col gap-1">
                    <span className="text-xs text-muted">{d(n.noted_on)} · <b className="text-forest">{name(n.author_id)}</b>{n.tag && <span className="ml-2 rounded-full bg-company-soft px-2 py-0.5">{t(`tags.${n.tag}`)}</span>}</span>
                    <p className="whitespace-pre-wrap text-sm">{n.text}</p>
                    {editable && (
                      <details><summary className="cursor-pointer text-xs font-semibold text-leaf">{t("editNote")}</summary>
                        <form action={editNote} className="mt-1 flex flex-col gap-2"><input type="hidden" name="client_id" value={id} /><input type="hidden" name="note_id" value={n.id} />
                          <textarea name="text" defaultValue={n.text} rows={2} className="rounded-[10px] border border-field px-3 py-2 text-sm" />
                          <select name="tag" defaultValue={n.tag ?? ""} className={field}><option value="">—</option>{["asked", "offered", "agreed", "changed"].map((x) => <option key={x} value={x}>{t(`tags.${x}`)}</option>)}</select>
                          <button className={`${btn} border border-field bg-white`}>{t("save")}</button></form></details>
                    )}
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <form action={addNote} className="flex flex-col gap-2 border-t border-line pt-3">
                <input type="hidden" name="client_id" value={id} />
                <textarea name="text" required rows={2} aria-label={t("addNote")} className="rounded-[10px] border border-field px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  <input type="date" name="noted_on" aria-label="Date" className={field} />
                  <select name="tag" aria-label={t("tag")} className={field}><option value="">{t("tag")}…</option>{["asked", "offered", "agreed", "changed"].map((x) => <option key={x} value={x}>{t(`tags.${x}`)}</option>)}</select>
                  <button className={`${btn} bg-charge font-bold text-forest`}>{t("addNote")}</button>
                </div>
                <p className="text-xs text-muted">{t("editHelp")}</p>
              </form>
            )}
          </section>
          <section className={card} aria-label={t("history")}>
            <h2 className="text-base font-bold">{t("history")}</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {T.map((x) => <li key={x.id}><b>{t(`kind.${x.kind}`)}</b>: {fmtTerm(x)} <span className="text-xs text-muted">· {x.status} · {t("from", { date: d(x.valid_from) })}{x.valid_to ? ` ${t("to", { date: d(x.valid_to) })}` : ""} · {name(x.set_by)}{x.reason ? ` · ${x.reason}` : ""}</span></li>)}
            </ul>
          </section>
        </div>
        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <section className={card} aria-label={t("contract")}>
            <h2 className="text-base font-bold">{t("contract")}</h2>
            {contract ? (
              <>
                {cd && <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLS[cd.tone]}`}>{cd.days >= 0 ? t("daysLeft", { n: cd.days }) : t("ended", { n: -cd.days })}</span>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted">{t("start")}</dt><dd>{d(contract.start_date)}</dd>
                  <dt className="text-muted">{t("end")}</dt><dd>{d(contract.end_date)}</dd>
                  <dt className="text-muted">{t("autoRenew")}</dt><dd>{contract.auto_renew ? "✓" : "—"}</dd>
                  <dt className="text-muted">{t("notice")}</dt><dd>{contract.notice_days ?? "—"}</dd>
                </dl>
                {contract.special_terms && <p className="text-sm"><b>{t("special")}:</b> {contract.special_terms}</p>}
              </>
            ) : <p className="text-sm text-muted">{t("noContract")}</p>}
            <div className="flex flex-col gap-1"><span className="text-xs font-semibold">{t("contractFile")}</span>
              {(files ?? []).map((a) => <form key={a.id} action={openAttachment}><input type="hidden" name="attachment_id" value={a.id} /><button className="text-sm font-semibold text-leaf hover:underline">{a.name}</button></form>)}
              {canEdit && <FileUpload entity="client" entityId={id} />}</div>
            {canEdit && (
              <details><summary className="cursor-pointer text-sm font-semibold text-leaf">{t("addContract")}</summary>
                <form action={saveContract} className="mt-2 flex flex-col gap-2"><input type="hidden" name="client_id" value={id} />
                  <label className={lab}>{t("start")}<input type="date" name="start_date" required className={field} /></label>
                  <label className={lab}>{t("end")}<input type="date" name="end_date" required className={field} /></label>
                  <label className={lab}>{t("notice")}<input type="number" name="notice_days" min="0" className={field} /></label>
                  <label className={lab}>{t("special")}<textarea name="special_terms" rows={2} className="rounded-[10px] border border-field px-3 py-2 text-sm" /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="auto_renew" className="h-4 w-4 accent-[#2F6B0A]" />{t("autoRenew")}</label>
                  <button className={`${btn} bg-charge font-bold text-forest`}>{t("addContract")}</button></form></details>
            )}
          </section>
          <section className={card}>
            <h2 className="text-base font-bold">{t("kiosks")} ({kioskIds.length})</h2>
            <p className="text-sm">{kioskIds.join(", ") || "—"}</p>
            <p className="text-sm">{c.contact_name ?? "—"}{c.contact_phone ? ` · ${c.contact_phone}` : ""}</p>
          </section>
          {(issues ?? []).length > 0 && (
            <section className={card}><h2 className="text-base font-bold">{t("issues")}</h2>
              <ul className="flex flex-col gap-1 text-sm">{(issues ?? []).map((i) => <li key={i.id}><Link href={`/issues/${i.id}`} className="text-leaf hover:underline">ISS-{i.ref} {i.title}</Link> <span className="text-xs text-muted">· {i.status}</span></li>)}</ul></section>
          )}
          {canEdit && (
            <details className={card}><summary className="cursor-pointer text-sm font-bold">{t("edit")}</summary>
              <ClientForm client={{ ...c, kiosks: kioskIds }} canChangeOwner={viewer.level === "leader" || !!bdHead} /></details>
          )}
        </aside>
      </div>
    </>
  );
}
