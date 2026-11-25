import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import {
  approveRequest, createInvite, deactivate, decideChange, decideInvite, declineRequest, proposeChange,
  proposeRequest, reactivate, sendBackRequest,
} from "./actions";
import { AccessFields, ReasonForm, btnDanger, btnPlain, btnPrimary, fieldCls } from "./AccessFields";

export const metadata = { title: "Access" };

type Level = "leader" | "manager" | "staff";
type Person = { id: string; name: string; email: string; position: string | null; access_level: Level; hr_access: boolean; finance_access: boolean; active: boolean; department_id: string | null };
type Req = {
  id: string; user_id: string; email: string; full_name: string; position: string; mobile: string; department_id: string | null; supervisor_id: string | null;
  status: "pending" | "proposed" | "approved" | "declined" | "sent_back"; proposed_level: Level | null; proposed_hr: boolean | null; proposed_finance: boolean | null;
  proposed_department_id: string | null; proposed_by: string | null; approved_by: string | null; decline_reason: string | null; sent_back_reason: string | null; created_at: string;
};
type Invite = {
  id: string; email: string; full_name: string; position: string | null; department_id: string | null; access_level: Level; hr_access: boolean; finance_access: boolean;
  status: "proposed" | "approved" | "declined" | "used" | "cancelled"; invited_by: string; created_at: string;
};
type Change = {
  id: string; profile_id: string; old_level: Level; old_hr: boolean; old_finance: boolean; new_level: Level; new_hr: boolean; new_finance: boolean;
  reason: string; status: "proposed" | "approved" | "declined"; proposed_by: string; created_at: string;
};

const TABS = ["requests", "invites", "changes", "people"] as const;
type Tab = (typeof TABS)[number];

