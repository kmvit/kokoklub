import { useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api";
import { rubles } from "../../components/Account";
import { Modal } from "../../components/ui";
import type { StaffMember } from "../../types";

type PendingTopUp = { amount: string; reference: string };
const storageError = "Не удалось открыть сохранённые пополнения. Проверьте, что браузер разрешает сайту хранить данные.";

function readPending(key: string): PendingTopUp | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  const pending = JSON.parse(raw) as Partial<PendingTopUp> | null;
  if (typeof pending?.amount !== "string" || typeof pending.reference !== "string") {
    throw new Error(storageError);
  }
  return { amount: pending.amount, reference: pending.reference };
}

function clearPending(key: string, reference: string) {
  if (readPending(key)?.reference === reference) localStorage.removeItem(key);
}

export default function StaffTopUp({ member, cashierId, onBalance }: {
  member: StaffMember;
  cashierId: number;
  onBalance: (balance: string) => void;
}) {
  const key = `koko:topup:v1:${cashierId}:${member.id}`;
  const [pending, setPending] = useState<PendingTopUp | null>(() => {
    try { return readPending(key); } catch { return null; }
  });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const submitting = useRef(false);

  const openForm = () => {
    setSuccess("");
    setError("");
    try {
      setPending(readPending(key));
      setOpen(true);
    } catch {
      setError(storageError);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || (!pending && !received)) return;
    submitting.current = true;
    setBusy(true);
    setError("");

    try {
      let operation: PendingTopUp;
      try {
        const saved = readPending(key);
        if (saved && saved.reference !== pending?.reference) {
          setPending(saved);
          return;
        }
        operation = saved ?? pending ?? { amount, reference: crypto.randomUUID() };
        // Save before sending: the server may commit even if this page never sees the reply.
        if (!saved) localStorage.setItem(key, JSON.stringify(operation));
        setPending(operation);
      } catch {
        setError("Не удалось сохранить пополнение в браузере. Запрос не отправлен.");
        return;
      }

      try {
        const data = await api.post<{ id: number; balance: string }>(
          `/staff/members/${member.id}/topups/`,
          { ...operation, payment_received: true },
        );
        if (!Number.isInteger(data.id) || typeof data.balance !== "string") {
          throw new Error("Сайт не получил подтверждение зачисления.");
        }
        clearPending(key, operation.reference);
        setPending(null);
        onBalance(data.balance);
        setSuccess(`Зачислено ${rubles(operation.amount)}`);
        setOpen(false);
        setAmount("");
        setReceived(false);
      } catch (e) {
        if (e instanceof ApiError && e.status === 400) {
          // The server validates before writing, so the cashier can correct the amount.
          try {
            clearPending(key, operation.reference);
            setPending(null);
            setAmount(operation.amount);
            setReceived(false);
          } catch {
            setError(storageError);
            return;
          }
        }
        setError(e instanceof ApiError ? e.message : "Сайт не получил подтверждение зачисления.");
      }
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };

  const shownAmount = pending?.amount ?? amount;
  return (
    <section className="account-card">
      <h2>Счёт гостя: {rubles(member.balance)}</h2>
      <button className="btn" onClick={openForm}>
        {pending ? "Продолжить пополнение" : "Пополнить счёт"}
      </button>
      {success && <p className="notice ok" role="status">{success}</p>}
      {!open && error && <p className="error" role="alert">{error}</p>}
      {open && (
        <Modal title="Пополнение счёта" onClose={() => { if (!busy) { setOpen(false); setError(""); } }}>
          <p>{member.full_name} · {member.phone}</p>
          <form onSubmit={submit}>
            <label className="field">
              <span>Сумма, ₽</span>
              <input className="input" type="number" inputMode="decimal" min="0.01" max="1000000"
                step="0.01" required value={shownAmount} disabled={busy || !!pending}
                onChange={(e) => setAmount(e.target.value)} />
            </label>
            {pending ? (
              <p className="notice">Оплата уже подтверждена кассиром. Повторите подтверждение, чтобы получить результат этой операции. Повтор не создаст второго зачисления.</p>
            ) : (
              <label className="check">
                <input type="checkbox" required checked={received} disabled={busy}
                  onChange={(e) => setReceived(e.target.checked)} />
                Оплата этой суммы получена на кассе
              </label>
            )}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-wide" disabled={busy || (!pending && !received)}>
              {busy ? "Зачисляем…" : `${pending ? "Повторить подтверждение" : "Подтвердить зачисление"}${shownAmount ? ` ${rubles(shownAmount)}` : ""}`}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
