import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { PROJECT_STAGES, type ClubProject } from "../types";

export default function ProjectDetail() {
  const { id } = useParams();
  return <ProjectContent key={id} id={id} />;
}

function ProjectContent({ id }: { id?: string }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<ClubProject | null>(null);
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<ClubProject>(`/projects/${id}/`)
      .then((data) => { if (active) setProject(data); })
      .catch((error) => {
        if (active) setError(error.status === 404 ? "Проект не найден." : error.message);
      });
    return () => { active = false; };
  }, [id]);

  if (error) return <div className="page"><Link to="/projects" className="back">← Все проекты</Link><p role="alert">{error}</p></div>;
  if (!project) return <div className="page" role="status">Загрузка проекта…</div>;

  const writeAuthor = async () => {
    setOpeningChat(true);
    setChatError("");
    try {
      const chat = await api.post<{ id: number }>("/chats/", { member: project.owner.id });
      navigate(`/messages/${chat.id}`);
    } catch (error) {
      setChatError((error as Error).message);
    } finally {
      setOpeningChat(false);
    }
  };

  return (
    <div className="page narrow project-detail">
      <Link to="/projects" className="back">← Все проекты</Link>
      <div className="project-tags">
        {project.directions.map((value) => <span key={value} className="pill">{value}</span>)}
        {project.stage && <span className="pill warn">{PROJECT_STAGES[project.stage]}</span>}
      </div>
      <h1>{project.title}</h1>
      <p><Link to={`/people/${project.owner.id}`}>{project.owner.full_name}</Link>{project.author_role && ` · ${project.author_role}`}</p>
      {project.summary && <p className="project-detail-summary">{project.summary}</p>}
      {project.images.length > 0 && <section aria-label="Галерея проекта">
        <div className="project-detail-gallery">
          {project.images.map((image, index) => <a href={image.image} key={image.id} target="_blank" rel="noreferrer">
            <img src={image.image} alt={`${project.title} — изображение ${index + 1}`} loading={index === 0 ? "eager" : "lazy"} />
          </a>)}
        </div>
      </section>}
      {project.description && <section className="profile-section"><h2>О проекте</h2><p className="pre">{project.description}</p></section>}
      {project.looking_for && <section className="profile-section"><h2>Автор ищет</h2><p>{project.looking_for}</p></section>}
      {(project.url || project.links.length > 0) && <section className="profile-section">
        <h2>Ссылки</h2>
        <ul>
          {project.url && <li><a href={project.url} target="_blank" rel="noreferrer">Основная ссылка ↗</a></li>}
          {project.links.map((link, index) => <li key={index}><a href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a></li>)}
        </ul>
      </section>}
      {me?.id === project.owner.id ? <Link className="btn" to="/me">Редактировать в анкете</Link> :
        me?.is_member && <button className="btn" disabled={openingChat} onClick={writeAuthor}>Написать автору</button>}
      {me && me.id !== project.owner.id && !me.is_member && <p className="muted">Написать автору можно после получения клубной карты.</p>}
      {chatError && <p className="error" role="alert">{chatError}</p>}
    </div>
  );
}
