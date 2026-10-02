import "dotenv/config";
import { Bot } from "grammy";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { Leads, type Notifier } from "./leads";
import { registerHandlers, telegramNotifier } from "./bot";

const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;
const port = Number(process.env.PORT ?? 3000);
// На Railway укажите путь к подключённому Volume (например /data), иначе данные сотрутся при деплое
const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");

const bot = token ? new Bot(token) : null;
const notifier: Notifier =
  bot && adminChatId ? telegramNotifier(bot.api, adminChatId) : { async newLead(l) { console.log("Новая заявка (Telegram не настроен):", l.id, l.name); } };
if (!bot) console.warn("BOT_TOKEN не задан: заявки только сохраняются в data/leads.json");
if (bot && !adminChatId) console.warn("ADMIN_CHAT_ID не задан: напишите боту /id и впишите значение в .env");

const leads = new Leads(join(dataDir, "leads.json"), notifier);
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
createApp(leads, dist, process.env.TRUST_PROXY === "1").listen(port, () => console.log(`Конфигуратор: http://localhost:${port}`));

if (bot) {
  registerHandlers(bot, leads, adminChatId);
  bot.catch((e) => console.error("Ошибка бота:", e.message));
  void bot.start({ onStart: (me) => console.log(`Бот @${me.username} запущен`) });
}
process.on("SIGTERM", () => { leads.db.flush(); process.exit(0); });
