import { JsonDb } from "./db";
import { estimate, type Selection } from "../shared/pricing";

export type LeadStatus = "new" | "taken" | "done" | "rejected";
export interface Lead {
  id: number; createdAt: number; status: LeadStatus; handledBy?: string;
  name: string; contact: string; comment: string; selection: Selection; total: number; days: number;
}
interface DbShape { seq: number; leads: Lead[] }

export interface Notifier { newLead(lead: Lead): Promise<void> }

export class Leads {
  db: JsonDb<DbShape>;
  private hits = new Map<string, number[]>();

  constructor(file: string, private notifier: Notifier) { this.db = new JsonDb<DbShape>(file, { seq: 0, leads: [] }); }

  /** Не больше 5 заявок в час с одного IP */
  allowed(ip: string, limit = 5, windowMs = 3_600_000): boolean {
    const now = Date.now();
    const list = (this.hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= limit) { this.hits.set(ip, list); return false; }
    list.push(now); this.hits.set(ip, list);
    return true;
  }

  create(input: { name: string; contact: string; comment: string; selection: Selection }): Lead {
    const e = estimate(input.selection); // сумму всегда считаем на сервере, клиенту не верим
    const lead: Lead = { id: ++this.db.data.seq, createdAt: Date.now(), status: "new", ...input, total: e.total, days: e.days };
    this.db.data.leads.push(lead);
    this.db.save();
    void this.notifier.newLead(lead).catch((err) => console.error("Не удалось отправить заявку в Telegram:", err.message));
    return lead;
  }

  get(id: number) { return this.db.data.leads.find((l) => l.id === id); }
  setStatus(id: number, status: LeadStatus, by?: string) {
    const l = this.get(id);
    if (!l) return undefined;
    l.status = status; l.handledBy = status === "new" ? undefined : by;
    this.db.save();
    return l;
  }
  recent(n = 10) { return this.db.data.leads.slice(-n).reverse(); }
}
