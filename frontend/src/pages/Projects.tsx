import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ClubEmpty, ClubFlower, PageHeading } from "../components/ClubDesign";
import type { Project } from "../types";

type ClubProject = Project & { id: number; owner: { id: number; full_name: string } };
export default function Projects() {
  const [projects, setProjects] = useState<ClubProject[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.get<ClubProject[]>("/projects/").then((data) => { if (active) setProjects(data); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  return <div className="page projects-page">
    <PageHeading eyebrow="Идеи обретают компанию / проекты" title="Проекты клубчан" description="То, что придумали наши люди. Возможно, следующему проекту не хватает именно вас." action={<Link className="btn" to="/me">Добавить проект <span aria-hidden="true">↗</span></Link>} />
    {error ? <div className="notice bad" role="alert">{error}</div> : projects === null ? <p className="muted" role="status">Загрузка…</p> : projects.length === 0 ? <ClubEmpty title="Первый шаг — рассказать об идее."><p>Добавьте свой проект в анкете. В клубе могут найтись единомышленники.</p><Link className="link" to="/me">Рассказать о проекте →</Link></ClubEmpty> :
      <div className="content-grid project-grid">{projects.map((project, index) => <article className="card project-card" key={project.id}>
        <div className={`project-card-cover project-cover-${index % 3}`} aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><ClubFlower /></div>
        <div className="project-card-body"><Link className="project-author" to={`/people/${project.owner.id}`}>{project.owner.full_name}</Link><h2>{project.title}</h2><p className="pre">{project.description}</p><div className="project-card-actions">{project.url ? <a href={project.url} target="_blank" rel="noreferrer">Открыть проект ↗</a> : <Link to={`/people/${project.owner.id}`}>Познакомиться с автором ↗</Link>}</div></div>
      </article>)}</div>}
  </div>;
}
