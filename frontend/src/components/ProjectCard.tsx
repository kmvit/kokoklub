import { Link } from "react-router-dom";
import { ClubFlower } from "./ClubDesign";
import type { ClubProject } from "../types";

export default function ProjectCard({ project, index }: { project: ClubProject; index: number }) {
  return <article className="card project-card">
    <div className={`project-card-cover project-cover-${index % 3}`} aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><ClubFlower /></div>
    <div className="project-card-body"><Link className="project-author" to={`/people/${project.owner.id}`}>{project.owner.full_name}</Link><h2>{project.title}</h2><p className="pre">{project.description}</p><div className="project-card-actions">{project.url ? <a href={project.url} target="_blank" rel="noreferrer">Открыть проект ↗</a> : <Link to={`/people/${project.owner.id}`}>Познакомиться с автором ↗</Link>}</div></div>
  </article>;
}
