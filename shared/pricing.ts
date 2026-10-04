/**
 * Прайс CaravanHouse — единый источник цен.
 * Стартовые цены («от») утверждены: лендинг 1,5 млн, бот 2 млн, корпоративный сайт 3 млн, Mini App 5 млн.
 * Отсюда же их берёт caravanhouse.uz (GET /api/prices), поэтому менять цены нужно только здесь.
 * Доп. функции — по 100 000 сум (решение команды). Исключение: «Корпоративный сайт: больше 5 страниц» —
 * это переход с лендинга на корпоративный сайт, из него складывается цена «корпоративный сайт от 3 млн».
 */
export type TypeId = "bot" | "site" | "miniapp";
export interface Feature { id: string; title: string; price: number; days: number }
export interface ProjectType { id: TypeId; title: string; tagline: string; base: number; days: number; features: Feature[] }

export const TYPES: ProjectType[] = [
  {
    id: "bot", title: "Telegram-бот", tagline: "Заказы, записи и ответы клиентам 24/7", base: 2_000_000, days: 7,
    features: [
      { id: "bot-orders", title: "Приём заказов и каталог", price: 100_000, days: 4 },
      { id: "bot-booking", title: "Онлайн-запись на время", price: 100_000, days: 4 },
      { id: "bot-pay", title: "Оплата Click / Payme (по запросу)", price: 100_000, days: 4 },
      { id: "bot-admin", title: "Админ-панель прямо в Telegram", price: 100_000, days: 5 },
      { id: "bot-broadcast", title: "Рассылки по клиентам", price: 100_000, days: 2 },
      { id: "bot-lang", title: "Русский и узбекский язык", price: 100_000, days: 2 },
    ],
  },
  {
    id: "site", title: "Сайт", tagline: "Лендинг, а с опцией ниже — корпоративный сайт", base: 1_500_000, days: 7,
    features: [
      { id: "site-pages", title: "Корпоративный сайт: больше 5 страниц", price: 1_500_000, days: 7 },
      { id: "site-cms", title: "Админка для редактирования контента", price: 100_000, days: 6 },
      { id: "site-anim", title: "Анимации и интерактив", price: 100_000, days: 4 },
      { id: "site-lang", title: "Русский и узбекский язык", price: 100_000, days: 3 },
      { id: "site-seo", title: "SEO-настройка и аналитика", price: 100_000, days: 3 },
      { id: "site-leads", title: "Заявки с сайта в Telegram", price: 100_000, days: 1 },
    ],
  },
  {
    id: "miniapp", title: "Telegram Mini App", tagline: "Магазин или сервис внутри Telegram", base: 5_000_000, days: 14,
    features: [
      { id: "app-catalog", title: "Каталог и корзина", price: 100_000, days: 6 },
      { id: "app-pay", title: "Оплата внутри приложения (по запросу)", price: 100_000, days: 5 },
      { id: "app-account", title: "Личный кабинет клиента", price: 100_000, days: 5 },
      { id: "app-admin", title: "Панель владельца", price: 100_000, days: 7 },
      { id: "app-push", title: "Уведомления через бота", price: 100_000, days: 2 },
      { id: "app-lang", title: "Русский и узбекский язык", price: 100_000, days: 3 },
    ],
  },
];

export const URGENCY = {
  normal: { title: "Обычный срок", priceK: 1, daysK: 1 },
  rush: { title: "Срочно (быстрее на треть, дороже на 30%)", priceK: 1.3, daysK: 0.7 },
} as const;
export type UrgencyId = keyof typeof URGENCY;

export const BUNDLE_DISCOUNT = 0.1; // скидка, если выбрано 2+ направления
export const BUNDLE_PARALLEL = 0.85; // части делаются параллельно, срок короче суммы

export interface Selection { types: TypeId[]; features: string[]; urgency: UrgencyId }
export interface Estimate {
  lines: { title: string; price: number }[];
  subtotal: number; discount: number; total: number; totalMax: number; days: number;
}

