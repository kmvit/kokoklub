import { useEffect, useState } from "react";
import { api } from "../api";

export const rubles = (value: string) => Number(value).toLocaleString("ru-RU", { style: "currency", currency: "RUB" });
type AccountData = { balance: string; topups: { id: number; amount: string; created_at: string }[] };
export default function Account() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    let active = true;
    const reload = () => api.get<AccountData>("/me/account/").then((data) => { if (active) { setAccount(data); setError(""); } }).catch((e) => { if (active) setError(e.message); });
    void reload();
    const onFocus = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => { active = false; document.removeEventListener("visibilitychange", onFocus); };
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
    <div className="account-history-panel"><h3>История пополнений</h3>
      {account && (account.topups.length === 0 ? <p className="muted">Пополнений пока нет.</p> : <ul className="account-history">{account.topups.map((item) => <li key={item.id}><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("ru-RU")}</time><strong>+{rubles(item.amount)}</strong></li>)}</ul>)}
    </div>
  </section>;
}
