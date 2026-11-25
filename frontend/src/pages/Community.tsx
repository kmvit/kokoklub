import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Modal } from "../components/ui";

type Post = { id: number; kind: string; text: string; author: string; author_id: number; yes: number; no: number; vote: boolean | null };
type Recording = { id: number; title: string; price: number; url: string | null };
const kinds: Record<string, string> = { note: "Обсуждение", offer: "Свои для своих", poll: "Голосование" };

export default function Community() {
  const { me } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [records, setRecords] = useState<Recording[]>([]);
  const [selected, setSelected] = useState<Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.get<Recording[]>("/recordings/").then(rows => { if (active) setRecords(rows); }).catch(e => { if (active) setError(e.message); });
    if (me?.is_member) api.get<Post[]>("/feed/").then(rows => { if (active) setPosts(rows); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [me?.id, me?.is_member]);

  async function update(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    return update(async () => {
      await api.post("/feed/", Object.fromEntries(new FormData(form))); form.reset();
      setPosts(await api.get<Post[]>("/feed/"));
    });
  }
  return <div className="page narrow"><h1>Онлайн-клуб</h1>
    {error && <p role="alert">{error}</p>}
    <section className="card"><h2>Записи клуба</h2>
      {!records.length && <p>Пока нет опубликованных записей.</p>}
      {records.map(r => <p key={r.id}>{r.title} · {r.url ?
        <a className="link" href={r.url} target="_blank" rel="noreferrer">Открыть запись</a> :
        <button className="btn" onClick={() => setSelected(r)}>Купить за {r.price} токенов</button>}</p>)}
    </section>
    {selected && <Modal title="Купить запись?" onClose={() => { if (!busy) setSelected(null); }}>
      <p>{selected.title} · {selected.price} токенов с клубного счёта</p>
      <button className="btn" disabled={busy} onClick={() => update(async () => {
        const record = selected; setSelected(null);
        const result = await api.post<{ url: string }>(`/recordings/${record.id}/purchase/`, { price: record.price });
        setRecords(rows => rows.map(r => r.id === record.id ? { ...r, url: result.url } : r));
      })}>Подтвердить покупку</button>
    </Modal>}
    {me?.is_member && <section><h2>Лента резидентов</h2>
      <form className="card form" onSubmit={publish}><label>Формат <select name="kind">{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Публикация<textarea className="input" name="text" required maxLength={2400} /></label>
        <button className="btn" disabled={busy}>Опубликовать</button></form>
      {posts.map(p => <article key={p.id} className="card"><p>{kinds[p.kind]} · <Link to={`/people/${p.author_id}`}>{p.author}</Link></p>
        <p className="pre">{p.text}</p>
        {p.kind === "offer" && p.author_id !== me.id && <Link to={`/people/${p.author_id}`}>Связаться с автором</Link>}
        {p.kind === "poll" && [true, false].map(support => <button key={String(support)} className="btn btn-ghost" aria-pressed={p.vote === support} disabled={busy} onClick={() => update(async () => {
          await api.post(`/feed/${p.id}/vote/`, { support }); setPosts(await api.get<Post[]>("/feed/"));
        })}>{support ? `За · ${p.yes}` : `Против · ${p.no}`}{p.vote === support && " ✓"}</button>)}
      </article>)}
    </section>}
  </div>;
}
