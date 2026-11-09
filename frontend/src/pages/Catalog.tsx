import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ClubEmpty, PageHeading } from "../components/ClubDesign";
import PersonTile from "../components/PersonTile";
import { type Activity, type MemberShort } from "../types";

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
      <PageHeading eyebrow="Клуб в лицах / картотека" title="Картотека клубчан" description="У каждого — своя история. Найдите тех, с кем она продолжится." action={<Link to="/me" className="btn btn-ghost">Моя анкета <span aria-hidden="true">↗</span></Link>} />

      <div className="filters">
        <input className="input search" aria-label="Поиск по имени или делу" placeholder="Найти своего человека…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" aria-label="Вид деятельности" value={activity} onChange={(e) => setActivity(e.target.value)}>
          <option value="">Все виды деятельности</option>
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button className={`chip ${inClub ? "on" : ""}`} aria-pressed={inClub} onClick={() => setInClub(!inClub)}>
          Сейчас в клубе
        </button>
      </div>

      {error && <div className="notice bad">{error}</div>}
      {members === null ? (
        <div className="muted">Загрузка…</div>
      ) : members.length === 0 ? (
        <ClubEmpty title="Пока никого не нашли."><p>Попробуйте другое имя или измените фильтры.</p></ClubEmpty>
      ) : (
        <>
        <p className="results-caption">В картотеке по вашему запросу: {members.length}</p><div className="people-grid">
          {members.map((m) => (
            <PersonTile key={m.id} m={m} />
          ))}
        </div></>
      )}
    </div>
  );
}
