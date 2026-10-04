import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Bot } from "grammy";
import { STARTING_PRICES, estimate, priceRange, rangeLabel, validateSelection } from "../shared/pricing";
import { Leads, type Lead } from "../server/leads";
import { createApp } from "../server/app";
import { registerHandlers, leadText } from "../server/bot";

// 1. смета
const empty = estimate({ types: [], features: [], urgency: "normal" });
assert.equal(empty.total, 0);
const bot1 = estimate({ types: ["bot"], features: ["bot-orders"], urgency: "normal" });
assert.equal(bot1.total, 2_700_000, "бот + заказы = 2.0 + 0.7 млн");
const combo = estimate({ types: ["bot", "site"], features: [], urgency: "normal" });
assert.equal(combo.total, Math.round(((2_000_000 + 1_500_000) * 0.9) / 10_000) * 10_000, "скидка 10% за комплекс");
const rush = estimate({ types: ["bot"], features: [], urgency: "rush" });
assert.ok(rush.total > estimate({ types: ["bot"], features: [], urgency: "normal" }).total && rush.days < 7, "срочно: дороже и быстрее");

// 1б. стартовые цены «от» (сайт берёт их через /api/prices) и вилка вместо точной цифры
assert.deepEqual(Object.fromEntries(STARTING_PRICES.map((p) => [p.id, p.from])), { landing: 1_500_000, bot: 2_000_000, corporate: 3_000_000, miniapp: 5_000_000 }, "утверждённые цены «от»");
const range = priceRange(estimate({ types: ["bot"], features: ["bot-orders"], urgency: "normal" }));
assert.deepEqual(range, { from: 2_500_000, to: 3_500_000 }, "2,7 млн показываем вилкой 2,5–3,5");
assert.equal(rangeLabel(range), "≈ 2,5–3,5 млн сум");
assert.deepEqual(priceRange({ total: 3_000_000, totalMax: 3_000_000 }), { from: 3_000_000, to: 3_500_000 }, "вилка не схлопывается в одно число");

// 2. валидация выбора
assert.equal(validateSelection({ types: ["hack"], features: [], urgency: "normal" }), null, "неизвестное направление");
assert.equal(validateSelection({ types: ["bot"], features: [], urgency: "free" }), null, "неизвестная срочность");
for (const urgency of ["constructor", "toString", "__proto__"]) {
  assert.equal(validateSelection({ types: ["bot"], features: [], urgency }), null, `служебный ключ ${urgency} не проходит как срочность`);
}
assert.deepEqual(validateSelection({ types: ["bot"], features: ["site-seo", "bot-pay"], urgency: "normal" })?.features, ["bot-pay"], "чужие функции отбрасываются");

// 3. API заявок
const sent: Lead[] = [];
const leads = new Leads(join(mkdtempSync(join(tmpdir(), "leads-")), "l.json"), { async newLead(l) { sent.push(l); } });
const server = createApp(leads, "/nonexistent").listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (body: unknown) => fetch(base + "/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const valid = { selection: { types: ["bot"], features: ["bot-orders"], urgency: "normal" }, name: "Алишер", contact: "@alisher", comment: "<b>тест</b>" };

assert.equal((await post({ ...valid, name: "" })).status, 400, "пустое имя");
assert.equal((await post({ ...valid, selection: { types: [], features: [], urgency: "normal" } })).status, 400, "пустой выбор");
const hp = await post({ ...valid, website: "http://spam" });
assert.equal((await hp.json() as { id: number }).id, 0, "ловушка молча принимает, но не сохраняет");
assert.equal(sent.length, 0);
const ok = await post({ ...valid, total: 1 }); // клиентскую сумму игнорируем
assert.equal(ok.status, 200);
await new Promise((r) => setTimeout(r, 10));
assert.equal(sent.length, 1);
assert.equal(sent[0].total, 2_700_000, "сумму считает сервер");
assert.ok(leadText(sent[0]).includes("&lt;b&gt;тест"), "HTML в комментарии экранируется");
const prices = await (await fetch(base + "/api/prices")).json() as { prepaymentPercent: number; starting: { id: string; from: number }[] };
assert.equal(prices.prepaymentPercent, 50);
assert.equal(prices.starting.find((p) => p.id === "corporate")?.from, 3_000_000, "/api/prices отдаёт цены «от»");
for (let i = 0; i < 4; i++) await post(valid);
assert.equal((await post(valid)).status, 429, "лимит 5 заявок в час");
server.close();

// 4. кнопки статусов в боте (Telegram подменён заглушкой)
const calls: { method: string; payload: any }[] = [];
const bot = new Bot("123:TEST", { botInfo: { id: 123, is_bot: true, first_name: "t", username: "t_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false } as any });
bot.api.config.use(async (_prev, method, payload) => { calls.push({ method, payload }); return { ok: true, result: true } as any; });
registerHandlers(bot, leads, "555");
const cb = (chatId: number, data: string) => ({
  update_id: Math.floor(Math.random() * 1e6),
  callback_query: { id: "cb", chat_instance: "x", from: { id: 7, is_bot: false, first_name: "Админ", username: "boss" }, data, message: { message_id: 5, date: 0, chat: { id: chatId, type: "private" }, text: "x" } },
} as any);

await bot.handleUpdate(cb(999, "lead:1:taken"));
assert.equal(leads.get(1)?.status, "new", "чужой чат не может менять статус");
await bot.handleUpdate(cb(555, "lead:1:taken"));
assert.equal(leads.get(1)?.status, "taken");
assert.ok(calls.some((c) => c.method === "editMessageText" && String(c.payload.text).includes("В работе") && String(c.payload.text).includes("@boss")), "сообщение обновлено, виден кто взял");
const edits = calls.filter((c) => c.method === "editMessageText").length;
await bot.handleUpdate(cb(555, "lead:1:taken"));
assert.equal(calls.filter((c) => c.method === "editMessageText").length, edits, "повторный тап не редактирует сообщение");
assert.equal(calls.at(-1)?.method, "answerCallbackQuery", "но кнопка отвечает");

console.log("✓ все проверки пройдены");
process.exit(0);
