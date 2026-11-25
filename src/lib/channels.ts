import "server-only";

/** Email through Resend (needs RESEND_API_KEY on Vercel). Returns true when sent. */
export async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "iCharge Office Hub <onboarding@resend.dev>", to: [to], subject, text }),
  });
  return res.ok;
}

/** Telegram bot message (needs TELEGRAM_BOT_TOKEN on Vercel). */
export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return res.ok;
}

/** Kinds that stay in the app (bell + push) only; everything else may also go by email/Telegram (spec 7). */
export const APP_ONLY_KINDS = new Set(["task_comment", "task_done", "task_accepted", "task_cancelled", "task_reassigned", "task_request_decided", "mention"]);
