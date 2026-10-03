import { useMemo, useState } from "react";
import { TYPES, URGENCY, estimate, money, type Selection, type TypeId, type UrgencyId } from "../../shared/pricing";
import { useTween } from "./useTween";

type Phase = { name: "form" } | { name: "sending" } | { name: "done"; id: number } | { name: "error"; message: string };

const PHASES = [
  { title: "Дизайн и план", share: 0.2 },
  { title: "Разработка", share: 0.6 },
  { title: "Тесты и запуск", share: 0.2 },
];

export default function App() {
  const [types, setTypes] = useState<TypeId[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [urgency, setUrgency] = useState<UrgencyId>("normal");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState(""); // ловушка для ботов
  const [phase, setPhase] = useState<Phase>({ name: "form" });

  // убираем функции тех направлений, которые сняли
  const activeFeatures = useMemo(() => {
    const allowed = new Set(TYPES.filter((t) => types.includes(t.id)).flatMap((t) => t.features.map((f) => f.id)));
    return features.filter((f) => allowed.has(f));
  }, [types, features]);

  const selection: Selection = { types, features: activeFeatures, urgency };
  const est = useMemo(() => estimate(selection), [types, activeFeatures, urgency]);
  const total = useTween(est.total);
  const days = useTween(est.days);
  const empty = types.length === 0;

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (empty) return setPhase({ name: "error", message: "Выберите хотя бы одно направление" });
    setPhase({ name: "sending" });
    try {
      const res = await fetch("/api/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, name, contact, comment, website }),
      });
      // при сбое прокси или перезапуске сервера ответ может прийти не в JSON
      const data = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
      if (!res.ok || typeof data.id !== "number") throw new Error(data.error ?? "Не удалось отправить заявку, попробуйте ещё раз");
      setPhase({ name: "done", id: data.id });
    } catch (err) {
      setPhase({ name: "error", message: (err as Error).message });
    }
  }

  function reset() {
    setTypes([]); setFeatures([]); setUrgency("normal"); setName(""); setContact(""); setComment(""); setPhase({ name: "form" });
  }

  return (
    <>
      <header className="band">
        <div className="wrap bar">
          <a className="logo" href="https://caravanhouse.uz" aria-label="CaravanHouse — на главный сайт">
            <img src="/emblem.png" alt="" width={44} height={32} />
            <span>Caravan<b>House</b></span>
          </a>
          <span className="tag">боты · сайты · мини-аппы</span>
          <a className="site" href="https://caravanhouse.uz">caravanhouse.uz ↗</a>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <h1>Соберите проект — смета появится сразу</h1>
          <p>Отметьте, что нужно сделать, и посмотрите примерную стоимость и срок. Понравится — оставьте контакт, мы свяжемся и уточним детали.</p>
        </section>

        {phase.name === "done" ? (
          <section className="done" role="status">
            <h2>Заявка №{phase.id} отправлена</h2>
            <p>Мы получили её в Telegram и напишем вам по указанному контакту.</p>
            <p className="soft">Вы запросили: {TYPES.filter((t) => types.includes(t.id)).map((t) => t.title).join(" + ")}, примерно {money(est.total)} и {est.days} дн.</p>
            <button className="primary" onClick={reset}>Собрать ещё один проект</button>
          </section>
        ) : (
          <div className="layout">
            <form onSubmit={submit} className="steps">
              <fieldset>
                <legend>Что нужно сделать</legend>
                <div className="types">
                  {TYPES.map((t) => (
                    <label key={t.id} className={types.includes(t.id) ? "card on" : "card"}>
                      <input type="checkbox" checked={types.includes(t.id)} onChange={() => setTypes(toggle(types, t.id))} />
                      <b>{t.title}</b><span>{t.tagline}</span><em>от {money(t.base)}</em>
                    </label>
                  ))}
                </div>
                {types.length >= 2 && <p className="note">Скидка 10% за комплексный заказ уже учтена.</p>}
              </fieldset>

              {!empty && (
                <fieldset>
                  <legend>Нужные функции</legend>
                  {TYPES.filter((t) => types.includes(t.id)).map((t) => (
                    <div key={t.id} className="group">
                      <h3>{t.title}</h3>
                      <ul>
                        {t.features.map((f) => (
                          <li key={f.id}>
                            <label>
                              <input type="checkbox" checked={activeFeatures.includes(f.id)} onChange={() => setFeatures(toggle(features, f.id))} />
                              <span>{f.title}</span><em>+{money(f.price)}</em>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </fieldset>
              )}

              <fieldset>
                <legend>Сроки</legend>
                <div className="radios">
                  {(Object.keys(URGENCY) as UrgencyId[]).map((u) => (
                    <label key={u} className={urgency === u ? "chip on" : "chip"}>
                      <input type="radio" name="urgency" checked={urgency === u} onChange={() => setUrgency(u)} />{URGENCY[u].title}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Как с вами связаться</legend>
                <div className="fields">
                  <label>Имя<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" /></label>
                  <label>Telegram или телефон<input value={contact} onChange={(e) => setContact(e.target.value)} required minLength={3} maxLength={80} placeholder="@username или +998…" /></label>
                  <label className="full">Что важно учесть (необязательно)<textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} /></label>
                  <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
                </div>
                {phase.name === "error" && <p className="err" role="alert">{phase.message}</p>}
                <button className="primary" type="submit" disabled={phase.name === "sending" || empty}>
                  {phase.name === "sending" ? "Отправляю…" : empty ? "Выберите направление" : "Отправить заявку"}
                </button>
              </fieldset>
            </form>

            <aside className="estimate" aria-live="polite">
              <p className="label">Примерная стоимость</p>
              <p className="price">{empty ? "—" : money(Math.round(total / 10_000) * 10_000)}</p>
              <p className="range">{empty ? "Выберите направление слева" : `до ${money(est.totalMax)} с учётом уточнений`}</p>

              {!empty && (
                <>
                  <p className="label">Срок</p>
                  <p className="days">≈ {Math.round(days)} рабочих дней</p>
                  <div className="timeline" aria-hidden="true">
                    {PHASES.map((p) => <i key={p.title} style={{ flex: p.share }} />)}
                  </div>
                  <ul className="phases">
                    {PHASES.map((p) => <li key={p.title}><span>{p.title}</span><b>{Math.max(1, Math.round(est.days * p.share))} дн.</b></li>)}
                  </ul>
                  <details>
                    <summary>Из чего складывается</summary>
                    <ul className="lines">
                      {est.lines.map((l, i) => <li key={i}><span>{l.title}</span><b>{money(l.price)}</b></li>)}
                      {est.discount > 0 && <li><span>Скидка за комплекс</span><b>−{money(est.discount)}</b></li>}
                    </ul>
                  </details>
                </>
              )}
              <p className="fine">Это ориентир, а не оферта. Точную цену назовём после короткого разговора.</p>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
