import { useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { rubles } from "../../components/Account";
import { Modal } from "../../components/ui";
import type { StaffMember } from "../../types";

export default function StaffTopUp({ member, onBalance }: { member: StaffMember; onBalance: (balance: string) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const operation = useRef<{ amount: string; reference: string } | null>(null);
  const submitting = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !received) return;
    submitting.current = true;
    setBusy(true); setError("");
    if (!operation.current) operation.current = { amount, reference: crypto.randomUUID() };
    try {
      const data = await api.post<{ balance: string }>(`/staff/members/${member.id}/topups/`, { ...operation.current, payment_received: true });
      onBalance(data.balance); setSuccess(`Зачислено ${rubles(operation.current.amount)}`); setOpen(false); setAmount(""); setReceived(false); operation.current = null;
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); submitting.current = false; }
  };
  return <section className="account-card"><h2>Счёт гостя: {rubles(member.balance)}</h2><button className="btn" onClick={() => { setOpen(true); setSuccess(""); }}>Пополнить счёт</button>{success && <p className="notice ok" role="status">{success}</p>}
    {open && <Modal title="Пополнение счёта" onClose={() => { if (!busy) setOpen(false); }}><p>{member.full_name} · {member.phone}</p><form onSubmit={submit}>
      <label className="field"><span>Сумма, ₽</span><input className="input" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required value={amount} disabled={busy || operation.current !== null} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="check"><input type="checkbox" required checked={received} disabled={busy} onChange={(e) => setReceived(e.target.checked)} />Оплата этой суммы получена на кассе</label>
      {error && <p className="error" role="alert">{error} Повторите подтверждение: одна операция зачисляется только один раз.</p>}
      <button className="btn btn-wide" disabled={busy || !received}>{busy ? "Зачисляем…" : `Подтвердить зачисление${amount ? ` ${rubles(amount)}` : ""}`}</button>
    </form></Modal>}
  </section>;
}
