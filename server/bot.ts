import { Api, Bot, InlineKeyboard } from "grammy";
import type { Lead, LeadStatus, Leads, Notifier } from "./leads";
import { TYPES, URGENCY, money } from "../shared/pricing";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const STATUS_LINE: Record<LeadStatus, string> = { new: "🆕 Новая", taken: "🔧 В работе", done: "✅ Готово", rejected: "🚫 Отклонена" };

export function leadText(l: Lead): string {
  const types = TYPES.filter((t) => l.selection.types.includes(t.id));
  const feats = types.flatMap((t) => t.features.filter((f) => l.selection.features.includes(f.id)).map((f) => `• ${esc(f.title)}`));
  const who = l.handledBy ? ` (${esc(l.handledBy)})` : "";
  return [
    `<b>Заявка №${l.id}</b> · ${STATUS_LINE[l.status]}${who}`,
    "",
    `<b>${types.map((t) => t.title).join(" + ")}</b>`,
    ...(feats.length ? feats : ["• без доп. функций"]),
    "",
    `💰 ~ <b>${money(l.total)}</b> · ⏱ ~ <b>${l.days} дн.</b> · ${esc(URGENCY[l.selection.urgency].title)}`,
    "",
    `👤 ${esc(l.name)}`,
    `📞 ${esc(l.contact)}`,
    ...(l.comment ? [`💬 ${esc(l.comment)}`] : []),
  ].join("\n");
}

export function leadKeyboard(l: Lead): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (l.status === "new") kb.text("🔧 Взять в работу", `lead:${l.id}:taken`).text("🚫 Отклонить", `lead:${l.id}:rejected`);
  else if (l.status === "taken") kb.text("✅ Готово", `lead:${l.id}:done`).text("↩️ Вернуть", `lead:${l.id}:new`);
  else kb.text("↩️ Вернуть в новые", `lead:${l.id}:new`);
  return kb;
}

export function telegramNotifier(api: Api, adminChatId: string): Notifier {
  return { async newLead(l) { await api.sendMessage(adminChatId, leadText(l), { parse_mode: "HTML", reply_markup: leadKeyboard(l) }); } };
}

export function registerHandlers(bot: Bot, leads: Leads, adminChatId?: string) {
  const isAdmin = (chatId?: number) => !!adminChatId && String(chatId) === String(adminChatId);

  bot.command("start", (ctx) => ctx.reply("Это бот приёма заявок CaravanHouse. Соберите проект на сайте — заявка придёт сюда.\n\n/id — показать id этого чата"));
  bot.command("id", (ctx) => ctx.reply(`id этого чата: <code>${ctx.chat.id}</code>\nВпишите его в ADMIN_CHAT_ID.`, { parse_mode: "HTML" }));

  bot.command("leads", async (ctx) => {
    if (!isAdmin(ctx.chat.id)) return;
    const open = leads.recent(20).filter((l) => l.status === "new" || l.status === "taken").slice(0, 10);
    if (open.length === 0) return ctx.reply("Открытых заявок нет 🎉");
    return ctx.reply(open.map((l) => `№${l.id} · ${STATUS_LINE[l.status]} · ${l.name} · ${money(l.total)}`).join("\n"));
  });

  bot.callbackQuery(/^lead:(\d+):(new|taken|done|rejected)$/, async (ctx) => {
    if (!isAdmin(ctx.chat?.id)) return ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: true });
    const id = Number(ctx.match[1]);
    const by = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const lead = leads.setStatus(id, ctx.match[2] as LeadStatus, by);
    if (!lead) return ctx.answerCallbackQuery({ text: "Заявка не найдена" });
    await ctx.editMessageText(leadText(lead), { parse_mode: "HTML", reply_markup: leadKeyboard(lead) });
    return ctx.answerCallbackQuery({ text: STATUS_LINE[lead.status] });
  });
}
