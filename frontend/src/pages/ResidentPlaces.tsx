import { useEffect, useState } from "react";
import { api } from "../api";
import type { ClubEvent } from "../components/EventCard";
import { Modal } from "../components/ui";

type Place = { package_sale_id: number | null; guest: boolean; visit_id: number | null; id: number; event_id: number; event__title: string; event__starts_at: string; price: number };
type State = { invites: number; guest_events: number[]; visits: number; balance: string; places: Place[] };
type Choice = { allowGuest: boolean; packAllowed: boolean; guest: boolean; extra: number; title: string; date: string; price: number; path: string; cancel: boolean };
const date = (value: string) => new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

export default function ResidentPlaces({ events, resident, onChange }: { events: ClubEvent[]; resident: boolean; onChange: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [plusGuest, setPlusGuest] = useState(false);
  const [pack, setPack] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<State>("/me/reservations/").then(setState).catch(e => setError(e.message));
  }, []);

  const enteredCode = choice?.guest && !choice.cancel ? code.trim() : "";
  const morning = choice && Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hourCycle: "h23" }).format(new Date(choice.date))) < 13;
  const quoted = pack ? 0 : choice && enteredCode ? (morning ? 500 : 750) + choice.extra : choice?.price;
  async function confirm() {
    if (!choice || busy) return;
    setBusy(true);
    setError("");
    try {
      setState(await api.post<State>(choice.path, { price: quoted, code: enteredCode, use_pack: pack, plus_guest: plusGuest }));
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setChoice(null); setCode(""); setPack(false); setPlusGuest(false);
      setBusy(false);
    }
  }

  const available = events.filter(e => (resident ? e.resident_seats > 0 && e.resident_price !== null : e.guest_seats > 0) &&
    !state?.places.some(p => p.event_id === e.id));
  if (!error && (!state || (!available.length && !state.places.length))) return null;
  return <section className="card">
    <h2>Моё место на встрече</h2>
    {state && <p>На счёте {Number(state.balance).toLocaleString("ru-RU")} токенов</p>}
    {error && <p role="alert">{error}</p>}
    {state?.places.map(p => <p key={p.id}>{p.event__title} · {date(p.event__starts_at)} · Место за вами{" "}
      {p.visit_id ? " · Приход отмечен" : <button className="btn btn-ghost" onClick={() => setChoice({ allowGuest: false, packAllowed: !!p.package_sale_id, guest: p.guest, extra: 0, title: p.event__title, date: p.event__starts_at,
        price: p.price, path: `/me/reservations/${p.id}/cancel/`, cancel: true })}>Отменить бронь</button>}</p>)}
    {state && available.map(e => <p key={e.id}>{e.title} · {date(e.starts_at)}{" "}
      <button className="btn" onClick={() => setChoice({ allowGuest: resident && e.invite_seats > 0 && state.invites > 0 && !state.guest_events.includes(e.id), packAllowed: resident && e.accepts_pack, guest: !resident, extra: e.guest_extra, title: e.title, date: e.starts_at,
        price: resident ? e.resident_price! : 1000 + e.guest_extra, path: `/events/${e.id}/reserve/`, cancel: false })}>Забронировать · {resident ? e.resident_price : 1000 + e.guest_extra} токенов</button></p>)}
    {choice && <Modal title={choice.cancel ? "Отменить бронь?" : "Забронировать место?"} onClose={() => { if (!busy) { setChoice(null); setCode(""); setPack(false); setPlusGuest(false); } }}>
      <p>{choice.title} · {date(choice.date)}</p>
      {choice.allowGuest && <label><input type="checkbox" checked={plusGuest} onChange={e => setPlusGuest(e.target.checked)} /> Добавить гостя · 1 пригласительный</label>}
      {choice.packAllowed && !choice.cancel && !!state?.visits && <label><input type="checkbox" checked={pack} onChange={e => setPack(e.target.checked)} /> Использовать один визит из пакета · осталось {state.visits}</label>}
      {choice.guest && !choice.cancel && <label>Промокод организатора, если есть<input className="input" value={code} onChange={e => setCode(e.target.value)} /></label>}
      {choice.guest && <p>При самостоятельной отмене гостевой брони токены не возвращаются.</p>}
      <p>{pack ? "Спишется один пакетный визит." : choice.cancel && choice.packAllowed ? "При отмене больше чем за 24 часа вернётся один визит." : choice.cancel && choice.guest ? "Место будет освобождено." : choice.cancel ? `При отмене больше чем за 24 часа до начала на счёт вернётся ${choice.price} токенов. Позже место освободится без возврата.` :
        `За ваше место спишется ${quoted} токенов.`}</p>
      <button className="btn" disabled={busy} onClick={confirm}>{choice.cancel ? "Отменить место" : "Подтвердить бронь"}</button>
    </Modal>}
  </section>;
}
