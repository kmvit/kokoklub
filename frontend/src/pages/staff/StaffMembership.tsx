import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Modal } from "../../components/ui";

type Tariff = { name: string; price: number; due: number; days: number };
type Status = { in_club: boolean; balance: string; expires: string | null; tariffs: Record<string, Tariff>; active_tariff: string | null; invites_left: number; entry_id: number | null; legacy: boolean };


export default function StaffMembership({ memberId, hasCard, onSale }: { memberId: number; hasCard: boolean; onSale: (balance: string, inClub: boolean) => void }) {
  const url = `/staff/members/${memberId}/membership/`;
  const [status, setStatus] = useState<Status | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Status>(url).then(setStatus).catch(e => setError(e.message));
  }, [url]);

  const tariff = action ? status?.tariffs[action] : undefined;

  async function confirm() {
    if (!status || !tariff || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.post<Status>(url, { action, paid: tariff.due, entry_id: status.entry_id });
      setStatus(next);
      onSale(next.balance, next.in_club);
      setAction(null);
    } catch (e) {
      setError((e as Error).message);
      setAction(null);
    } finally {
      setBusy(false);
    }
  }

  return <section className="staff-guest-manage">
    <h2>Клубные карты</h2>
    {error && <p role="alert" className="error">{error}</p>}
    {status?.expires && <p>Карта «{status.active_tariff}» действует до {new Date(status.expires).toLocaleDateString("ru-RU")}. Осталось пригласительных: {status.invites_left}.</p>}
    {status?.expires && <Link className="btn" to={`/staff/bind?member=${memberId}`}>{hasCard ? "Перевыпустить карту" : "Привязать карту"}</Link>}
    {status && !status.expires && <>
      {status.entry_id && <p>Оплаченный вход учтён в цене карты.</p>}
      <details className="cashier-fold"><summary>Выбрать тариф</summary><div>
      {Object.entries(status.tariffs).map(([code, option]) =>
        <button key={code} className="btn" onClick={() => setAction(code)}>
          Оформить карту «{option.name}» · {option.due.toLocaleString("ru-RU")} ₽
        </button>)}
      </div></details>
    </>}
    {tariff && <Modal title="Подтвердить оплату на кассе?" onClose={() => { if (!busy) setAction(null); }}>
      <p>Карта «{tariff.name}» на {tariff.days} дн. · {tariff.due.toLocaleString("ru-RU")} ₽</p>
      <p>Сегодняшний вход входит в стоимость карты. После оплаты гость появится в списке «Сейчас в клубе».</p>
      <button className="btn primary" disabled={busy} onClick={confirm}>Оплата получена</button>
    </Modal>}
  </section>;
}
