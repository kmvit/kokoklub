import { useEffect, useState } from "react";
import { api } from "../../api";

type Arrival = { can_check_in: boolean; id: number; event__title: string; event__starts_at: string; arrived_at: string | null };
const time = (value: string) => new Date(value).toLocaleTimeString("ru-RU", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
});

export default function StaffGuestArrivals({ memberId }: { memberId: number }) {
  const path = `/staff/members/${memberId}/guest-arrivals/`;
  const [bookings, setBookings] = useState<Arrival[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get<Arrival[]>(path + "?scope=upcoming").then(setBookings).catch(e => setMessage(e.message));
  }, [path]);

  async function admit(id: number) {
    setBusy(true);
    try {
      const result = await api.post<{ arrived_at: string; already_arrived: boolean }>(`${path}${id}/`);
      setBookings(rows => rows.map(row => row.id === id ? { ...row, arrived_at: result.arrived_at } : row));
      setMessage(result.already_arrived ? "По этому пригласительному уже прошли." : "Приход гостя отмечен.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!bookings.length && !message) return null;
  return <section className="staff-guest-manage">
    <h2>Гостевые места резидента</h2>
    {bookings.map(row => <div key={row.id}>
      <p>{new Date(row.event__starts_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} · {row.event__title}</p>
      {row.arrived_at ? <p>Гость прошёл в {time(row.arrived_at)}</p> : row.can_check_in &&
        <button className="btn" disabled={busy} onClick={() => admit(row.id)}>Отметить приход гостя</button>}
    </div>)}
    {message && <p role="status">{message}</p>}
  </section>;
}
