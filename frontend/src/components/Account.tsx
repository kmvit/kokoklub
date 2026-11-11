import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export const rubles = (value: string) => Number(value).toLocaleString("ru-RU", { style: "currency", currency: "RUB" });
type AccountData = { balance: string; topups: { id: number; amount: string; created_at: string }[] };
const BALANCE_REFRESH_MS = 10_000;

export default function Account({ compact = false }: { compact?: boolean }) {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const reload = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const data = await api.get<AccountData>("/me/account/");
        if (active) {
          setAccount(data);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        inFlight = false;
      }
    };
    void reload();
    const timer = window.setInterval(reload, BALANCE_REFRESH_MS);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reload);
    };
  }, []);
  return <section className="card account-card member-account" aria-label="Клубный счёт">
    <div className="balance-card">
      <div className="balance-card-header"><h2>Мой счёт</h2><span className="balance-wordmark" aria-hidden="true">коко ↗</span></div>
      {error && <p className="error" role="alert">{error}</p>}
      {account ? <>
        <p className="balance-label">Доступно на клубном счёте</p><p className="account-balance">{rubles(account.balance)}</p>
        <button className="btn" onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp}>Пополнить счёт</button>
        {showHelp && <div className="notice">Подойдите к сотруднику клуба и приложите NFC-карту к ридеру. Назовите сумму и оплатите её на кассе. Сотрудник подтвердит пополнение, и деньги появятся на вашем счёте.</div>}
      </> : !error && <p className="muted">Загрузка счёта…</p>}
    </div>
    <div className="account-history-panel">{compact ? <Link className="link" to="/me">История пополнений →</Link> : <><h3>История пополнений</h3>
      {account && (account.topups.length === 0 ? <p className="muted">Пополнений пока нет.</p> : <ul className="account-history">{account.topups.map((item) => <li key={item.id}><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("ru-RU")}</time><strong>+{rubles(item.amount)}</strong></li>)}</ul>)}
    </>}</div>
  </section>;
}
