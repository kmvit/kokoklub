import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

export function ClubEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="club-empty"><img src={`${import.meta.env.BASE_URL}brand/koko_E_mark_on-green.svg`} width="48" height="48" alt="" /><div><h2>{title}</h2><div className="muted">{children}</div></div></div>;
}
