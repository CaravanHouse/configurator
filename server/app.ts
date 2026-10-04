import express, { type Request } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Leads } from "./leads";
import { PREPAYMENT_PERCENT, STARTING_PRICES, SUPPORT_MONTHLY_FROM, validateSelection } from "../shared/pricing";

/**
 * IP посетителя для лимита заявок. На Railway перед приложением несколько прокси, и req.ip с
 * trust proxy = 1 давал адрес прокси (у всех посетителей один IP → лимит блокировал всех).
 * Поэтому за прокси берём X-Real-IP, затем первый адрес из X-Forwarded-For, иначе req.ip.
 */
export function clientIp(req: Pick<Request, "header" | "ip">, trustProxy: boolean): { ip: string; via: string } {
  if (trustProxy) {
    const real = req.header("x-real-ip")?.trim();
    if (real) return { ip: real, via: "x-real-ip" };
    const first = req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (first) return { ip: first, via: "x-forwarded-for" };
  }
  return { ip: req.ip ?? "unknown", via: "socket" };
}

export function createApp(leads: Leads, distDir: string, trustProxy = false) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);
  app.use(express.json({ limit: "20kb" }));
  app.get("/health", (_q, r) => { r.json({ ok: true }); });

  // Стартовые цены для caravanhouse.uz: сайт забирает их отсюда, чтобы цены жили в одном месте
  app.get("/api/prices", (_q, r) => {
    r.set("Access-Control-Allow-Origin", "*");
    r.set("Cache-Control", "public, max-age=300");
    r.json({ currency: "UZS", prepaymentPercent: PREPAYMENT_PERCENT, supportMonthlyFrom: SUPPORT_MONTHLY_FROM, starting: STARTING_PRICES });
  });

  app.post("/api/lead", (req, res) => {
    const b = req.body ?? {};
    const { ip, via } = clientIp(req, trustProxy);
    console.log(`[lead] запрос: ip=${ip} (${via})`);
    // ловушка для ботов: настоящий человек это поле не видит и не заполняет
    if (typeof b.website === "string" && b.website.trim() !== "") { res.json({ ok: true, id: 0 }); return; }

    const selection = validateSelection(b.selection);
    const name = typeof b.name === "string" ? b.name.trim() : "";
    const contact = typeof b.contact === "string" ? b.contact.trim() : "";
    const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 500) : "";
    if (!selection) { res.status(400).json({ error: "Выберите, что нужно сделать" }); return; }
    if (name.length < 2 || name.length > 60) { res.status(400).json({ error: "Укажите имя" }); return; }
    if (contact.length < 3 || contact.length > 80) { res.status(400).json({ error: "Укажите Telegram или телефон" }); return; }
    if (!leads.allowed(ip)) { res.status(429).json({ error: "Слишком много заявок, попробуйте позже" }); return; }

    const lead = leads.create({ name, contact, comment, selection }, { ip });
    res.json({ ok: true, id: lead.id });
  });

  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_q, r) => { r.sendFile(join(distDir, "index.html")); });
  }
  return app;
}
