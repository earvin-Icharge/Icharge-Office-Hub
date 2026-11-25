import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";

/** In-app bell with the unread count (spec 7). */
export function Bell({ count, label, className = "" }: { count: number; label: string; className?: string }) {
  return (
    <Link href="/notifications" aria-label={`${label}${count ? ` (${count})` : ""}`} className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full ${className}`}>
      <BellIcon aria-hidden size={22} />
      {count > 0 && (
        <span className="absolute top-1 right-0.5 min-w-[18px] rounded-full bg-charge px-1 text-center text-[11px] font-bold leading-[18px] text-forest">{count > 99 ? "99+" : count}</span>
      )}
    </Link>
  );
}
