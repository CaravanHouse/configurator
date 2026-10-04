import { TYPES, URGENCY, priceRange, rangeLabel } from "../shared/pricing";
import type { Lead, Notifier } from "./leads";

/** Тип проекта калькулятора → услуга в боте заказов (несколько направлений сразу — «другое») */
const SERVICE = { bot: "bot", site: "site", miniapp: "miniapp" } as const;

/** Текст заявки для карточки в группе: что выбрано, функции, срочность и комментарий клиента */
export function leadSummary(l: Lead): string {
  const types = TYPES.filter((t) => l.selection.types.includes(t.id));
  const features = types.flatMap((t) => t.features.filter((f) => l.selection.features.includes(f.id)).map((f) => f.title));
  return [
    "Из калькулятора calc.caravanhouse.uz",
    `Что нужно: ${types.map((t) => t.title).join(" + ")}`,
    `Функции: ${features.length ? features.join(", ") : "без доп. функций"}`,
    `Срочность: ${URGENCY[l.selection.urgency].title}`,
    ...(l.comment ? [`Комментарий: ${l.comment}`] : []),
  ].join("\n");
}

/** Поля для POST /lead бота заказов @CaravanHousebot */
export function orderBotPayload(l: Lead) {
  const types = l.selection.types;
  return {
    source: "calc",
    name: l.name,
    contact: l.contact,
    service: types.length === 1 ? SERVICE[types[0]] : "other",
    message: leadSummary(l),
    budget: rangeLabel(priceRange({ total: l.total, totalMax: Math.round(l.total * 1.2) })),
    deadline: `~${l.days} раб. дней`,
  };
}

/**
 * Заявки уходят в бота заказов @CaravanHousebot: в группе «Заказы» один бот и одно голосование для
 * заявок из Telegram, с сайта и из калькулятора. Если бот заказов не ответил — запасной канал
 * (свой бот конфигуратора шлёт заявку админу в личку), а сама заявка в любом случае уже в leads.json.
 */
export function orderBotNotifier(opts: { url: string; secret: string; fallback: Notifier; fetchImpl?: typeof fetch }): Notifier {
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    async newLead(lead, meta) {
      try {
        const res = await doFetch(`${opts.url.replace(/\/$/, "")}/lead`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Lead-Secret": opts.secret, "X-Client-IP": meta?.ip ?? "unknown" },
          body: JSON.stringify(orderBotPayload(lead)),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) return;
        console.error(`Бот заказов ответил ${res.status} на заявку №${lead.id}, отправляю запасным каналом`);
      } catch (err) {
        console.error(`Бот заказов недоступен (заявка №${lead.id}), отправляю запасным каналом:`, (err as Error).message);
      }
      await opts.fallback.newLead(lead, meta);
    },
  };
}
