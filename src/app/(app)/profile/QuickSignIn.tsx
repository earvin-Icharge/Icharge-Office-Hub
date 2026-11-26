"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { nativeBioChallenge, nativeBioRegister, passkeyRegisterOptions, passkeyRegisterVerify, removeQuickSignIn, setPin } from "@/app/actions/quick";
import { hasNativeAlerts, nativeBioRegister as phoneRegister, nativeBioRemove, nativeBioStatus } from "@/lib/native";

/** Set up fingerprint / Face ID / Windows Hello (passkey) or a 6-digit PIN on this device (spec 3.5). */
export function QuickSignIn({ hasPasskey, hasPin }: { hasPasskey: boolean; hasPin: boolean }) {
  const t = useTranslations("quick");
  const router = useRouter();
  const [canPasskey, setCanPasskey] = useState<boolean | null>(null);
  const [phone, setPhone] = useState(false); // inside the Android app: use the phone's own fingerprint prompt
  const [phoneState, setPhoneState] = useState<string>();
  const [showPin, setShowPin] = useState(false);
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [pending, start] = useTransition();

  useEffect(() => {
    if (hasNativeAlerts()) {
      nativeBioStatus().then((st) => {
        if (!st) { setCanPasskey(false); return; } // app 2.1: no phone fingerprint yet
        setPhone(true);
        setPhoneState(st.state);
        setCanPasskey(st.ready);
      });
      return;
    }
    const pkc = (window as unknown as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } }).PublicKeyCredential;
    if (!pkc?.isUserVerifyingPlatformAuthenticatorAvailable) { setCanPasskey(false); return; }
    pkc.isUserVerifyingPlatformAuthenticatorAvailable().then(setCanPasskey).catch(() => setCanPasskey(false));
  }, []);

  const err = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
  const phoneErr = (code?: string) => (code === "cancelled" ? t("errors.cancelled") : code === "lockout" ? t("errors.lockout") : code === "changed" ? t("errors.changed") : t("errors.phoneFailed"));

  function addPasskey() {
    setMsg(undefined);
    if (phone) {
      start(async () => {
        const c = await nativeBioChallenge();
        if (!c.ok) return setMsg({ ok: false, text: err(c.error) });
        const r = await phoneRegister(c.challenge);
        if (!r.publicKey || !r.signature) return setMsg({ ok: false, text: phoneErr(r.error) });
        const v = await nativeBioRegister(r.publicKey, r.signature);
        setMsg(v.ok ? { ok: true, text: t("saved") } : { ok: false, text: err(v.error) });
        router.refresh();
      });
      return;
    }
    start(async () => {
      const o = await passkeyRegisterOptions();
      if (!o.ok) return setMsg({ ok: false, text: err(o.error) });
      try {
        const resp = await startRegistration({ optionsJSON: o.options });
        const v = await passkeyRegisterVerify(resp);
        setMsg(v.ok ? { ok: true, text: t("saved") } : { ok: false, text: err(v.error) });
        router.refresh();
      } catch (e) {
        // Only a real "cancel" says Cancelled; anything else says fingerprint isn't available here.
        setMsg({ ok: false, text: (e as { name?: string })?.name === "NotAllowedError" ? t("errors.cancelled") : t("errors.notHere") });
      }
    });
  }

  function savePin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(undefined);
    start(async () => {
      const r = await setPin(pin, confirm);
      if (r.ok) { setShowPin(false); setPinValue(""); setConfirm(""); setMsg({ ok: true, text: t("saved") }); router.refresh(); }
      else setMsg({ ok: false, text: err(r.error) });
    });
  }

  function removeAll() {
    start(async () => {
      if (phone) await nativeBioRemove();
      const r = await removeQuickSignIn();
      setMsg(r.ok ? { ok: true, text: t("removed") } : { ok: false, text: err(r.error) });
      router.refresh();
    });
  }

  const row = "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3";
  const status = (on: boolean) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${on ? "bg-charge-soft text-leaf" : "bg-company-soft text-ink-2"}`}>{on ? t("on") : t("off")}</span>;
  const pinInput = "h-12 w-full rounded-xl border border-field text-center text-2xl tracking-[10px]";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t("help")}</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-[10px] px-3 py-2 text-[13px] font-semibold ${msg.ok ? "bg-charge-soft" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}

      <div className={row}>
        <span className="flex min-w-0 items-center gap-3">
          <Fingerprint aria-hidden size={28} className="flex-none text-leaf" />
          <span className="flex flex-col"><b className="text-sm">{t("fingerprint")}</b><span className="text-xs text-muted">{t("fingerprintHelp")}</span></span>
        </span>
        <span className="flex items-center gap-2">
          {status(hasPasskey)}
          {canPasskey === false ? <span className="text-xs text-muted">{phone && phoneState === "not-enrolled" ? t("notEnrolled") : t("notAvailable")}</span>
            : <button type="button" disabled={pending || canPasskey === null} onClick={addPasskey} className="h-10 rounded-[10px] bg-charge px-4 text-sm font-bold text-forest disabled:opacity-60">{hasPasskey ? t("change") : t("setUp")}</button>}
        </span>
      </div>

      <div className={row}>
        <span className="flex min-w-0 items-center gap-3">
          <KeyRound aria-hidden size={28} className="flex-none text-leaf" />
          <span className="flex flex-col"><b className="text-sm">{t("pin")}</b><span className="text-xs text-muted">{t("pinHelp")}</span></span>
        </span>
        <span className="flex items-center gap-2">
          {status(hasPin)}
          <button type="button" disabled={pending} onClick={() => setShowPin((s) => !s)} className="h-10 rounded-[10px] border border-field bg-white px-4 text-sm font-semibold">{hasPin ? t("change") : t("setUp")}</button>
        </span>
        {showPin && (
          <form onSubmit={savePin} className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="flex flex-col gap-1 text-xs font-semibold">{t("newPin")}
              <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))} className={pinInput} /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold">{t("confirmPin")}
              <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))} className={pinInput} /></label>
            <button type="submit" disabled={pending} className="h-12 rounded-xl bg-charge px-5 text-sm font-bold text-forest">{t("savePin")}</button>
          </form>
        )}
      </div>

      {(hasPasskey || hasPin) && (
        <button type="button" disabled={pending} onClick={removeAll} className="w-fit text-sm font-semibold text-danger">{t("removeAll")}</button>
      )}
    </div>
  );
}
