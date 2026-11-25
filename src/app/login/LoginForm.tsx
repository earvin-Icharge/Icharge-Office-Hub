"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendCode, verifyCode, type SendResult, type VerifyResult } from "./actions";

const CODE_SECONDS = 10 * 60;
const RESEND_SECONDS = 60;

function mmss(total: number) {
  const s = Math.max(0, total);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function LoginForm({ initialError }: { initialError?: string }) {
  const t = useTranslations("login");
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(initialError);
  const [tries, setTries] = useState(5);
  const [sentAt, setSentAt] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());
  const [pending, start] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== "code") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const elapsed = Math.floor((now - sentAt) / 1000);
  const expiresIn = CODE_SECONDS - elapsed;
  const resendIn = RESEND_SECONDS - elapsed;

  function sendError(r: Exclude<SendResult, { ok: true }>) {
    if (r.error === "locked") return t("errors.locked", { minutes: r.minutes });
    if (r.error === "wait") return t("errors.wait", { seconds: r.seconds });
    return t(`errors.${r.error}`);
  }

  function verifyError(r: VerifyResult) {
    if (r.error === "locked") return t("errors.locked", { minutes: r.minutes });
    if (r.error === "wrongCode") return t("errors.wrongCode", { tries: r.triesLeft });
    return t("errors.codeFormat");
  }

  function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await sendCode(email);
      if (!r.ok) return setError(sendError(r));
      setEmail(r.email);
      setTries(r.triesLeft);
      setCode("");
      setSentAt(Date.now());
      setNow(Date.now());
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    });
  }

  function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const r = await verifyCode(email, code);
      // On success the server redirects to My day, so we only get here on an error.
      if (r) {
        if (r.error === "wrongCode") setTries(r.triesLeft);
        if (r.error === "locked") setTries(0);
        setError(verifyError(r));
      }
    });
  }

  const errorBox = error ? (
    <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{error}</p>
  ) : null;

  if (step === "email") {
    return (
      <form onSubmit={onSend} className="flex flex-col gap-4" noValidate>
        <div>
          <h2 className="mb-1.5 font-display text-2xl font-bold">{t("signIn")}</h2>
          <p className="text-sm text-muted">{t("step1")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="oh-email" className="text-[13px] font-semibold">{t("workEmail")}</label>
          <input
            id="oh-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border border-field px-3.5 text-base"
          />
        </div>
        {errorBox}
        <button type="submit" disabled={pending || !email} className="h-12 rounded-xl bg-charge text-base font-bold text-forest disabled:opacity-60">
          {pending ? t("sending") : t("sendCode")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerify} className="flex flex-col gap-4" noValidate>
      <div>
        <h2 className="mb-1.5 font-display text-2xl font-bold">{t("checkEmail")}</h2>
        <p className="text-sm leading-normal text-muted">{t.rich("step2", { email, b: (c) => <b className="text-forest">{c}</b> })}</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="oh-code" className="text-[13px] font-semibold">{t("codeLabel")}</label>
        <input
          ref={codeRef}
          id="oh-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-14 rounded-xl border border-field px-3.5 text-center font-display text-[28px] tracking-[10px]"
        />
      </div>
      {errorBox}
      <p className="text-[13px] text-muted">
        {expiresIn > 0 ? t.rich("expiresIn", { time: mmss(expiresIn), tries, b: (c) => <b className="text-forest">{c}</b> }) : t("codeExpired")}
      </p>
      <button type="submit" disabled={pending || code.length !== 6 || tries <= 0} className="h-12 rounded-xl bg-charge text-base font-bold text-forest disabled:opacity-60">
        {pending ? t("verifying") : t("verify")}
      </button>
      <div className="flex flex-wrap justify-between gap-2 text-[13px]">
        <button type="button" onClick={() => { setStep("email"); setError(undefined); }} className="font-semibold text-leaf">
          {t("otherEmail")}
        </button>
        {resendIn > 0 ? (
          <span className="text-muted">{t("newCodeIn", { time: mmss(resendIn) })}</span>
        ) : (
          <button type="button" disabled={pending} onClick={() => onSend()} className="font-semibold text-leaf">
            {t("resend")}
          </button>
        )}
      </div>
    </form>
  );
}