const round = (n: number) => Math.round(n / 10_000) * 10_000;

export function estimate(sel: Selection): Estimate {
  const lines: Estimate["lines"] = [];
  let days = 0;
  for (const t of TYPES.filter((t) => sel.types.includes(t.id))) {
    lines.push({ title: `${t.title}: основа`, price: t.base });
    days += t.days;
    for (const f of t.features.filter((f) => sel.features.includes(f.id))) {
      lines.push({ title: f.title, price: f.price });
      days += f.days;
    }
  }
  const subtotal = lines.reduce((s, l) => s + l.price, 0);
  const bundle = sel.types.length >= 2;
  const discount = bundle ? round(subtotal * BUNDLE_DISCOUNT) : 0;
  const u = URGENCY[sel.urgency];
  const total = round((subtotal - discount) * u.priceK);
  const d = Math.max(sel.types.length ? 3 : 0, Math.ceil(days * (bundle ? BUNDLE_PARALLEL : 1) * u.daysK));
  return { lines, subtotal, discount, total, totalMax: round(total * 1.2), days: d };
}

/** Проверка выбора, пришедшего с клиента: только известные id, без дублей */
export function validateSelection(raw: unknown): Selection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.types) || !Array.isArray(r.features) || typeof r.urgency !== "string") return null;
  // собственный ключ, а не `in`: иначе "constructor" или "toString" проходят проверку и смета считается как NaN
  if (!Object.prototype.hasOwnProperty.call(URGENCY, r.urgency)) return null;
  const typeIds = new Set(TYPES.map((t) => t.id as string));
  const types = [...new Set(r.types)].filter((t): t is TypeId => typeof t === "string" && typeIds.has(t));
  if (types.length === 0 || types.length !== new Set(r.types).size) return null;
  const allowed = new Set(TYPES.filter((t) => types.includes(t.id)).flatMap((t) => t.features.map((f) => f.id)));
  const features = [...new Set(r.features)].filter((f): f is string => typeof f === "string" && allowed.has(f));
  return { types, features, urgency: r.urgency as UrgencyId };
}

export const money = (n: number) => `${n.toLocaleString("ru-RU")} сум`;

const typeById = (id: TypeId) => TYPES.find((t) => t.id === id)!;
const featurePrice = (typeId: TypeId, featureId: string) => typeById(typeId).features.find((f) => f.id === featureId)!.price;

/** Стартовые цены для сайта caravanhouse.uz: всегда «от», считаются из TYPES выше */
export const STARTING_PRICES: { id: "landing" | "bot" | "corporate" | "miniapp"; from: number }[] = [
  { id: "landing", from: typeById("site").base },
  { id: "bot", from: typeById("bot").base },
  { id: "corporate", from: typeById("site").base + featurePrice("site", "site-pages") },
  { id: "miniapp", from: typeById("miniapp").base },
];

/** Поддержка после бесплатного первого месяца: правки и исправление ошибок, новый функционал — отдельно */
export const SUPPORT_MONTHLY_FROM = 300_000;

/** Предоплата перед стартом, остальное — после сдачи */
export const PREPAYMENT_PERCENT = 50;

/** Смету показываем вилкой, а не точной цифрой: шаг 0,5 млн (до 10 млн) или 1 млн */
export function priceRange(e: Pick<Estimate, "total" | "totalMax">): { from: number; to: number } {
  const step = e.totalMax >= 10_000_000 ? 1_000_000 : 500_000;
  const from = Math.max(step, Math.floor(e.total / step) * step);
  let to = Math.ceil(e.totalMax / step) * step;
  if (to <= from) to = from + step;
  return { from, to };
}

const millions = (n: number) => (n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
export const rangeLabel = (r: { from: number; to: number }) => `≈ ${millions(r.from)}–${millions(r.to)} млн сум`;
