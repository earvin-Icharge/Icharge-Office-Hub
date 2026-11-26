"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { nativeBioChallenge, nativeBioUnlock, passkeyAuthOptions, passkeyAuthVerify, unlockWithPin } from "@/app/actions/quick";
import { nativeBioSign } from "@/lib/native";

export function UnlockForm({ name, email, hasPasskey, hasPin, phoneKey = false }: { name: string; email: string; hasPasskey: boolean; hasPin: boolean; phoneKey?: boolean }) {
  const t = useTranslations("quick");
  const [mode, setMode] = useState<"finger" | "pin">(hasPasskey ? "finger" : "pin");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const done = () => window.location.assign("/today");

  const err = (code: string, tries?: number) => (code === "wrongPin" ? t("errors.wrongPin", { tries: tries ?? 0 }) : t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));

  function finger() {
    setError(undefined);
    if (phoneKey) {
      // Android app: the phone's own fingerprint prompt signs a challenge from the server.
      start(async () => {
        const c = await nativeBioChallenge();
        if (!c.ok) return setError(err(c.error));
        const r = await nativeBioSign(c.challenge);
        if (!r.signature) {
          return setError(r.error === "cancelled" ? t("errors.cancelled") : r.error === "lockout" ? t("errors.lockout") : r.error === "changed" ? t("errors.changed") : t("errors.phoneFailed"));
        }
        const v = await nativeBioUnlock(r.signature);
        if (v.ok) done(); else setError(err(v.error));
      });
      return;
    }
    start(async () => {
      const o = await passkeyAuthOptions();
      if (!o.ok) return setError(err(o.error));
      try {
        const resp = await startAuthentication({ optionsJSON: o.options });
        const v = await passkeyAuthVerify(resp);
        if (v.ok) done(); else setError(err(v.error));
      } catch (e) {
        setError((e as { name?: string })?.name === "NotAllowedError" ? t("errors.cancelled") : t("errors.notHere"));
      }
    });
  }

  function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await unlockWithPin(pin);
      if (r.ok) return done();
      if (r.error === "pinLocked") { window.location.assign("/login?e=device"); return; }
      setPin("");
      setError(err(r.error, r.triesLeft));
    });
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold">{t("unlockTitle", { name })}</h1>
      <p className="text-sm text-muted">{email}</p>
      <p className="text-sm text-ink-2">{t("unlockHelp")}</p>
      {error && <p role="alert" className="w-full rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</p>}

      {mode === "finger" ? (
        <>
          <button type="button" onClick={finger} disabled={pending} aria-label={t("touchToUnlock")}
            className="flex h-28 w-28 items-center justify-center rounded-full bg-forest text-charge disabled:opacity-60">
            <Fingerprint aria-hidden size={60} strokeWidth={1.6} />
          </button>
          <b className="text-[15px]">{t("touchToUnlock")}</b>
          {hasPin && <button type="button" onClick={() => setMode("pin")} className="text-sm font-semibold text-leaf">{t("usePin")}</button>}
        </>
      ) : (
        <form onSubmit={submitPin} className="flex w-full flex-col gap-3">
          <label htmlFor="oh-pin" className="text-left text-[13px] font-semibold">{t("pin")}</label>
          <input id="oh-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-14 rounded-xl border border-field text-center text-[28px] tracking-[12px]" placeholder="••••••" />
          <button type="submit" disabled={pending || pin.length !== 6} className="h-12 rounded-xl bg-charge text-base font-bold text-forest disabled:opacity-60">{t("unlock")}</button>
          {hasPasskey && <button type="button" onClick={() => setMode("finger")} className="text-sm font-semibold text-leaf">{t("useFingerprint")}</button>}
        </form>
      )}

      <form action="/auth/signout" method="post">
        <button type="submit" className="text-sm font-semibold text-leaf">{t("useEmail")}</button>
      </form>
      <p className="text-xs text-muted">{t("emailNeeded")}</p>
    </>
  );
}
