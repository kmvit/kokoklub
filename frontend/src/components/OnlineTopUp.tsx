import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export default function OnlineTopUp() {
  const { me } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (busy || !me) return;
    setBusy(true);
    setError("");
    const key = `koko-checkout-${me.id}-${Number(amount)}`;
    try {
      const reference = sessionStorage.getItem(key) || crypto.randomUUID();
      sessionStorage.setItem(key, reference);
      const result = await api.post<{ payment_url: string }>("/me/payments/tbank/", { amount: Number(amount), reference });
      sessionStorage.removeItem(key);
      window.location.assign(result.payment_url);
    } catch (e) {
      setError((e as Error).message);
      if ([409, 502].includes((e as { status?: number }).status ?? 0)) sessionStorage.removeItem(key);
      setBusy(false);
    }
  }
  return <form className="form" onSubmit={pay}>
    <label>Сумма онлайн-пополнения, ₽<input className="input" type="number" min="1" max="1000000" step="1" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
    <button className="btn" disabled={busy}>Перейти к оплате в Т-Банке</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}
