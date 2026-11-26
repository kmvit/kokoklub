import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Modal } from "../../components/ui";
import { formatPhone, type StaffMember } from "../../types";
import StaffTopUp from "./StaffTopUp";
import StaffEventDesk from "./StaffEventDesk";
import StaffMembership from "./StaffMembership";
import StaffGuestArrivals from "./StaffGuestArrivals";
import StaffPhoto from "./StaffPhoto";

export default function GuestDetail() {
  const { id } = useParams();
  return <GuestDetails key={id} id={id} />;
}

function GuestDetails({ id }: { id?: string }) {
  const { me } = useAuth();
  const [member, setMember] = useState<StaffMember | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [membershipRevision, setMembershipRevision] = useState(0);
  const [arrivalRevision, setArrivalRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<StaffMember>(`/staff/members/${id}/`).then(setMember).catch((e) => setError(e.message));
  }, [id]);

  const updateBalance = (balance: string) => setMember(current => current && { ...current, balance });

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
              {member.card ? <span className="pill ok">NFC-карта привязана</span> : <span className="pill warn">NFC-карта не привязана</span>}
            </div>
            {member.card && <p className="muted small">UID карты: {member.card.uid}</p>}
            {member.is_hidden && <p className="muted small">Скрыт из каталога участников</p>}
            <StaffEventDesk key={membershipRevision} memberId={member.id} onEntry={(balance) => { setMember(current => current && { ...current, balance, in_club: true }); setArrivalRevision(n => n + 1); }} />
            <StaffGuestArrivals memberId={member.id} />
            <StaffMembership hasCard={!!member.card} key={arrivalRevision} onSale={(balance, inClub) => { setMember(current => current && { ...current, balance, in_club: inClub }); setMembershipRevision(n => n + 1); }} memberId={member.id} />
            {me && <StaffTopUp key={me.id} member={member} cashierId={me.id}
              onBalance={updateBalance} />}
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
