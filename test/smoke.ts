import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Bot } from "grammy";
import { STARTING_PRICES, estimate, priceRange, rangeLabel, validateSelection } from "../shared/pricing";
import { Leads, type Lead } from "../server/leads";
import { clientIp, createApp } from "../server/app";
import { registerHandlers, leadText } from "../server/bot";
import { orderBotNotifier, orderBotPayload } from "../server/orderBot";

// 1. смета
const empty = estimate({ types: [], features: [], urgency: "normal" });
assert.equal(empty.total, 0);
const bot1 = estimate({ types: ["bot"], features: ["bot-orders"], urgency: "normal" });
assert.equal(bot1.total, 1_300_000, "бот + заказы = 1.2 + 0.1 млн");
const combo = estimate({ types: ["bot", "site"], features: [], urgency: "normal" });
assert.equal(combo.total, Math.round(((1_200_000 + 700_000) * 0.9) / 10_000) * 10_000, "скидка 10% за комплекс");
const rush = estimate({ types: ["bot"], features: [], urgency: "rush" });
assert.ok(rush.total > estimate({ types: ["bot"], features: [], urgency: "normal" }).total && rush.days < 7, "срочно: дороже и быстрее");

// 1б. стартовые цены «от» (сайт берёт их через /api/prices) и вилка вместо точной цифры
assert.deepEqual(Object.fromEntries(STARTING_PRICES.map((p) => [p.id, p.from])), { landing: 700_000, bot: 1_200_000, corporate: 1_900_000, miniapp: 2_600_000 }, "утверждённые цены «от»");
const range = priceRange(estimate({ types: ["bot"], features: ["bot-orders"], urgency: "normal" }));
assert.deepEqual(range, { from: 1_000_000, to: 2_000_000 }, "1,3 млн показываем вилкой 1–2");
assert.equal(rangeLabel(range), "≈ 1–2 млн сум");
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
assert.equal(sent[0].total, 1_300_000, "сумму считает сервер");
assert.ok(leadText(sent[0]).includes("&lt;b&gt;тест"), "HTML в комментарии экранируется");
const prices = await (await fetch(base + "/api/prices")).json() as { prepaymentPercent: number; starting: { id: string; from: number }[] };
assert.equal(prices.prepaymentPercent, 50);
assert.equal((prices as { supportMonthlyFrom?: number }).supportMonthlyFrom, 300_000, "поддержка от 300 000 в месяц");
assert.equal(prices.starting.find((p) => p.id === "corporate")?.from, 1_900_000, "/api/prices отдаёт цены «от»");
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

// 5. заявки уходят в бота заказов @CaravanHousebot, при сбое — запасной канал
const sample = sent[0];
const payload = orderBotPayload(sample);
assert.equal(payload.source, "calc");
assert.equal(payload.service, "bot", "одно направление → его услуга");
assert.equal(payload.budget, "≈ 1–2 млн сум", "в бота уходит вилка, а не точная сумма");
assert.match(payload.message, /Приём заказов и каталог/);
assert.equal(orderBotPayload({ ...sample, selection: { ...sample.selection, types: ["bot", "site"] } }).service, "other", "несколько направлений → другое");

const fallbackGot: number[] = [];
const fallback = { async newLead(l: Lead) { fallbackGot.push(l.id); } };
let request: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
const okFetch = (async (url: string, init: RequestInit) => {
  request = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;
await orderBotNotifier({ url: "https://bot.example/", secret: "s3", fallback, fetchImpl: okFetch }).newLead(sample, { ip: "1.2.3.4" });
assert.equal(request!.url, "https://bot.example/lead");
assert.equal(request!.headers["X-Lead-Secret"], "s3");
assert.equal(request!.headers["X-Client-IP"], "1.2.3.4", "IP клиента передаётся для лимита");
assert.equal(fallbackGot.length, 0, "при успехе запасной канал не нужен");
const downFetch = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
const errFetch = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
await orderBotNotifier({ url: "https://bot.example", secret: "s3", fallback, fetchImpl: downFetch }).newLead(sample);
await orderBotNotifier({ url: "https://bot.example", secret: "s3", fallback, fetchImpl: errFetch }).newLead(sample);
assert.equal(fallbackGot.length, 2, "бот недоступен или 500 → запасной канал");

// 6. IP посетителя за несколькими прокси
const fakeReq = (h: Record<string, string>, ip = "10.1.1.1") => ({ ip, header: (n: string) => h[n.toLowerCase()] }) as Parameters<typeof clientIp>[0];
assert.deepEqual(clientIp(fakeReq({ "x-real-ip": "82.215.82.106", "x-forwarded-for": "82.215.82.106, 152.233.15.123" }), true), { ip: "82.215.82.106", via: "x-real-ip" });
assert.equal(clientIp(fakeReq({ "x-forwarded-for": "82.215.82.106, 152.233.15.123" }), true).ip, "82.215.82.106", "первый адрес цепочки, а не прокси");
assert.equal(clientIp(fakeReq({ "x-real-ip": "9.9.9.9" }), false).ip, "10.1.1.1", "без trust proxy заголовкам не верим");

console.log("✓ все проверки пройдены");
process.exit(0);
