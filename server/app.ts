import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Leads } from "./leads";
import { validateSelection } from "../shared/pricing";

export function createApp(leads: Leads, distDir: string, trustProxy = false) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);
  app.use(express.json({ limit: "20kb" }));
  app.get("/health", (_q, r) => { r.json({ ok: true }); });

  app.post("/api/lead", (req, res) => {
    const b = req.body ?? {};
    // ловушка для ботов: настоящий человек это поле не видит и не заполняет
    if (typeof b.website === "string" && b.website.trim() !== "") { res.json({ ok: true, id: 0 }); return; }

    const selection = validateSelection(b.selection);
    const name = typeof b.name === "string" ? b.name.trim() : "";
    const contact = typeof b.contact === "string" ? b.contact.trim() : "";
    const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 500) : "";
    if (!selection) { res.status(400).json({ error: "Выберите, что нужно сделать" }); return; }
    if (name.length < 2 || name.length > 60) { res.status(400).json({ error: "Укажите имя" }); return; }
    if (contact.length < 3 || contact.length > 80) { res.status(400).json({ error: "Укажите Telegram или телефон" }); return; }
    if (!leads.allowed(req.ip ?? "unknown")) { res.status(429).json({ error: "Слишком много заявок, попробуйте позже" }); return; }

    const lead = leads.create({ name, contact, comment, selection });
    res.json({ ok: true, id: lead.id });
  });

  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (_q, r) => { r.sendFile(join(distDir, "index.html")); });
  }
  return app;
}
