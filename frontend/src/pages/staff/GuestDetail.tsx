import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { Avatar } from "../../components/ui";
import { formatPhone, type StaffMember } from "../../types";

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
      <Link className="link" to="/staff/guests">← Все гости</Link>
      {error && <div className="error">{error}</div>}
      {!member && !error && <p className="muted">Загрузка…</p>}
      {member && (
        <div className="card staff-guest-detail">
          <Avatar name={member.full_name || "Гость"} photo={member.photo} size={112} />
          <div>
            <h1>{member.full_name || "Без имени"}</h1>
            <p><a href={`tel:+${member.phone}`}>{formatPhone(member.phone)}</a></p>
            {(member.activity || member.occupation) && <p className="muted">{[member.activity, member.occupation].filter(Boolean).join(" · ")}</p>}
            <p>{member.in_club ? <span className="pill ok">Сейчас в клубе</span> : <span className="pill">Не в клубе</span>}</p>
            <p>{member.card ? <span className="pill ok">Клубная карта активна</span> : <span className="pill warn">Нет действующей карты</span>}</p>
            {member.is_hidden && <p className="muted small">Скрыт из каталога участников</p>}
          </div>
        </div>
      )}
    </>
  );
}
