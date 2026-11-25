import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import OnlineTopUp from "./OnlineTopUp";
import { api } from "../api";

export const rubles = (value: string) => Number(value).toLocaleString("ru-RU", { style: "currency", currency: "RUB" });
type BookingRow = { payment?: string; package_sale_id?: number | null; id: number; event__title: string; price: number };
type AccountData = {
  gifts: {id:number; amount:number; redeemed_at:string}[];
  merch: {id:number; title:string; price:number; created_at:string}[]; walkins: { id: number; price: number; created_at: string; package_sale_id: number | null }[]; membership: { expires: string | null; active_tariff: string | null; entry_id: number | null; tariffs: Record<string, { name: string; due: number }> };
  organizer_rewards: { id: number; title: string; meal: number; completed: boolean; invite_used: boolean; visit_used: boolean }[]; guest_charges: (BookingRow & {created_at: string})[]; guest_refunds: (BookingRow & {cancelled_at: string})[]; online_enabled: boolean; online: { order_id: string; confirmed_at: string | null; amount: number; status: string; needs_review: boolean }[]; packs: { id: number; price: number; visits: number; created_at: string }[];
  card_grants: { id: number; credit_grant: number; starts_at: string }[]; recordings: { id: number; recording__title: string; created_at: string; price: number }[]; charges: (BookingRow & { created_at: string })[]; refunds: (BookingRow & { cancelled_at: string })[]; balance: string; topups: { id: number; amount: string; created_at: string }[] };
function resource(row: BookingRow) {
  return row.payment === "invite" ? " · 1 пригласительный" : row.payment === "pack" || row.package_sale_id ? " · 1 пакетный визит" : "";
}
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
  const history = account && !compact ? [
    ...account.gifts.map(x => ({key:`gift-${x.id}`, date:x.redeemed_at, label:"Подарочная карта", amount:x.amount})),
    ...account.merch.map(x => ({key:`merch-${x.id}`, date:x.created_at, label:x.title, amount:-x.price})),
    ...account.topups.map(x => ({ key: `topup-${x.id}`, date: x.created_at, label: "Пополнение", amount: Number(x.amount) })),
    ...account.online.flatMap(x => x.confirmed_at ? [{ key: x.order_id, date: x.confirmed_at, label: "Пополнение · Т-Банк", amount: x.amount }] : []),
    ...account.walkins.map(x => ({ key: `walk-${x.id}`, date: x.created_at, label: x.package_sale_id ? "Вход · 1 пакетный визит" : "Вход резидента", amount: -x.price })),
    ...account.packs.map(x => ({ key: `pack-${x.id}`, date: x.created_at, label: `Пакет · ${x.visits} визитов`, amount: -x.price })),
    ...account.card_grants.map(x => ({ key: `grant-${x.id}`, date: x.starts_at, label: "Кредиты по тарифу", amount: x.credit_grant })),
    ...account.recordings.map(x => ({ key: `media-${x.id}`, date: x.created_at, label: `Запись · ${x.recording__title}`, amount: -x.price })),
    ...account.guest_charges.map(x => ({ key: `guest-${x.id}`, date: x.created_at, label: `Гостевое место · ${x.event__title}${resource(x)}`, amount: -x.price })),
    ...account.guest_refunds.map(x => ({ key: `guest-refund-${x.id}`, date: x.cancelled_at, label: `Возврат за гостя · ${x.event__title}${resource(x)}`, amount: x.price })),
    ...account.charges.map(x => ({ key: `book-${x.id}`, date: x.created_at, label: `Бронь · ${x.event__title}${resource(x)}`, amount: -x.price })),
    ...account.refunds.map(x => ({ key: `refund-${x.id}`, date: x.cancelled_at, label: `Возврат · ${x.event__title}${resource(x)}`, amount: x.price })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 100) : [];
  return <section className="card account-card member-account" aria-label="Клубный счёт">
    <div className="balance-card">
      <div className="balance-card-header"><h2>Мой счёт</h2><span className="balance-wordmark" aria-hidden="true">коко ↗</span></div>
      {error && <p className="error" role="alert">{error}</p>}
      {account ? <>
        <p className="balance-label">Доступно на клубном счёте</p><p className="account-balance">{rubles(account.balance)}</p>
        <button className="btn" onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp}>Пополнить счёт</button>
        {showHelp && account.online_enabled && <OnlineTopUp />}
        {!compact && account.online.some(x => !x.confirmed_at && ["NEW", "AUTHORIZED", "FORM_SHOWED"].includes(x.status)) && <p role="status">Есть онлайн-платёж, ожидающий подтверждения банка.</p>}
        {showHelp && <div className="notice">Подойдите к сотруднику клуба и приложите NFC-карту к ридеру. Назовите сумму и оплатите её на кассе. Сотрудник подтвердит пополнение, и деньги появятся на вашем счёте.</div>}
      </> : !error && <p className="muted">Загрузка счёта…</p>}
    </div>
    {!compact && account && <>
      {account.membership.expires && <p>Карта «{account.membership.active_tariff}» до {new Date(account.membership.expires).toLocaleDateString("ru-RU")}</p>}
      {account.membership.entry_id && !account.membership.expires && <details><summary>Зачесть сегодняшний вход в карту</summary>
        {Object.entries(account.membership.tariffs).map(([code, t]) => <p key={code}>«{t.name}» · доплата на кассе {t.due} ₽</p>)}</details>}
      {account.organizer_rewards.map(r => <section key={r.id}><h3>{r.title}</h3><p>На еду: {r.meal} кредитов</p>
        {r.completed && <p>Пригласительный: {r.invite_used ? "использован" : "доступен"} · Личный вход: {r.visit_used ? "использован" : "доступен"}</p>}</section>)}
    </>}
    <div className="account-history-panel">{compact ? <Link className="link" to="/me">История операций →</Link> : <><h3>История операций</h3>
      {account && (history.length === 0 ? <p className="muted">Операций пока нет.</p> : <ul className="account-history">{history.map((item) => <li key={item.key}><span>{item.label}</span><time dateTime={item.date}>{new Date(item.date).toLocaleString("ru-RU")}</time><strong>{item.amount > 0 && "+"}{item.amount !== 0 && rubles(String(item.amount))}</strong></li>)}</ul>)}
    </>}</div>
  </section>;
}
