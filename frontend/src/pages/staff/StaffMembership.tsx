import { useEffect, useState } from "react";
import { api } from "../../api";
import { Modal } from "../../components/ui";

type Tariff = { name: string; price: number; due: number; days: number };
type Status = { balance: string; expires: string | null; tariffs: Record<string, Tariff>; active_tariff: string | null; invites_left: number; entry_id: number | null; entry_price: number; due: number; legacy: boolean };


export default function StaffMembership({ memberId, onEntry, onBalance }: { memberId: number; onEntry: () => void; onBalance: (balance: string) => void }) {
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
    if (!status || !action || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.post<Status>(url, { action, paid: tariff?.due ?? status.entry_price, entry_id: status.entry_id });
      setStatus(next);
      onBalance(next.balance);
      if (action === "entry" && next.entry_id) onEntry();
      setAction(null);
    } catch (e) {
      setError((e as Error).message);
      setAction(null);
    } finally {
      setBusy(false);
    }
  }

  if (status?.legacy) return null;
  return <section className="staff-guest-manage">
    <h2>Вход и членство</h2>
    {error && <p role="alert" className="error">{error}</p>}
    {status?.expires && <p>Карта «{status.active_tariff}» действует до {new Date(status.expires).toLocaleDateString("ru-RU")}. Осталось пригласительных: {status.invites_left}.</p>}
    {status && !status.expires && <>
      {status.entry_id ? <p>Оплаченный вход учтён в цене карты.</p> :
        <button className="btn btn-ghost" onClick={() => setAction("entry")}>Отметить гостевой вход · {status.entry_price} ₽</button>}
      {Object.entries(status.tariffs).map(([code, option]) =>
        <button key={code} className="btn" onClick={() => setAction(code)}>
          Оформить карту «{option.name}» · {option.due.toLocaleString("ru-RU")} ₽
        </button>)}
    </>}
    {action && status && <Modal title="Подтвердить оплату на кассе?" onClose={() => { if (!busy) setAction(null); }}>
      <p>{action === "entry" ? "Гостевой вход" : `Карта «${tariff?.name}» на ${tariff?.days} дн.`} · {action === "entry" ? status.entry_price : tariff?.due} ₽</p>
      <button className="btn" disabled={busy} onClick={confirm}>Оплата получена</button>
    </Modal>}
  </section>;
}
