import {
  Archive, BriefcaseBusiness, CalendarRange, Building2, CalendarDays, ChartColumn, Columns3, FileText, Headset,
  IdCard, LayoutDashboard, Lock, MapPin, RefreshCw, ScrollText, Settings, SquareCheck, Sun,
  TriangleAlert, Users, FileSpreadsheet, type LucideIcon,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/nav";

const ICONS: Record<NavIconName, LucideIcon> = {
  myday: Sun,
  tasks: SquareCheck,
  calendar: CalendarRange,
  projects: Columns3,
  meetings: CalendarDays,
  issues: TriangleAlert,
  clients: Building2,
  cs: Headset,
  team: Users,
  employees: IdCard,
  attendance: MapPin,
  leave: BriefcaseBusiness,
  discipline: FileText,
  performance: ChartColumn,
  dashboard: LayoutDashboard,
  reports: FileSpreadsheet,
  access: Lock,
  updates: RefreshCw,
  settings: Settings,
  audit: ScrollText,
  trash: Archive,
};

export function NavIcon({ name, size = 18 }: { name: NavIconName; size?: number }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden size={size} strokeWidth={2} className="flex-none" />;
}
