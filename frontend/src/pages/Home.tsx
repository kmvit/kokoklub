import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Account from "../components/Account";
import { ClubEmpty } from "../components/ClubDesign";
import PersonTile from "../components/PersonTile";
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

function MemberHome() {
  const { me } = useAuth();
  // Оба раздела загружаются независимо: ошибка одного не блокирует другой.
  const members = useHomeSection<MemberShort>("/members/");
  const projects = useHomeSection<ClubProject>("/projects/");
  if (!me) return null;

  return <div className="page member-home">
    <div className="home-heading"><p className="eyebrow">Коко клуб / Главная</p><h1>{me.full_name ? `Привет, ${me.full_name.split(" ")[0]}.` : "Добро пожаловать в клуб."}</h1><p className="page-description">Наши люди, их идеи и ваша история в клубе.</p></div>
    <nav className="home-sections" aria-label="Разделы главной"><a href="#club-members">Картотека <span aria-hidden="true">↓</span></a><a href="#club-projects">Проекты <span aria-hidden="true">↓</span></a><Link to="/afisha">Афиша <span aria-hidden="true">↗</span></Link></nav>
    <div className="home-layout"><div className="home-feed">
      <section id="club-members" className="home-section" aria-labelledby="members-title">
        <div className="section-heading"><div><p className="eyebrow">Знакомые и будущие знакомые</p><h2 id="members-title">Картотека клубчан</h2></div><Link className="link section-all" to="/people">Все участники →</Link></div>
        {members.error ? <div className="notice bad" role="alert">{members.error} <button className="link" onClick={members.retry}>Повторить</button></div> : members.data === null ? <p className="muted" role="status">Загружаем клубчан…</p> : members.data.length === 0 ? <ClubEmpty title="Здесь начинается знакомство."><p>Заполненные анкеты участников появятся в картотеке.</p><Link className="link" to="/me">Заполнить свою анкету →</Link></ClubEmpty> : <div className="people-grid home-people-grid">{members.data.slice(0, 6).map((member) => <PersonTile m={member} key={member.id} />)}</div>}
      </section>
      <section id="club-projects" className="home-section" aria-labelledby="projects-title">
        <div className="section-heading"><div><p className="eyebrow">Идеи, которые нас объединяют</p><h2 id="projects-title">Проекты клубчан</h2></div><Link className="link section-all" to="/projects">Все проекты →</Link></div>
        {projects.error ? <div className="notice bad" role="alert">{projects.error} <button className="link" onClick={projects.retry}>Повторить</button></div> : projects.data === null ? <p className="muted" role="status">Загружаем проекты…</p> : projects.data.length === 0 ? <ClubEmpty title="Расскажите, что вы задумали."><p>Добавьте проект в анкете — он появится здесь, и клубчане смогут узнать о нём.</p><Link className="link" to="/me">Добавить свой проект →</Link></ClubEmpty> : <div className="content-grid project-grid home-project-grid">{projects.data.slice(0, 4).map((project) => <ProjectCard key={project.id} project={project} />)}</div>}
      </section>
    </div><aside className="home-sidebar" aria-label="Мой кабинет">
      <div className="card home-profile"><p className="eyebrow">Личный кабинет</p><Avatar name={me.full_name || "?"} photo={me.photo} size={64} /><h2>{me.full_name || "Ваш профиль"}</h2><p className="muted">{me.occupation || (me.profile_complete ? "Участник клуба" : "Заполните анкету, чтобы клубчане могли вас найти.")}</p><Link className="btn btn-ghost" to="/me">{me.profile_complete ? "Моя анкета" : "Заполнить анкету"} <span aria-hidden="true">↗</span></Link></div>
      <Account compact />
      <Link className="home-afisha-link" to="/afisha"><span className="eyebrow">Повод встретиться</span><strong>Что в афише?</strong><span className="muted">Ближайшие события клуба</span><span className="home-afisha-arrow" aria-hidden="true">↗</span></Link>
    </aside></div>
  </div>;
}

export default function Home() {
  const { me, loading } = useAuth();
  if (loading) return <div className="page-loading" role="status">Загрузка…</div>;
  return me ? <MemberHome /> : <Afisha />;
}
