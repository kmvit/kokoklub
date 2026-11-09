import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ClubEmpty, ClubFlower } from "../components/ClubDesign";

type Event = { id: number; title: string; description: string; starts_at: string; location: string };
const datePart = (value: string, options: Intl.DateTimeFormatOptions) => new Date(value).toLocaleString("ru-RU", { ...options, timeZone: "Europe/Moscow" });

export default function Afisha() {
  const { me } = useAuth();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.get<Event[]>("/events/").then((data) => { if (active) setEvents(data); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  return <div className="page afisha-page">
    <section className="art-hero" aria-labelledby="afisha-title">
      <div className="art-hero-copy">
        <p className="eyebrow"><span className="live-mark" /> Коко клуб · Место встречи</p>
        <h1 id="afisha-title">Хорошие<br />вечера —<br /><span>свои люди.</span></h1>
        <p className="hero-description">Музыка, разговоры и встречи, ради которых хочется выйти из дома.</p>
        <a className="btn btn-ink" href="#afisha">Что в афише <span aria-hidden="true">↘</span></a>
        <span className="hero-note">Увидимся в коко</span>
      </div>
      <div className="art-hero-visual">
        <div className="hero-photo"><img src="/img/lounge.jpg" width="1200" height="1600" alt="Зал клуба: винил, диско-шары и кресла у камина" fetchPriority="high" /><span className="photo-caption">Есть место для тебя.</span></div>
        <div className="hero-sticker" aria-hidden="true"><span>Планы на вечер?</span><strong>Идём<br />в коко!</strong><span className="sticker-arrow">↗</span></div>
        <ClubFlower className="hero-flower" />
      </div>
    </section>
    <div className="club-ribbon" aria-label="Музыка, люди, идеи, встречи"><span>Музыка</span><i aria-hidden="true">✳</i><span>Люди</span><i aria-hidden="true">✳</i><span>Идеи</span><i aria-hidden="true">✳</i><span>Встречи</span><i aria-hidden="true">✳</i><span>Коко клуб</span></div>
    <section id="afisha" className="afisha-events" aria-labelledby="events-title">
      <div className="section-heading"><div><p className="eyebrow">Повод собраться</p><h2 id="events-title">Афиша<span className="heading-dot">.</span></h2></div><span className="section-note">Ближайшее в клубе / время МСК</span></div>
      {error ? <div className="notice bad" role="alert">{error}</div> : events === null ? <p className="muted" role="status">Загрузка афиши…</p> : events.length === 0 ? <ClubEmpty title="Новые встречи уже на подходе."><p>Скоро опубликуем ближайшие события. Заглядывайте в афишу.</p></ClubEmpty> :
        <div className="event-grid">{events.map((event, index) => <article className={`event-poster event-tone-${index % 3}`} key={event.id}>
          <div className="event-poster-top"><time dateTime={event.starts_at}><strong>{datePart(event.starts_at, { day: "2-digit" })}</strong><span>{datePart(event.starts_at, { month: "long" })}</span></time><span className="event-time">{datePart(event.starts_at, { hour: "2-digit", minute: "2-digit" })}</span></div>
          <ClubFlower className="event-flower" /><h3>{event.title}</h3><p className="pre">{event.description}</p><div className="event-poster-bottom"><span>{event.location || "Коко клуб"}</span><span aria-hidden="true">↗</span></div>
        </article>)}</div>}
    </section>
    {!me && <div className="join-strip"><div><p className="eyebrow">Всё начинается со знакомства</p><h2>Будем знакомы?</h2><p>Зарегистрируйтесь, чтобы стать частью клуба.</p></div><Link className="btn btn-ink" to="/login">Регистрация / Войти <span aria-hidden="true">↗</span></Link></div>}
  </div>;
}
