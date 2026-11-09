import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Modal, useToast } from "../../components/ui";
import { formatPhone, type StaffMember } from "../../types";
import { useNfcReader } from "../../useNfcReader";
import { useCardReader } from "../../useCardReader";
import StaffPhoto from "./StaffPhoto";

function cardState(m: StaffMember) {
  if (m.card) return <span className="pill ok">Карта активна</span>;
  if (!m.profile_complete) return <span className="pill">анкета не заполнена</span>;
  return <span className="pill warn">ждёт карту</span>;
}

function NewGuest({ onDone, onClose }: { onDone: (m: StaffMember) => void; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      onDone(await api.post<StaffMember>("/staff/members/", { phone, full_name: name, consent }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal title="Новый гость" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">Для гостя без смартфона. Чтобы позже открыть ему вход, администратор добавит почту и пароль в его существующую учётную запись.</p>
        <label className="field">
          <span>Телефон</span>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>ФИО</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Гость согласен на обработку персональных данных
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-wide" disabled={!consent || !phone || !name}>
          Создать
        </button>
      </form>
    </Modal>
  );
}

export default function Guests() {
  const notify = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [list, setList] = useState<StaffMember[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [scanError, setScanError] = useState("");
  const nfc = useNfcReader();

  const startScan = async () => {
    setScanError("");
    await nfc.start(async (serialNumber) => {
      try {
        const member = await api.post<StaffMember>("/staff/card-lookup/", { uid: serialNumber });
        navigate(`/staff/guests/${member.id}`);
      } catch (e) {
        setScanError((e as Error).message);
      }
    });
  };

  useCardReader(async (uid) => {
    try {
      const member = await api.post<StaffMember>("/staff/card-lookup/", { uid });
      navigate(`/staff/guests/${member.id}`);
    } catch (e) { setScanError((e as Error).message); }
  }, !creating);

  const load = useCallback(() => {
    api
      .get<StaffMember[]>(`/staff/members/?q=${encodeURIComponent(q.trim())}`)
      .then(setList)
      .catch((e) => notify(e.message, "bad"));
  }, [q, notify]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  const addGuest = (m: StaffMember) => setList((prev) => [m, ...(prev ?? []).filter((x) => x.id !== m.id)]);

  return (
    <>
      <div className="guests-head">
        <input
          className="input search"
          placeholder="Телефон (можно последние цифры) или имя"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" onClick={nfc.scanning ? nfc.stop : startScan}>
          {nfc.scanning ? "Отменить считывание" : "Посмотреть гостя по NFC"}
        </button>
        <button className="btn btn-ghost" onClick={() => setCreating(true)}>
          + Новый гость
        </button>
      </div>
      {nfc.scanning && <div className="scan-wait" role="status">Приложите метку к телефону…</div>}
      {(scanError || nfc.error) && <div className="error" role="alert">{scanError || nfc.error}</div>}

      {list === null ? (
        <div className="muted">Загрузка…</div>
      ) : list.length === 0 ? (
        <div className="empty">Никого не нашли. Гость ещё не заполнил анкету — дайте ему QR или создайте вручную.</div>
      ) : (
        <div className="staff-guests-grid">
          {list.map((m) => (
            <article key={m.id} className="card staff-guest-card">
              <StaffPhoto name={m.full_name || "Гость"} photo={m.photo} />
              <div className="staff-guest-card-body">
                <h2>{m.full_name || "Без имени"}</h2>
                <a className="staff-guest-card-phone" href={`tel:+${m.phone}`}>{formatPhone(m.phone)}</a>
                <div className="staff-guest-card-status">
                  {cardState(m)}
                  {m.in_club && <span className="pill ok">Сейчас в клубе</span>}
                  {m.is_hidden && <span className="pill bad">Скрыт</span>}
                </div>
                <div className="staff-guest-card-actions">
                  <Link className="btn" to={`/staff/guests/${m.id}`}>Посмотреть гостя</Link>
                  <Link className="btn btn-ghost" to={`/staff/bind?member=${m.id}`}>
                    {m.card ? "Перевыпустить карту" : "Выдать карту"}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <NewGuest
          onClose={() => setCreating(false)}
          onDone={(m) => {
            addGuest(m);
            setCreating(false);
            navigate(`/staff/bind?member=${m.id}`);
          }}
        />
      )}
    </>
  );
}
