import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { formatPhone, type StaffMember } from "../../types";
import StaffPhoto from "./StaffPhoto";

export default function GuestDetail() {
  const { id } = useParams();
  const [member, setMember] = useState<StaffMember | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.get<StaffMember>(`/staff/members/${id}/`).then(setMember).catch((e) => setError(e.message));
  }, [id]);

  return (
    <>
      <Link className="link staff-back" to="/staff/guests">← Все гости</Link>
      {error && <div className="error">{error}</div>}
      {!member && !error && <p className="muted">Загрузка…</p>}
      {member && (
        <div className="card staff-guest-detail">
          <StaffPhoto name={member.full_name || "Гость"} photo={member.photo} />
          <div className="staff-guest-info">
            <h1>{member.full_name || "Без имени"}</h1>
            <a className="staff-phone" href={`tel:+${member.phone}`}>{formatPhone(member.phone)}</a>
            {(member.activity || member.occupation) && <p className="muted">{[member.activity, member.occupation].filter(Boolean).join(" · ")}</p>}
            <div className="staff-guest-status">
              {member.in_club ? <span className="pill ok">Сейчас в клубе</span> : <span className="pill">Не в клубе</span>}
              {member.card ? <span className="pill ok">Клубная карта активна</span> : <span className="pill warn">Нет действующей карты</span>}
            </div>
            {member.card && <p className="muted small">UID карты: {member.card.uid}</p>}
            {member.is_hidden && <p className="muted small">Скрыт из каталога участников</p>}
            <Link className="btn" to={`/staff/bind?member=${member.id}`}>{member.card ? "Перевыпустить карту" : "Привязать карту"}</Link>
          </div>
        </div>
      )}
    </>
  );
}
