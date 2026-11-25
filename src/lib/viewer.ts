import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AccessLevel = "leader" | "manager" | "staff";
export type BusinessFilter = "all" | "icharge" | "iscreen";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  position: string | null;
  level: AccessLevel;
  hr: boolean;
  finance: boolean;
  active: boolean;
  departmentCode: string | null;
  departmentName: string | null;
  /** Codes of the departments this person heads (bd = BD head, cs = CS lead, ops = Ops head). */
  headOf: string[];
  defaultBusiness: BusinessFilter;
  language: "en" | "zh-Hans";
  /** Set when level, HR/Finance access or active status changes: older sessions must sign in again. */
  accessChangedAt: string;
};

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  position: string | null;
  access_level: AccessLevel;
  hr_access: boolean;
  finance_access: boolean;
  active: boolean;
  default_business: BusinessFilter;
  language: "en" | "zh-Hans";
  access_changed_at: string;
  department: { code: string; name: string } | null;
};

/** The signed-in person and their access. null = signed in but no employee record yet. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, name, email, position, access_level, hr_access, finance_access, active, default_business, language, access_changed_at, department:departments!profiles_department_id_fkey(code, name)",
    )
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();
  if (!data) return null;

  const { data: heads } = await supabase.from("departments").select("code").eq("head_id", user.id);

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    position: data.position,
    level: data.access_level,
    hr: data.hr_access,
    finance: data.finance_access,
    active: data.active,
    departmentCode: data.department?.code ?? null,
    departmentName: data.department?.name ?? null,
    headOf: (heads ?? []).map((h) => h.code as string),
    defaultBusiness: data.default_business,
    language: data.language,
    accessChangedAt: data.access_changed_at,
  };
});
