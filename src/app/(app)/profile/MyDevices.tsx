"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeMyDevice } from "@/app/actions/quick";

export type DeviceItem = { id: string; name: string; lastSeen: string; version: string | null; method: "passkey" | "pin" | "both" | null; isThis: boolean };

/** Each person sees and removes their own devices (spec 3.5). */
export function MyDevices({ devices }: { devices: DeviceItem[] }) {
  const t = useTranslations("devices");
  const router = useRouter();
  const [pending, start] = useTransition();
  const method = (m: DeviceItem["method"]) => (m === "passkey" ? t("methodPasskey") : m === "pin" ? t("methodPin") : m === "both" ? t("methodBoth") : t("methodNone"));
  if (!devices.length) return <p className="text-sm text-muted">{t("none")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {devices.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <span className="flex min-w-0 flex-col">
            <b className="text-sm">{d.name}{d.isThis && <span className="ml-2 rounded-full bg-charge-soft px-2 py-0.5 text-[11px] text-leaf">{t("thisDevice")}</span>}</b>
            <span className="text-xs text-muted">{t("lastSeen", { date: d.lastSeen })}{d.version ? ` · ${t("version", { v: d.version })}` : ""} · {method(d.method)}</span>
          </span>
          <button type="button" disabled={pending}
            onClick={() => start(async () => { const r = await removeMyDevice(d.id); if (r.ok && r.signedOut) window.location.assign("/login"); else router.refresh(); })}
            className="h-9 rounded-[10px] border border-[#FCA5A5] bg-white px-3 text-sm font-semibold text-danger">{t("remove")}</button>
        </li>
      ))}
    </ul>
  );
}