const card = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4";
const pill = (tone: "new" | "wait" | "ok" | "bad" | "plain") =>
  `inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
    { new: "bg-[#E0E7FF] text-[#3730A3]", wait: "bg-[#FEF3C7] text-[#92400E]", ok: "bg-[#DCFCE7] text-[#166534]", bad: "bg-danger-soft text-danger", plain: "bg-company-soft text-ink-2" }[tone]
  }`;

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const viewer = await getViewer();
  if (!viewer || !(viewer.level === "leader" || viewer.hr)) notFound();
  const isLeader = viewer.level === "leader";
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "requests";
  const t = await getTranslations();
  const format = await getFormatter();
  const when = (d: string) => format.dateTime(new Date(d), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  const supabase = await createClient();
  const [{ data: people }, { data: depts }, { data: reqs }, { data: invites }, { data: changes }] = await Promise.all([
    supabase.from("profiles").select("id, name, email, position, access_level, hr_access, finance_access, active, department_id").order("name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("access_requests").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("invites").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("access_changes").select("*").order("created_at", { ascending: false }).limit(60),
  ]);
  const P = (people ?? []) as Person[];
  const D = (depts ?? []) as { id: string; name: string }[];
  const R = (reqs ?? []) as Req[];
  const I = (invites ?? []) as Invite[];
  const C = (changes ?? []) as Change[];
  const name = (id: string | null) => P.find((p) => p.id === id)?.name ?? "—";
  const dept = (id: string | null) => D.find((d) => d.id === id)?.name ?? "—";
  const lvl = (l: Level | null) => (l ? t(`levels.${l}`) : "—");
  const extras = (hr: boolean | null, fin: boolean | null) =>
    [hr ? t("access.hrAccess") : null, fin ? t("access.financeAccess") : null].filter(Boolean).map((x) => ` + ${x}`).join("");

  const openReqs = R.filter((r) => ["pending", "proposed", "sent_back"].includes(r.status));
  const openInv = I.filter((i) => i.status === "proposed" || i.status === "approved");
  const openChg = C.filter((c) => c.status === "proposed");
  const counts: Record<Tab, number> = { requests: openReqs.length, invites: openInv.length, changes: openChg.length, people: P.length };
  const tabLabel: Record<Tab, string> = { requests: t("access.tabRequests"), invites: t("access.tabInvites"), changes: t("access.tabChanges"), people: t("access.tabPeople") };

  const reqStatus = (r: Req) =>
    r.status === "pending" ? <span className={pill("new")}>{t("access.statusPending")}</span>
    : r.status === "proposed" ? <span className={pill("wait")}>{t("access.statusProposed")}</span>
    : r.status === "sent_back" ? <span className={pill("wait")}>{t("access.statusSentBack")}</span>
    : r.status === "approved" ? <span className={pill("ok")}>{t("access.statusApproved")}</span>
    : <span className={pill("bad")}>{t("access.statusDeclined")}</span>;

  return (
    <>
      <h1 className="font-display text-[26px] font-bold min-[700px]:text-[30px]">{t("access.title")}</h1>

      {sp.ok && <p role="status" className="rounded-[10px] border border-charge-line bg-charge-soft px-3 py-2.5 text-sm font-semibold">{t.has(`access.${sp.ok}`) ? t(`access.${sp.ok}`) : t("access.ok")}</p>}
      {sp.error && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger">{sp.error}</p>}

      <nav aria-label={t("access.title")} className="flex flex-wrap gap-2">
        {TABS.map((k) => (
          <Link key={k} href={`/settings/access?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold ${tab === k ? "bg-forest text-white" : "border border-[#D5DCCB] bg-white text-forest"}`}>
            {tabLabel[k]}
            <span className={`rounded-full px-1.5 text-[11px] ${tab === k ? "bg-charge text-forest" : "bg-company-soft"}`}>{counts[k]}</span>
          </Link>
        ))}
      </nav>

      {/* ---------------- Requests ---------------- */}
      {tab === "requests" && (
        <div className="flex flex-col gap-3">
          {openReqs.length === 0 && <p className="text-sm text-muted">{t("access.nothingWaiting")}</p>}
          {openReqs.map((r) => {
            const own = r.user_id === viewer.id;
            const canPropose = !own && (r.status === "pending" || r.status === "sent_back");
            const canApprove = !own && isLeader;
            return (
              <section key={r.id} className={card} aria-label={r.full_name}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="text-base font-bold">{r.full_name}</h2>
                    <span className="break-all text-sm text-muted">{r.email}</span>
                  </div>
                  {reqStatus(r)}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">{t("access.position")}</dt><dd>{r.position}</dd>
                  <dt className="text-muted">{t("access.department")}</dt><dd>{dept(r.department_id)}</dd>
                  <dt className="text-muted">{t("access.supervisor")}</dt><dd>{name(r.supervisor_id)}</dd>
                  <dt className="text-muted">{t("access.mobile")}</dt><dd>{r.mobile}</dd>
                  <dt className="text-muted">{t("access.sentLabel")}</dt><dd>{when(r.created_at)}</dd>
                </dl>
                {r.status === "proposed" && (
                  <p className="text-sm font-semibold">{t("access.proposedBy", { name: name(r.proposed_by), level: lvl(r.proposed_level), extras: extras(r.proposed_hr, r.proposed_finance) })}</p>
                )}
                {r.status === "sent_back" && r.sent_back_reason && <p className="text-sm text-[#92400E]">{t("access.sentBackReason", { reason: r.sent_back_reason })}</p>}

                {(canPropose || canApprove) && (
                  <form className="flex flex-col gap-3 border-t border-line pt-3">
                    <input type="hidden" name="id" value={r.id} />
                    <AccessFields level={r.proposed_level ?? "staff"} hr={!!r.proposed_hr} finance={!!r.proposed_finance} departments={D} departmentId={r.proposed_department_id ?? r.department_id} />
                    <div className="flex flex-wrap gap-2">
                      {canApprove && <button formAction={approveRequest} className={btnPrimary}>{t("access.approve")}</button>}
                      {canPropose && !isLeader && <button formAction={proposeRequest} className={btnPrimary}>{t("access.propose")}</button>}
                    </div>
                  </form>
                )}
                {!own && (
                  <div className="flex flex-wrap gap-2">
                    {isLeader && r.status === "proposed" && (
                      <ReasonForm action={sendBackRequest} hidden={{ id: r.id }} button={t("access.sendBack")} summary={t("access.sendBack")} />
                    )}
                    <ReasonForm action={declineRequest} hidden={{ id: r.id }} button={t("access.decline")} summary={t("access.decline")} cls={btnDanger} />
                  </div>
                )}
              </section>
            );
          })}
          <Recent title={t("access.recent")} rows={R.filter((r) => !openReqs.includes(r)).slice(0, 10).map((r) => ({ id: r.id, text: `${r.full_name} · ${r.email}`, status: reqStatus(r), date: when(r.created_at), note: r.decline_reason }))} />
        </div>
      )}

      {/* ---------------- Invites ---------------- */}
      {tab === "invites" && (
        <div className="flex flex-col gap-3">
          <section className={card} aria-label={t("access.inviteTitle")}>
            <h2 className="text-base font-bold">{t("access.inviteTitle")}</h2>
            <p className="text-sm text-muted">{t("access.inviteHelp")} {isLeader && t("access.inviteLeaderHelp")}</p>
            <form action={createInvite} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("access.email")}<input name="email" type="email" required placeholder="name@icharge.com.ph" className={fieldCls} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("access.fullName")}<input name="full_name" required minLength={2} className={fieldCls} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("access.position")}<input name="position" className={fieldCls} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">{t("access.supervisor")}
                  <select name="supervisor_id" defaultValue="" className={fieldCls}>
                    <option value="">—</option>
                    {P.filter((p) => p.active && p.access_level !== "staff").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <AccessFields departments={D} />
              <div><button type="submit" className={btnPrimary}>{isLeader ? t("access.sendInvite") : t("access.proposeInvite")}</button></div>
            </form>
          </section>
          {openInv.map((i) => (
            <section key={i.id} className={card} aria-label={i.full_name}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 className="text-base font-bold">{i.full_name}</h2>
                  <span className="break-all text-sm text-muted">{i.email}</span>
                </div>
                <span className={pill(i.status === "proposed" ? "wait" : "ok")}>{i.status === "proposed" ? t("access.statusProposed") : t("access.statusWaitingSignIn")}</span>
              </div>
              <p className="text-sm">
                {lvl(i.access_level)}{extras(i.hr_access, i.finance_access)} · {dept(i.department_id)}{i.position ? ` · ${i.position}` : ""}
                <br />
                <span className="text-muted">{t("access.invitedBy", { name: name(i.invited_by) })} · {when(i.created_at)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {isLeader && i.status === "proposed" && i.invited_by !== viewer.id && (
                  <form action={decideInvite}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="decision" value="approve" />
                    <button type="submit" className={btnPrimary}>{t("access.approve")}</button></form>
                )}
                <ReasonForm action={decideInvite} hidden={{ id: i.id, decision: "decline" }} button={isLeader && i.status === "proposed" ? t("access.decline") : t("access.cancel")}
                  summary={isLeader && i.status === "proposed" ? t("access.decline") : t("access.cancel")} cls={btnDanger} />
              </div>
            </section>
          ))}
          <Recent title={t("access.recent")} rows={I.filter((i) => !openInv.includes(i)).slice(0, 10).map((i) => ({
            id: i.id, text: `${i.full_name} · ${i.email}`, date: when(i.created_at),
            status: <span className={pill(i.status === "used" ? "ok" : "plain")}>{t(`access.status${i.status[0].toUpperCase()}${i.status.slice(1)}`)}</span>,
          }))} />
        </div>
      )}

      {/* ---------------- Access changes ---------------- */}
      {tab === "changes" && (
        <div className="flex flex-col gap-3">
          {openChg.length === 0 && <p className="text-sm text-muted">{t("access.nothingWaiting")}</p>}
          {openChg.map((c) => (
            <section key={c.id} className={card} aria-label={name(c.profile_id)}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-base font-bold">{name(c.profile_id)}</h2>
                <span className={pill("wait")}>{t("access.statusProposed")}</span>
              </div>
              <p className="text-sm">{t("access.changeFromTo", { from: lvl(c.old_level) + extras(c.old_hr, c.old_finance), to: lvl(c.new_level) + extras(c.new_hr, c.new_finance) })}</p>
              <p className="text-sm text-muted">{t("access.reason")}: {c.reason} · {t("access.byName", { name: name(c.proposed_by) })} · {when(c.created_at)}</p>
              <div className="flex flex-wrap gap-2">
                {isLeader && c.proposed_by !== viewer.id && c.profile_id !== viewer.id && (
                  <form action={decideChange}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="decision" value="approve" />
                    <button type="submit" className={btnPrimary}>{t("access.approve")}</button></form>
                )}
                {(isLeader || c.proposed_by === viewer.id) && (
                  <ReasonForm action={decideChange} hidden={{ id: c.id, decision: "decline" }} button={isLeader ? t("access.decline") : t("access.withdraw")}
                    summary={isLeader ? t("access.decline") : t("access.withdraw")} cls={btnDanger} />
                )}
              </div>
            </section>
          ))}
          <Recent title={t("access.recent")} rows={C.filter((c) => c.status !== "proposed").slice(0, 10).map((c) => ({
            id: c.id, text: `${name(c.profile_id)}: ${lvl(c.old_level)}${extras(c.old_hr, c.old_finance)} → ${lvl(c.new_level)}${extras(c.new_hr, c.new_finance)}`, date: when(c.created_at),
            status: <span className={pill(c.status === "approved" ? "ok" : "bad")}>{c.status === "approved" ? t("access.statusApproved") : t("access.statusDeclined")}</span>, note: c.reason,
          }))} />
        </div>
      )}

      {/* ---------------- People ---------------- */}
      {tab === "people" && (
        <div className="flex flex-col gap-3">
          {P.map((p) => {
            const self = p.id === viewer.id;
            const pending = openChg.some((c) => c.profile_id === p.id);
            const canDeactivate = !self && p.active && (isLeader || p.access_level !== "leader");
            return (
              <section key={p.id} className={card} aria-label={p.name}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="text-base font-bold">{p.name}{self && <span className="ml-2 text-xs font-semibold text-muted">({t("access.you")})</span>}</h2>
                    <span className="break-all text-sm text-muted">{p.email}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={pill(p.access_level === "staff" ? "plain" : "new")}>{lvl(p.access_level)}</span>
                    {p.hr_access && <span className={pill("plain")}>{t("access.hrAccess")}</span>}
                    {p.finance_access && <span className={pill("plain")}>{t("access.financeAccess")}</span>}
                    {!p.active && <span className={pill("bad")}>{t("access.inactive")}</span>}
                    {pending && <span className={pill("wait")}>{t("access.statusProposed")}</span>}
                  </div>
                </div>
                <p className="text-sm text-muted">{dept(p.department_id)}{p.position ? ` · ${p.position}` : ""}</p>
                {!self && (
                  <div className="flex flex-wrap items-start gap-2">
                    {p.active && !pending && (
                      <details>
                        <summary className={`${btnPlain} inline-flex cursor-pointer list-none items-center`}>{t("access.changeAccess")}</summary>
                        <form action={proposeChange} className="mt-2 flex flex-col gap-3">
                          <input type="hidden" name="profile_id" value={p.id} />
                          <AccessFields level={p.access_level} hr={p.hr_access} finance={p.finance_access} />
                          <label className="flex flex-col gap-1 text-xs font-semibold">{t("access.reason")}
                            <input name="reason" required minLength={3} placeholder={t("access.reasonPlaceholder")} className={fieldCls} /></label>
                          <div><button type="submit" className={btnPrimary}>{isLeader ? t("access.applyNow") : t("access.proposeChange")}</button></div>
                        </form>
                      </details>
                    )}
                    {canDeactivate && <ReasonForm action={deactivate} hidden={{ profile_id: p.id }} button={t("access.deactivate")} summary={t("access.deactivate")} cls={btnDanger} />}
                    {!p.active && isLeader && <ReasonForm action={reactivate} hidden={{ profile_id: p.id }} button={t("access.reactivate")} summary={t("access.reactivate")} />}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Recent({ title, rows }: { title: string; rows: { id: string; text: string; status: React.ReactNode; date: string; note?: string | null }[] }) {
  if (!rows.length) return null;
  return (
    <details className="rounded-[14px] border border-line bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold">{title} ({rows.length})</summary>
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 break-all">{r.text}{r.note ? <span className="text-muted"> · {r.note}</span> : null}</span>
            <span className="flex items-center gap-2"><span className="text-xs text-muted">{r.date}</span>{r.status}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
