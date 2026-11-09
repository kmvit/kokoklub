import { Link } from "react-router-dom";
import { StatusDot } from "./ui";
import { STATUS_LABEL, type MemberShort } from "../types";

// Карточка ведёт в профиль участника.
export default function PersonTile({ m }: { m: MemberShort }) {
  const initials = m.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <Link to={`/people/${m.id}`} className="person-tile">
      <div className="person-photo">
        {m.photo ? <img src={m.photo} alt={m.full_name} loading="lazy" /> : <span>{initials}</span>}
        <span className="person-status" title={m.status_text || STATUS_LABEL[m.status]}>
          <StatusDot status={m.status} />
        </span>
      </div>
      <div className="person-tile-info"><div className="person-name">{m.full_name}</div>
        <p className="person-occupation">{m.occupation || m.activity || "Участник клуба"}</p>
        <div className="person-tile-footer"><span>{m.in_club ? "Сейчас в клубе" : STATUS_LABEL[m.status]}</span><span className="person-arrow" aria-hidden="true">↗</span></div>
      </div>
    </Link>
  );
}

