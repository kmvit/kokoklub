import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ClubEmpty } from "../components/ClubDesign";

import EventCard, { type ClubEvent } from "../components/EventCard";

export default function Afisha() {
  const { me } = useAuth();
  const [events, setEvents] = useState<ClubEvent[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api.get<ClubEvent[]>("/events/").then((data) => { if (active) setEvents(data); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [attempt]);

  return <div className="page afisha-page">
    <section className="club-cover" aria-labelledby="afisha-title">
      <img className="club-cover-image" src="/img/lounge.jpg" width="1200" height="1600" alt="Тёплый свет, кресла и диско-шары в зале Коко клуба" fetchPriority="high" />
      <div className="club-cover-content">
        <span className="cover-label">Место для своих людей</span>
        <h1 id="afisha-title">Встретимся<br />в коко.</h1>
        <p>За музыкой, новыми знакомствами<br />и разговорами без спешки.</p>
        <a className="btn" href="#afisha">Выбрать вечер <span aria-hidden="true">↗</span></a>
      </div>
      <div className="cover-footnote"><span>Кофе днём. Винил вечером. Свои — всегда.</span><span>Коко клуб</span></div>
    </section>
    <nav className="discovery-links" aria-label="Знакомство с клубом">
      <a href="#afisha"><span>Планы на вечер</span><strong>Афиша клуба <span aria-hidden="true">↗</span></strong></a>
      <Link to={me ? "/people" : "/login?mode=register"}><span>Новые знакомства</span><strong>Найти своих <span aria-hidden="true">↗</span></strong></Link>
      <Link to={me ? "/me" : "/login?mode=register"}><span>{me ? "Всё под рукой" : "Станьте частью клуба"}</span><strong>{me ? "Мой кабинет" : "Присоединиться"} <span aria-hidden="true">↗</span></strong></Link>
    </nav>
    <section id="afisha" className="afisha-events" aria-labelledby="events-title">
      <div className="section-heading"><div><p className="eyebrow">Повод собраться</p><h2 id="events-title">Афиша<span className="heading-dot">.</span></h2></div><span className="section-note">Ближайшее в клубе / время МСК</span></div>
      {error ? <div className="notice bad" role="alert">{error} <button className="link" onClick={() => setAttempt((value) => value + 1)}>Попробовать ещё раз</button></div> : events === null ? <p className="muted" role="status">Загрузка афиши…</p> : events.length === 0 ? <ClubEmpty title="Новые встречи уже на подходе."><p>Скоро опубликуем ближайшие события. Заглядывайте в афишу.</p></ClubEmpty> :
        <div className="event-grid">{events.map((event, index) => <EventCard key={event.id} event={event} index={index} />)}</div>}
    </section>
    {!me && <div className="join-strip"><div><p className="eyebrow">Всё начинается со знакомства</p><h2>Будем знакомы?</h2><p>Зарегистрируйтесь, чтобы стать частью клуба.</p></div><Link className="btn btn-ink" to="/login?mode=register">Стать участником <span aria-hidden="true">↗</span></Link></div>}
  </div>;
}
