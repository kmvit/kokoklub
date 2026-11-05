import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Avatar } from "../../components/ui";
import { formatPhone, type StaffMember } from "../../types";
import { useCardReader } from "../../useCardReader";
import { useNfcReader } from "../../useNfcReader";

export default function BindCard() {
  const [params, setParams] = useSearchParams();
  const memberId = params.get("member");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffMember[]>([]);
  const [searching, setSearching] = useState(false);
  const [member, setMember] = useState<StaffMember | null>(null);
  const [uid, setUid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const nfc = useNfcReader();

  useEffect(() => {
    setDone(false);
    setUid("");
    if (!memberId) {
      setMember(null);
      return;
    }
    setMember(null);
    let active = true;
    api.get<StaffMember>(`/staff/members/${memberId}/`)
      .then((m) => { if (active) { setMember(m); setError(""); } })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [memberId]);

  useEffect(() => {
    if (memberId || !query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setResults([]);
    setSearching(true);
    let active = true;
    const timer = window.setTimeout(() => {
      api.get<StaffMember[]>(`/staff/members/?q=${encodeURIComponent(query.trim())}`)
        .then((list) => { if (active) { setResults(list); setError(""); setSearching(false); } })
        .catch((e) => { if (active) { setError(e.message); setSearching(false); } });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [memberId, query]);

  useCardReader((value) => {
    setUid(value);
    setError("");
  }, !!member && !busy && !done);

  const choose = (m: StaffMember) => {
    setUid("");
    setDone(false);
    setError("");
    setParams({ member: String(m.id) });
  };

  const bind = async (e: FormEvent) => {
    e.preventDefault();
    if (!member || !uid.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.post<StaffMember>(`/staff/members/${member.id}/card/`, { uid });
      setMember(updated);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bind-page">
      <h1>Привязать карту гостю</h1>
      {!memberId && (
        <>
          <label className="field">
            <span>Найдите гостя по имени или телефону</span>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя или телефон" autoFocus />
          </label>
          {results.length > 0 && <div className="card list bind-results">
            {results.map((m) => <button className="list-row bind-result" key={m.id} onClick={() => choose(m)}>
              <Avatar name={m.full_name || "Гость"} photo={m.photo} size={48} />
              <span><strong>{m.full_name || "Без имени"}</strong><br /><span className="muted small">{formatPhone(m.phone)}</span></span>
              <span className="bind-result-arrow">→</span>
            </button>)}
          </div>}
          {searching && <p className="muted">Ищем гостя…</p>}
          {query.trim() && !searching && results.length === 0 && !error && <p className="muted">Гость не найден. Можно создать его в разделе «Гости и карты».</p>}
        </>
      )}
      {member && !done && (
        <>
          <div className="card bind-selected">
            <Avatar name={member.full_name || "Гость"} photo={member.photo} size={64} />
            <div><strong>{member.full_name || "Без имени"}</strong><br /><span className="muted">{formatPhone(member.phone)}</span></div>
            <button className="link" onClick={() => { nfc.stop(); setParams({}); setMember(null); setUid(""); }}>Сменить гостя</button>
          </div>
          {member.card && <p className="error">У гостя уже есть карта {member.card.uid}. После привязки новой старая перестанет работать.</p>}
          <p>Возьмите проданную карту и считайте её метку.</p>
          <button className="btn" onClick={nfc.scanning ? nfc.stop : () => nfc.start((value) => { setUid(value); setError(""); })}>
            {nfc.scanning ? "Отменить считывание" : "Считать метку телефоном"}
          </button>
          {nfc.scanning && <div className="scan-wait" role="status">Приложите метку к телефону…</div>}
          <form onSubmit={bind} className="bind-confirm">
            <label className="field"><span>UID метки</span><input className="input" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Или введите UID вручную / приложите к USB-ридеру" /></label>
            <button className="btn" disabled={!uid.trim() || busy}>{busy ? "Привязываем…" : "Подтвердить привязку"}</button>
          </form>
        </>
      )}
      {memberId && !member && !error && <p className="muted">Загрузка гостя…</p>}
      {done && member && (
        <div className="card bind-success" role="status">
          <h2>Карта привязана</h2>
          <p><strong>{member.full_name || formatPhone(member.phone)}</strong> · {member.card?.uid}</p>
          <div className="bind-success-actions">
            <Link className="btn btn-ghost" to={`/staff/guests/${member.id}`}>Открыть гостя</Link>
            <button className="btn" onClick={() => { setParams({}); setQuery(""); setUid(""); setDone(false); }}>Выдать следующую карту</button>
          </div>
        </div>
      )}
      {!done && (error || (!uid && nfc.error)) && <div className="error" role="alert">{error || nfc.error}</div>}
    </div>
  );
}
