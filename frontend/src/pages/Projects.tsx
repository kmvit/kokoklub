import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ClubEmpty, PageHeading } from "../components/ClubDesign";
import ProjectCard from "../components/ProjectCard";
import type { ClubProject } from "../types";

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
      <div className="content-grid project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div>}
  </div>;
}
