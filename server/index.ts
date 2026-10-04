import "dotenv/config";
import { Bot } from "grammy";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { onRailway } from "./env";
import { Leads, type Notifier } from "./leads";
import { registerHandlers, telegramNotifier } from "./bot";
import { orderBotNotifier } from "./orderBot";

const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;
const port = Number(process.env.PORT ?? 3000);
// На Railway укажите путь к подключённому Volume (например /data), иначе данные сотрутся при деплое
const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");

const bot = token ? new Bot(token) : null;
const direct: Notifier =
  bot && adminChatId ? telegramNotifier(bot.api, adminChatId) : { async newLead(l) { console.log("Новая заявка (Telegram не настроен):", l.id, l.name); } };
// Основной путь — бот заказов @CaravanHousebot (группа «Заказы» с голосованием), запасной — свой бот админу
const orderBotUrl = process.env.ORDER_BOT_URL;
const leadSecret = process.env.LEAD_SECRET;
const notifier: Notifier = orderBotUrl && leadSecret ? orderBotNotifier({ url: orderBotUrl, secret: leadSecret, fallback: direct }) : direct;
console.log(orderBotUrl && leadSecret ? "Заявки уходят в бота заказов (группа «Заказы»)" : "ORDER_BOT_URL/LEAD_SECRET не заданы: заявки идут напрямую админу");
if (!bot) console.warn("BOT_TOKEN не задан: заявки только сохраняются в data/leads.json");
if (bot && !adminChatId) console.warn("ADMIN_CHAT_ID не задан: напишите боту /id и впишите значение в .env");

const leads = new Leads(join(dataDir, "leads.json"), notifier);
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
// За прокси Railway без trust proxy у всех посетителей один IP, и лимит заявок блокировал бы всех сразу.
// На Railway включаем сами, TRUST_PROXY=0 отключает.
const trustProxy = process.env.TRUST_PROXY === "1" || (onRailway && process.env.TRUST_PROXY !== "0");
createApp(leads, dist, trustProxy).listen(port, () => console.log(`Конфигуратор: http://localhost:${port}`));

if (bot) {
  registerHandlers(bot, leads, adminChatId);
  bot.catch((e) => console.error("Ошибка бота:", e.message));
  void bot.start({ onStart: (me) => console.log(`Бот @${me.username} запущен`) });
}
// Railway останавливает сервис через SIGTERM: успеваем записать данные на диск
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { leads.db.flush(); process.exit(0); });
