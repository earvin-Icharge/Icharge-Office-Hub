/**
 * Creates the departments and the five test accounts (SPEC.md 14.1).
 * Runs only on the builder's computer:  npm run seed
 * Safe to run again: it updates what is already there.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const DEPARTMENTS = [
  { code: "bd", name: "BD" },
  { code: "marketing", name: "Marketing" },
  { code: "ops", name: "Operations" },
  { code: "cs", name: "Customer service" },
  { code: "finance", name: "Finance" },
  { code: "tech", name: "Tech" },
  { code: "hr", name: "Admin / HR" },
];

type Account = {
  email: string;
  name: string;
  employee_id: string;
  position: string;
  dept: string | null;
  access_level: "leader" | "manager" | "staff";
  hr_access?: boolean;
  finance_access?: boolean;
  supervisor?: string;
  heads?: string;
};

const ACCOUNTS: Account[] = [
  { email: "earvin@icharge.com.ph", name: "Earvin", employee_id: "IC-0001", position: "Special Assistant to the CEO", dept: null, access_level: "leader" },
  { email: "earvin+manager@icharge.com.ph", name: "Test Manager", employee_id: "TEST-MGR", position: "Operations head", dept: "ops", access_level: "manager", heads: "ops" },
  { email: "earvin+hr@icharge.com.ph", name: "Test HR", employee_id: "TEST-HR", position: "HR officer", dept: "hr", access_level: "staff", hr_access: true },
  { email: "earvin+finance@icharge.com.ph", name: "Test Finance", employee_id: "TEST-FIN", position: "Payroll officer", dept: "finance", access_level: "staff", finance_access: true },
  { email: "earvin+staff@icharge.com.ph", name: "Test Staff", employee_id: "TEST-STF", position: "Operations associate", dept: "ops", access_level: "staff", supervisor: "earvin+manager@icharge.com.ph" },
];

async function findUserId(email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const { error: deptErr } = await db.from("departments").upsert(DEPARTMENTS, { onConflict: "code" });
  if (deptErr) throw deptErr;
  const { data: depts } = await db.from("departments").select("id, code");
  const deptId = (code: string | null) => (code ? depts!.find((d) => d.code === code)!.id : null);

  const ids: Record<string, string> = {};
  for (const a of ACCOUNTS) {
    let id = await findUserId(a.email);
    if (!id) {
      const { data, error } = await db.auth.admin.createUser({ email: a.email, email_confirm: true });
      if (error) throw new Error(`${a.email}: ${error.message}`);
      id = data.user.id;
    }
    ids[a.email] = id;
  }

  for (const a of ACCOUNTS) {
    const { error } = await db.from("profiles").upsert(
      {
        id: ids[a.email],
        email: a.email,
        name: a.name,
        employee_id: a.employee_id,
        position: a.position,
        department_id: deptId(a.dept),
        access_level: a.access_level,
        hr_access: !!a.hr_access,
        finance_access: !!a.finance_access,
        supervisor_id: a.supervisor ? ids[a.supervisor] : null,
        active: true,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`${a.email}: ${error.message}`);
    if (a.heads) {
      const { error: hErr } = await db.from("departments").update({ head_id: ids[a.email] }).eq("code", a.heads);
      if (hErr) throw hErr;
    }
    console.log(`✓ ${a.email} (${a.access_level}${a.hr_access ? " + HR" : ""}${a.finance_access ? " + Finance" : ""})`);
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
