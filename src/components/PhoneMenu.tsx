"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import { SideNav, type SideNavItem } from "./SideNav";

type Labels = { open: string; close: string; title: string; profile: string; signOut: string };

/** Phone menu (screens under 700 px): every page the person may open, their profile and sign out. */
export function PhoneMenu({ items, sections, labels, name }: {
  items: SideNavItem[];
  sections: Record<"work" | "hr" | "admin", string>;
  labels: Labels;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = before; window.removeEventListener("keydown", onKey); };
  }, [open]);

  const waiting = items.some((i) => (i.badge ?? 0) > 0);
  return (
    <>
      <button type="button" aria-label={labels.open} aria-expanded={open} onClick={() => setOpen(true)}
        className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full text-mist">
        <Menu aria-hidden size={24} />
        {waiting && <span className="absolute top-2 right-1.5 h-2.5 w-2.5 rounded-full bg-charge" />}
      </button>
      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label={labels.title}
          onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-forest px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] text-white min-[700px]:hidden">
          <div className="flex items-center justify-between gap-2 pb-2">
            <Link href="/profile" className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-forest-2 text-charge"><UserRound aria-hidden size={22} /></span>
              <span className="min-w-0">
                <b className="block truncate text-base text-white">{name}</b>
                <span className="text-xs text-sage">{labels.profile}</span>
              </span>
            </Link>
            <button type="button" aria-label={labels.close} onClick={() => setOpen(false)}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-mist">
              <X aria-hidden size={24} />
            </button>
          </div>
          <nav aria-label={labels.title} className="flex flex-col gap-1">
            <SideNav items={items} sections={sections} big />
          </nav>
          <form action="/auth/signout" method="post" className="mt-6 border-t border-forest-line pt-4">
            <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base text-mist">
              <LogOut aria-hidden size={20} className="flex-none" />
              {labels.signOut}
            </button>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
