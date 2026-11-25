import type { Viewer } from "@/lib/viewer";

export type NavIcon =
  | "myday" | "tasks" | "calendar" | "projects" | "meetings" | "issues" | "clients" | "cs" | "team"
  | "employees" | "attendance" | "leave" | "discipline" | "performance"
  | "dashboard" | "reports" | "access" | "updates" | "settings" | "audit" | "trash";

export type NavItem = {
  key: string;
  href: string;
  icon: NavIcon;
  section: "work" | "hr" | "admin";
  /** Build step in SPEC.md section 14 that delivers this page. */
  step: string;
  /** Who sees this menu item (spec 3.3). Pages a person can't use are hidden. */
  canSee: (v: Viewer) => boolean;
};

const leader = (v: Viewer) => v.level === "leader";
const manager = (v: Viewer) => v.level === "manager";
const heads = (v: Viewer, code: string) => v.headOf.includes(code);
const everyone = () => true;

export const NAV: NavItem[] = [
  { key: "myday", href: "/today", icon: "myday", section: "work", step: "1a", canSee: everyone },
  { key: "tasks", href: "/tasks", icon: "tasks", section: "work", step: "2", canSee: everyone },
  { key: "calendar", href: "/calendar", icon: "calendar", section: "work", step: "4", canSee: everyone },
  { key: "projects", href: "/projects", icon: "projects", section: "work", step: "4", canSee: everyone },
  { key: "meetings", href: "/meetings", icon: "meetings", section: "work", step: "5", canSee: everyone },
  { key: "issues", href: "/issues", icon: "issues", section: "work", step: "6", canSee: everyone },
  {
    key: "clients", href: "/clients", icon: "clients", section: "work", step: "6",
    canSee: (v) => leader(v) || v.finance || heads(v, "bd") || (v.level === "staff" && v.departmentCode === "bd"),
  },
  {
    key: "cs", href: "/cs", icon: "cs", section: "work", step: "6",
    canSee: (v) => leader(v) || manager(v) || v.finance || v.departmentCode === "cs" || v.departmentCode === "ops",
  },
  { key: "team", href: "/team", icon: "team", section: "work", step: "11", canSee: (v) => leader(v) || manager(v) },

  { key: "employees", href: "/hr/employees", icon: "employees", section: "hr", step: "7", canSee: everyone },
  { key: "attendance", href: "/hr/attendance", icon: "attendance", section: "hr", step: "8", canSee: everyone },
  { key: "leave", href: "/hr/leave", icon: "leave", section: "hr", step: "9", canSee: everyone },
  { key: "discipline", href: "/hr/discipline", icon: "discipline", section: "hr", step: "10", canSee: everyone }, // own cases for everyone (Staff basics)
  { key: "performance", href: "/performance", icon: "performance", section: "hr", step: "11", canSee: everyone }, // own snapshot for everyone

  { key: "dashboard", href: "/dashboard", icon: "dashboard", section: "admin", step: "11", canSee: (v) => leader(v) || manager(v) || v.hr || v.finance },
  { key: "reports", href: "/reports", icon: "reports", section: "admin", step: "11", canSee: everyone },
  { key: "access", href: "/settings/access", icon: "access", section: "admin", step: "1b", canSee: (v) => leader(v) || v.hr },
  { key: "updates", href: "/settings/updates", icon: "updates", section: "admin", step: "1c", canSee: leader },
  {
    key: "settings", href: "/settings", icon: "settings", section: "admin", step: "later",
    canSee: (v) => leader(v) || v.hr || heads(v, "cs") || heads(v, "ops"),
  },
  { key: "audit", href: "/audit", icon: "audit", section: "admin", step: "12", canSee: (v) => leader(v) || v.hr },
  { key: "trash", href: "/trash", icon: "trash", section: "admin", step: "12", canSee: leader },
];

export function visibleNav(v: Viewer) {
  return NAV.filter((item) => item.canSee(v));
}

export function findNav(pathname: string) {
  return NAV.find((item) => item.href === pathname);
}

/** Phone bottom menu (spec 2): My day, Tasks, [Time in], Leave, Issues. */
export const PHONE_NAV = ["myday", "tasks", "timein", "leave", "issues"] as const;
