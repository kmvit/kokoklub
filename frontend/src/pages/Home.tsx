import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ClubEmpty } from "../components/ClubDesign";
import EventCard, { type ClubEvent } from "../components/EventCard";
import ProjectCard from "../components/ProjectCard";
import { Avatar } from "../components/ui";
import type { ClubProject, MemberShort } from "../types";
import Afisha from "./Afisha";

function useHomeSection<T>(path: string) {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api.get<T[]>(path)
      .then((items) => { if (active) setData(items); })
      .catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [path, attempt]);
  return { data, error, retry: () => setAttempt((value) => value + 1) };
}

function SectionError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="notice bad" role="alert">{message} <button className="link" onClick={retry}>Попробовать ещё раз</button></div>;
}

function MemberHome() {
  const { me } = useAuth();
  // Независимые запросы: афиша остаётся доступна при ошибке в другом разделе.
  const events = useHomeSection<ClubEvent>("/events/");
  const projects = useHomeSection<ClubProject>("/projects/");
  const members = useHomeSection<MemberShort>("/members/");
  if (!me) return null;
  const upcoming = events.data?.filter((event) => new Date(event.starts_at).getTime() >= Date.now())
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).slice(0, 3);

  return <div className="page club-home">
    <section className="club-cover home-cover" aria-labelledby="home-title">
      <img className="club-cover-image" src="/img/lounge.jpg" width="1200" height="1600" alt="Гостиная Коко клуба с мягкими креслами, винилом и тёплым светом" fetchPriority="high" />
      <div className="club-cover-content">
        <span className="cover-label">{me.full_name ? `Рады видеть вас, ${me.full_name.split(" ")[0]}` : "Ваше место в городе"}</span>
        <h1 id="home-title">Свои люди.<br />Общие планы.</h1>
        <p>Вечер с музыкой, неожиданное знакомство,<br className="home-desktop-break" /> идея, которую хочется сделать вместе.</p>
        <a className="btn" href="#home-events">Что происходит в клубе <span aria-hidden="true">↘</span></a>
      </div>
      <div className="cover-footnote"><span>Загляните на кофе. Останьтесь ради людей.</span><span>Хорошо, когда есть свои.</span></div>
    </section>

    <nav className="discovery-links" aria-label="Жизнь клуба">
      <a href="#home-events"><span>Повод встретиться</span><strong>Ближайшие события <span aria-hidden="true">↓</span></strong></a>
      <a href="#home-projects"><span>То, что мы создаём</span><strong>Проекты клубчан <span aria-hidden="true">↓</span></strong></a>
      <Link to="/people"><span>Знакомства продолжаются</span><strong>Найти своих <span aria-hidden="true">↗</span></strong></Link>
    </nav>

    <section id="home-events" className="home-editorial-section" aria-labelledby="home-events-title">
      <div className="section-heading"><div><p className="eyebrow">Встречаемся в коко</p><h2 id="home-events-title">Планы на вечер</h2></div><Link className="btn btn-ghost" to="/afisha">Вся афиша <span aria-hidden="true">↗</span></Link></div>
      <p className="home-section-intro">Ближайшие события клуба. Время московское.</p>
      {events.error ? <SectionError message={events.error} retry={events.retry} /> : events.data === null ? <p className="muted" role="status">Загружаем афишу…</p> : upcoming?.length ? <div className="event-grid">{upcoming.map((event, index) => <EventCard key={event.id} event={event} index={index} />)}</div> : <ClubEmpty title="Скоро будет повод встретиться."><p>Готовим новые события. Они появятся здесь и в афише клуба.</p></ClubEmpty>}
    </section>

    <section id="home-projects" className="home-editorial-section home-projects-section" aria-labelledby="home-projects-title">
      <div className="section-heading"><div><p className="eyebrow">Придумано нашими людьми</p><h2 id="home-projects-title">Из идеи — в дело</h2></div><Link className="btn btn-ghost" to="/projects">Все проекты <span aria-hidden="true">↗</span></Link></div>
      <p className="home-section-intro">Посмотрите, над чем работают клубчане. Возможно, здесь начинается ваше следующее совместное дело.</p>
      {projects.error ? <SectionError message={projects.error} retry={projects.retry} /> : projects.data === null ? <p className="muted" role="status">Загружаем проекты…</p> : projects.data.length === 0 ? <ClubEmpty title="У каждой идеи есть начало."><p>Расскажите о своём проекте — здесь его увидят клубчане.</p><Link className="link" to="/me">Добавить проект</Link></ClubEmpty> : <div className="home-project-showcase">{projects.data.slice(0, 3).map((project) => <ProjectCard key={project.id} project={project} />)}</div>}
      <div className="home-project-invite"><span>Задумали что-то своё? Расскажите клубу.</span><Link className="link" to="/me">Добавить свой проект ↗</Link></div>
    </section>

    <section className="home-people-section" aria-labelledby="home-people-title">
      <div className="home-people-copy"><p className="eyebrow">Главное в клубе</p><h2 id="home-people-title">Люди, с которыми<br />есть о чём.</h2><p>Сосед по столику, будущий соавтор или просто хороший собеседник. Познакомьтесь поближе.</p><Link className="btn btn-ghost" to="/people">Познакомиться с клубчанами <span aria-hidden="true">↗</span></Link></div>
      <div className="home-member-list">
        {members.error ? <SectionError message={members.error} retry={members.retry} /> : members.data === null ? <p className="muted" role="status">Загружаем клубчан…</p> : members.data.length === 0 ? <p className="muted">Здесь скоро появятся первые анкеты участников.</p> : members.data.slice(0, 4).map((member) => <Link className="home-member-row" to={`/people/${member.id}`} key={member.id}><Avatar name={member.full_name || "Участник"} photo={member.photo} size={56} /><div><strong>{member.full_name || "Участник клуба"}</strong><span>{member.occupation || member.activity || "Участник клуба"}</span></div><span aria-hidden="true">↗</span></Link>)}
      </div>
    </section>
  </div>;
}

export default function Home() {
  const { me, loading } = useAuth();
  if (loading) return <div className="page-loading" role="status">Загрузка…</div>;
  return me ? <MemberHome /> : <Afisha />;
}
