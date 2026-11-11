import { Link } from "react-router-dom";
import type { ClubProject } from "../types";

export default function ProjectCard({ project }: { project: ClubProject }) {
  const cover = project.images[0];
  return (
    <article className="card project-card">
      {cover && <Link to={`/projects/${project.id}`} tabIndex={-1} aria-hidden="true">
        <img className="project-cover" src={cover.image} alt="" loading="lazy" />
      </Link>}
      <div className="project-card-body">
        <div className="project-tags">{project.directions.map((value) => <span className="pill" key={value}>{value}</span>)}</div>
        <h2><Link to={`/projects/${project.id}`}>{project.title}</Link></h2>
        {(project.summary || project.description) && <p className="project-summary">{project.summary || project.description}</p>}
        <div className="project-card-actions">
          <Link className="project-author" to={`/people/${project.owner.id}`}>{project.owner.full_name}</Link>
          <Link to={`/projects/${project.id}`} aria-label={`Подробнее о проекте «${project.title}»`}>Подробнее ↗</Link>
        </div>
      </div>
    </article>
  );
}
