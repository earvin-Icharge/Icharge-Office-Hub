import { getTranslations } from "next-intl/server";
import { signInWithMicrosoft } from "./actions";

/** Is "Sign in with Microsoft" switched on in Supabase? (Public settings; checked at most every 5 minutes.) */
export async function microsoftEnabled() {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 300 },
    });
    const s = (await r.json()) as { external?: { azure?: boolean } };
    return !!s.external?.azure;
  } catch {
    return false;
  }
}

export async function MicrosoftButton() {
  const t = await getTranslations("login");
  return (
    <form action={signInWithMicrosoft} className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t("or")}<span className="h-px flex-1 bg-line" /></div>
      <button className="flex h-12 items-center justify-center gap-3 rounded-xl border border-field bg-white text-[15px] font-semibold text-forest hover:bg-paper">
        <svg aria-hidden width="20" height="20" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" /><rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" /></svg>
        {t("microsoft")}
      </button>
    </form>
  );
}
