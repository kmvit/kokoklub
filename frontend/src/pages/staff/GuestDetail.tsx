import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { Modal } from "../../components/ui";
import { formatPhone, type StaffMember } from "../../types";
import StaffTopUp from "./StaffTopUp";
import StaffPhoto from "./StaffPhoto";

export default function GuestDetail() {
  const { id } = useParams();
  const [member, setMember] = useState<StaffMember | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<StaffMember>(`/staff/members/${id}/`).then(setMember).catch((e) => setError(e.message));
  }, [id]);

  const toggleHidden = async () => {
    if (!member || busy) return;
    setBusy(true);
    setActionError("");
    try {
      setMember(await api.patch<StaffMember>(`/staff/members/${member.id}/`, { is_hidden: !member.is_hidden }));
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!member || busy) return;
    setBusy(true);
    setActionError("");
    try {
      setMember(await api.del<StaffMember>(`/staff/members/${member.id}/card/`));
      setConfirmRevoke(false);
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
            <StaffTopUp key={member.id} member={member} onBalance={(balance) => setMember({ ...member, balance })} />
            <div className="staff-guest-manage">
              <h2>Управление гостем</h2>
              <button className="btn btn-ghost" onClick={toggleHidden} disabled={busy}>{member.is_hidden ? "Показать в каталоге" : "Скрыть из каталога"}</button>
              {member.card && <button className="btn btn-ghost" onClick={() => setConfirmRevoke(true)} disabled={busy}>Отвязать карту</button>}
              {actionError && <div className="error" role="alert">{actionError}</div>}
            </div>
          </div>
        </div>
      )}
      {confirmRevoke && member && (
        <Modal title="Отвязать карту?" onClose={() => setConfirmRevoke(false)}>
          <p>Карта {member.card?.uid} перестанет работать. Профиль и счёт гостя сохранятся.</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmRevoke(false)}>Отмена</button>
            <button className="btn btn-danger" onClick={revoke} disabled={busy}>{busy ? "Отвязываем…" : "Отвязать"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
