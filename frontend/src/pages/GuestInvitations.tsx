import { useEffect, useState } from "react";
import { api } from "../api";
import type { ClubEvent } from "../components/EventCard";
import { Modal } from "../components/ui";

type Invitations = {
  pack_visits: number;
  left: number;
  expires: string | null;
  bookings: { id: number; event_id: number; arrived_at: string | null; payment: string; price: number }[];
};

export default function GuestInvitations({ events, onChange }: { events: ClubEvent[]; onChange: () => void }) {
  const [state, setState] = useState<Invitations | null>(null);
  const [selected, setSelected] = useState<ClubEvent | null>(null);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState("invite");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get<Invitations>("/me/invitations/").then(setState).catch(e => setError(e.message));
  }, []);

  const bookingFor = (id: number) => state?.bookings.find(b => b.event_id === id);
  const booking = selected && bookingFor(selected.id);
  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const path = booking ? `/me/invitations/${booking.id}/cancel/` : `/events/${selected.id}/guest-place/`;
      setState(await api.post<Invitations>(path, { payment, price: selected.resident_price }));
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSelected(null);
      setBusy(false);
    }
  }
  if (error && !state) return <p role="alert">{error}</p>;
  if (!state || (!state.expires && !state.bookings.length)) return null;
  const available = events.filter(event => bookingFor(event.id) ||
    (event.invite_seats > 0 && state.expires && Date.parse(event.starts_at) < Date.parse(state.expires)));
  return <section className="card">
    <h2>Гостевые пригласительные</h2>
    <p>Осталось на карте: {state.left}</p>
    {error && <p role="alert">{error}</p>}
    {available.map(event => <p key={event.id}>
      {bookingFor(event.id)?.arrived_at ? <span>Гость пришёл · {event.title}</span> : <button className="btn btn-ghost" disabled={!bookingFor(event.id) && !state.left && !(event.accepts_pack && state.pack_visits) && event.resident_price === null} onClick={() => {
        setPayment(state.left ? "invite" : event.accepts_pack && state.pack_visits ? "pack" : "tokens");
        setSelected(event);
      }}>
        {bookingFor(event.id) ? "Отменить гостевое место" : "Пригласить гостя"} · {event.title} · {new Date(event.starts_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}
      </button>}
    </p>)}
    {selected && <Modal title={booking ? "Отменить гостевое место?" : "Забронировать место для гостя?"} onClose={() => { if (!busy) setSelected(null); }}>
      <p>{selected.title}</p>
      {booking ? <p>При отмене больше чем за 24 часа вернётся {booking.payment === "invite" ? "один пригласительный" : booking.payment === "pack" ? "один пакетный визит" : `${booking.price} токенов`}.</p> :
        <label>За место гостя <select value={payment} onChange={e => setPayment(e.target.value)}>
          {state.left > 0 && <option value="invite">1 включённый пригласительный</option>}
          {selected.accepts_pack && state.pack_visits > 0 && <option value="pack">1 пакетный визит</option>}
          {selected.resident_price !== null && <option value="tokens">{selected.resident_price} токенов</option>}
        </select></label>}
      <button className="btn" disabled={busy} onClick={confirm}>{booking ? "Отменить место" : "Подтвердить бронь"}</button>
    </Modal>}
  </section>;
}
