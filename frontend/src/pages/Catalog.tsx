import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { StatusDot } from "../components/ui";
import { STATUS_LABEL, type Activity, type MemberShort } from "../types";

// Каталог — только лица и имена. Всё остальное о человеке — в его профиле.
function PersonTile({ m }: { m: MemberShort }) {
  const initials = m.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <Link to={`/people/${m.id}`} className="person-tile">
      <div className="person-photo">
        {m.photo ? <img src={m.photo} alt={m.full_name} loading="lazy" /> : <span>{initials}</span>}
        <span className="person-status" title={m.status_text || STATUS_LABEL[m.status]}>
          <StatusDot status={m.status} />
        </span>
      </div>
      <div className="person-name">{m.full_name}</div>
    </Link>
  );
}

export default function Catalog() {
  const [members, setMembers] = useState<MemberShort[] | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [q, setQ] = useState("");
  const [activity, setActivity] = useState("");
  const [inClub, setInClub] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Activity[]>("/activities/").then(setActivities).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (activity) params.set("activity", activity);
    if (inClub) params.set("in_club", "1");
    // поиск по мере набора — с паузой, чтобы не дёргать сервер на каждую букву
    const t = window.setTimeout(() => {
      api
        .get<MemberShort[]>(`/members/?${params}`)
        .then((data) => {
          setMembers(data);
          setError("");
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, activity, inClub]);

  return (
    <div className="page">
      <h1>Участники клуба</h1>

      <div className="filters">
        <input className="input search" placeholder="Поиск по имени или делу" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={activity} onChange={(e) => setActivity(e.target.value)}>
          <option value="">Все виды деятельности</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button className={`chip ${inClub ? "on" : ""}`} onClick={() => setInClub(!inClub)}>
          Сейчас в клубе
        </button>
      </div>

      {error && <div className="notice bad">{error}</div>}
      {members === null ? (
        <div className="muted">Загрузка…</div>
      ) : members.length === 0 ? (
        <div className="empty">Никого не нашли.</div>
      ) : (
        <div className="people-grid">
          {members.map((m) => (
            <PersonTile key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
