/** The Office Hub Android app shows this website in its own window; its user agent includes "OfficeHubApp/<n>". */
export const OFFICE_HUB_APP_UA = "OfficeHubApp/";

export function isOfficeHubAppUA(ua: string | null | undefined) {
  return !!ua && ua.includes(OFFICE_HUB_APP_UA);
}

/** In the browser: is this page open inside the Office Hub app? */
export function inOfficeHubApp() {
  return typeof navigator !== "undefined" && isOfficeHubAppUA(navigator.userAgent);
}

type NativePort = { postMessage(msg: string): void; onmessage: ((e: { data: string }) => void) | null };
type Reply = { type: string; value: string };

/** The app's message port (app 2.1 and later; only Office Hub pages get it). */
function port(): NativePort | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { OfficeHubNative?: NativePort }).OfficeHubNative) ?? null;
}

export function hasNativeAlerts() {
  return !!port();
}

// Several parts of a page may ask at once: each answer goes to the oldest question waiting for that kind of answer.
const waiting: { answers: string[]; resolve: (r: Reply | null) => void }[] = [];
let wired: NativePort | null = null;

function wire(p: NativePort) {
  if (wired === p) return;
  wired = p;
  p.onmessage = (e) => {
    let r: Reply;
    try { r = JSON.parse(e.data) as Reply; } catch { return; }
    const i = waiting.findIndex((w) => w.answers.includes(r.type));
    if (i >= 0) waiting.splice(i, 1)[0].resolve(r);
  };
}

/** Ask the app something and wait for its answer (one of `answers`). */
function ask(type: string, answers: string[], timeoutMs = 20000): Promise<Reply | null> {
  const p = port();
  if (!p) return Promise.resolve(null);
  wire(p);
  return new Promise((resolve) => {
    const entry = { answers, resolve: (r: Reply | null) => { clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => {
      const i = waiting.indexOf(entry);
      if (i >= 0) waiting.splice(i, 1);
      resolve(null);
    }, timeoutMs);
    waiting.push(entry);
    p.postMessage(JSON.stringify({ type }));
  });
}

/** "ready" = Firebase is set up in this app build; permission = Android's notification permission. */
export async function nativeAlertStatus() {
  const r = await ask("push-status", ["push-status"], 5000);
  if (!r) return null;
  const [firebase, permission] = r.value.split(",");
  return { ready: firebase === "ready", granted: permission === "granted" };
}

/** Turn alerts on: asks Android's permission if needed; resolves to this install's token, or an error code. */
export async function nativeAlertEnable(): Promise<{ token?: string; error?: string }> {
  const r = await ask("push-enable", ["push-token", "push-error"], 60000);
  if (!r) return { error: "timeout" };
  return r.type === "push-token" && r.value ? { token: r.value } : { error: r.value || "token" };
}

/** Current token without asking anything (empty when alerts are not allowed). */
export async function nativeAlertToken() {
  const r = await ask("push-token", ["push-token", "push-error"], 15000);
  return r?.type === "push-token" && r.value ? r.value : null;
}

export async function nativeAlertDisable() {
  await ask("push-disable", ["push-disabled"], 15000);
}
