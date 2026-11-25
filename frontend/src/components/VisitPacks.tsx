import { useEffect, useState } from "react";
import { api } from "../api";
import { Modal } from "./ui";

type Pack = { id: number; title: string; price: number; visits: number };
type Packs = { left: number; expires: string | null; offers: Pack[] };

export default function VisitPacks() {
  const [state, setState] = useState<Packs | null>(null);
  const [order, setOrder] = useState<(Pack & { reference: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { api.get<Packs>("/me/visit-packs/").then(setState).catch(e => setError(e.message)); }, []);
  if (!error && !state) return null;
  return <section className="card"><h2>Пакетные визиты</h2><p>Осталось визитов: {state?.left ?? 0}</p>
    {state && !state.offers.length && <p>Пакетов для покупки пока нет.</p>}
    {state?.offers.map(pack => <button key={pack.id} className="btn btn-ghost" onClick={() => setOrder({ ...pack, reference: crypto.randomUUID() })}>
      {pack.title} · {pack.visits} визитов за {pack.price} токенов
    </button>)}
    {error && <p role="alert">{error}</p>}
    {order && <Modal title="Купить пакет визитов?" onClose={() => { if (!busy) setOrder(null); }}>
      <p>{order.visits} визитов на срок действующей карты. Со счёта спишется {order.price} токенов.</p>
      <button className="btn" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { setState(await api.post<Packs>("/me/visit-packs/", order)); setOrder(null); }
        catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>Подтвердить покупку</button>{error && <p role="alert">{error}</p>}
    </Modal>}
  </section>;
}
