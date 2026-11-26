import { useEffect, useState } from "react";
import { api } from "../../api";
import { Modal } from "../../components/ui";

type Reward = { id: number; title: string; meal: number; completed: boolean; can_complete: boolean; visit_used: boolean; invite_used: boolean };
type Desk = {
  balance: string;
  day: string;
  walkin: { day: string; price: number; visits: number; paid: boolean; in_club: boolean } | null;
  places: { guest: boolean; id: number; event__starts_at: string; event__title: string; visit_id: number | null }[];
  hosting: { id: number; title: string }[];
  rewards: Reward[];
};
type Operation = { id: number; action: string; label: string; title: string; reference?: string };

export default function StaffEventDesk({ memberId, onEntry }: { memberId: number; onEntry: (balance: string) => void }) {
  const path = `/staff/members/${memberId}/event-desk/`;
  const [desk, setDesk] = useState<Desk | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get<Desk>(path).then(setDesk).catch(e => setError(e.message));
  }, [path]);

  function button(id: number, action: string, label: string, title: string) {
    return <button className="btn btn-ghost" onClick={() => {
      setError(""); setAmount(""); setOperation({ id, action, label, title, reference: action === "food" ? crypto.randomUUID() : undefined });
    }}>{label}</button>;
  }
  async function submit() {
    if (!operation || busy) return;
    setBusy(true);
    try {
      const updated = await api.post<Desk>(path, { ...operation,
        ...(operation.action.startsWith("day") ? { day: desk?.walkin?.day, amount: desk?.walkin?.price } : {}),
        ...(operation.action === "food" ? { amount: Number(amount) } : {}) });
      setDesk(updated);
      if (["resident", "organizer", "visit", "day", "day_pack"].includes(operation.action)) onEntry(updated.balance);
      setOperation(null);
      setError("");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (!error && (!desk || !(desk.walkin || desk.places.length || desk.hosting.length || desk.rewards.length))) return null;
  return <section className="staff-guest-manage"><h2>Встречи участника</h2>
    {error && !operation && <p role="alert">{error}</p>}
    {desk?.walkin && <div><h3>Дневной вход</h3>
      {desk.walkin.paid ? <>{desk.walkin.in_club ? <p>Вход на сегодня учтён</p> : button(memberId, "day", "Отметить повторный вход", "Без доплаты в тот же день")}</> :
        <>{button(memberId, "day", `Вход со счёта · ${desk.walkin.price} токенов`, "Дневной вход")}
          {desk.walkin.visits > 0 && button(memberId, "day_pack", "Списать 1 пакетный визит", "Дневной вход")}</>}
    </div>}
    {desk?.places.map(p => <div key={p.id}><p>{new Date(p.event__starts_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} · {p.event__title} · {p.guest ? "Гостевой вход оплачен" : "Место резидента оплачено"}</p>
      {p.visit_id ? <p>Приход отмечен</p> : new Date(p.event__starts_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" }) === desk.day && button(p.id, "resident", p.guest ? "Отметить приход гостя по записи" : "Отметить приход резидента", p.event__title)}</div>)}
    {desk?.hosting.map(e => <div key={e.id}><p>{e.title}</p>{button(e.id, "organizer", "Отметить бесплатный вход организатора", e.title)}</div>)}
    {desk?.rewards.map(r => <div key={r.id}><h3>{r.title}</h3><p>Организатор пришёл. На еду осталось {r.meal} кредитов.</p>
      {r.meal > 0 && button(r.id, "food", "Оплатить заказ еды", r.title)}
      {!r.completed && r.can_complete && button(r.id, "complete", "Подтвердить проведение встречи", r.title)}
      {r.completed && !r.invite_used && button(r.id, "invite", "Провести гостя по пригласительному", r.title)}
      {r.completed && !r.visit_used && button(r.id, "visit", "Использовать дополнительный вход", r.title)}
    </div>)}
    {operation && <Modal title={operation.label} onClose={() => { if (!busy) setOperation(null); }}><p>{operation.title}</p>
      {operation.action === "food" && <label>Стоимость еды в кредитах <input className="input" type="number" min="1" max="1000" value={amount} onChange={e => setAmount(e.target.value)} /></label>}
      {error && <p role="alert">{error}</p>}
      <button className="btn" disabled={busy || (operation.action === "food" && Number(amount) <= 0)} onClick={submit}>{busy ? "Сохраняем…" : operation.action === "day" && !desk?.walkin?.paid ? "Подтвердить списание" : "Подтвердить"}</button>
    </Modal>}
  </section>;
}
