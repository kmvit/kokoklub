import type { ReactNode } from "react";

export function ClubFlower({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <path d="M60 9c11-26 29 0 22 17 21-14 41 9 20 24 27 3 24 31-1 32 18 20-5 39-23 20-2 27-31 27-34 1-20 18-41-5-21-24C-4 76-4 48 23 45 6 25 29 6 47 24 47 12 52 9 60 9Z" fill="currentColor" />
    <circle cx="60" cy="60" r="16" fill="var(--bg)" />
  </svg>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

export function ClubEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="club-empty"><ClubFlower /><div><h2>{title}</h2><div className="muted">{children}</div></div></div>;
}
