import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegram } from "@/lib/channels";

/** The Office Hub Telegram bot: a person sends their one-time code to link their chat (spec 7). */
export async function POST(request: NextRequest) {
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const update = (await request.json().catch(() => ({}))) as { message?: { chat?: { id?: number }; text?: string } };
  const chatId = update.message?.chat?.id;
  const text = (update.message?.text ?? "").replace("/start", "").trim().toUpperCase();
  if (!chatId) return NextResponse.json({ ok: true });
  if (!/^[A-F0-9]{8}$/.test(text)) {
    await sendTelegram(String(chatId), "Hi! Open Office Hub › My profile › Telegram and send me your 8-character code.\n您好！请打开 Office Hub ›「我的资料」› Telegram，并把 8 位代码发给我。");
    return NextResponse.json({ ok: true });
  }
  const db = createAdminClient();
  const { data: p } = await db.from("profiles").select("id, name").eq("telegram_link_code", text).eq("active", true).maybeSingle();
  if (!p) {
    await sendTelegram(String(chatId), "That code didn't match. Please make a new one in My profile.\n代码不匹配，请在「我的资料」中重新生成。");
    return NextResponse.json({ ok: true });
  }
  await db.from("profiles").update({ telegram_chat_id: String(chatId), telegram_link_code: null }).eq("id", p.id);
  await sendTelegram(String(chatId), `Connected, ${p.name.split(" ")[0]}! Office Hub reminders will come here.\n已连接！Office Hub 提醒将发送到这里。`);
  return NextResponse.json({ ok: true });
}
