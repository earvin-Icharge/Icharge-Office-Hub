import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { getMyLatestRequest, isOpen } from "@/lib/requests";
import { submitRequest } from "./actions";

export const metadata = { title: "Welcome" };

type Options = { departments: { id: string; name: string }[]; supervisors: { id: string; name: string; position: string | null }[] };

const field = "h-11 rounded-[10px] border border-field bg-white px-3 text-[15px] font-normal min-w-0";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

/** Access request form for a new employee (spec 3.5 steps 1–3). */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (await getViewer()) redirect("/today");
  if (isOpen(await getMyLatestRequest())) redirect("/pending");

  const t = await getTranslations("welcome");
  const tp = await getTranslations("privacy");
  const { error } = await searchParams;
  const opts = ((await supabase.rpc("welcome_options")).data ?? { departments: [], supervisors: [] }) as Options;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-paper px-4 py-10">
      <div className="rounded-full bg-forest px-5 py-3">
        <Logo size={32} wordmarkClass="text-xl" />
      </div>
      <form action={submitRequest} className="flex w-full max-w-[480px] flex-col gap-3 rounded-[20px] border border-line bg-white p-6 sm:p-8">
        <div>
          <h1 className="mb-1.5 font-display text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm leading-normal text-muted">{t("intro")}</p>
          <p className="mt-1 text-xs text-muted">{t("signedInAs", { email: user.email ?? "" })}</p>
        </div>
        {error && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</p>}
        <label className={label}>{t("fullName")}<input name="full_name" required minLength={2} maxLength={120} autoComplete="name" className={field} /></label>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className={label}>{t("department")}
            <select name="department_id" required defaultValue="" className={field}>
              <option value="" disabled>{t("choose")}</option>
              {opts.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className={label}>{t("position")}<input name="position" required minLength={2} maxLength={120} autoComplete="organization-title" className={field} /></label>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className={label}>{t("supervisor")}
            <select name="supervisor_id" required defaultValue="" className={field}>
              <option value="" disabled>{t("choose")}</option>
              {opts.supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}{s.position ? ` (${s.position})` : ""}</option>)}
            </select>
          </label>
          <label className={label}>{t("mobile")}<input name="mobile" type="tel" required minLength={7} maxLength={30} autoComplete="tel" placeholder="0917 123 4567" className={field} /></label>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-0.5 h-4 w-4 accent-[#2F6B0A]" />
          <span>{tp("consentWelcome")} — <a href="/privacy?view=1" target="_blank" className="font-semibold text-leaf underline">{tp("title")}</a></span></label>
        <button type="submit" className="mt-1 h-12 rounded-xl bg-charge text-base font-bold text-forest">{t("submit")}</button>
      </form>
    </div>
  );
}
