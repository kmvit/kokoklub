import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { Avatar, Modal, useToast } from "../../components/ui";
import { formatPhone, type StaffMember } from "../../types";
import { useCardReader } from "../../useCardReader";

function cardState(m: StaffMember) {
  if (m.card) return <span className="pill ok">карта {m.card.uid}</span>;
  if (!m.profile_complete) return <span className="pill">анкета не заполнена</span>;
  return <span className="pill warn">ждёт карту</span>;
}

// Привязка карты: бариста пробил карту в кассе, гость прикладывает её к ридеру.
function BindCard({ member, onDone, onClose }: { member: StaffMember; onDone: (m: StaffMember) => void; onClose: () => void }) {
  const [manual, setManual] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const bind = useCallback(
    async (uid: string) => {
      setBusy(true);
      setError("");
      try {
        onDone(await api.post<StaffMember>(`/staff/members/${member.id}/card/`, { uid }));
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    },
    [member.id, onDone],
  );
  useCardReader(bind, !busy);

  return (
    <Modal title={member.card ? "Перевыпуск карты" : "Выдача клубной карты"} onClose={onClose}>
      <p>
        <strong>{member.full_name || formatPhone(member.phone)}</strong>
      </p>
      <ol className="steps">
        <li>Пробейте в кассе «Клубная карта — 1 500 ₽».</li>
        <li>Приложите новую карту к ридеру.</li>
      </ol>
      {member.card && <p className="muted small">Старая карта {member.card.uid} перестанет работать.</p>}
      <div className="scan-wait">{busy ? "Привязываем…" : "Ждём карту…"}</div>
      {error && <div className="error">{error}</div>}
      <form
        className="manual-uid"
        onSubmit={(e) => {
          e.preventDefault();
          bind(manual);
        }}
      >
        <input
          className="input"
          placeholder="или номер вручную: 53:FB:51:19:23:00:01"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button className="btn btn-ghost" disabled={busy || !manual.trim()}>
          Привязать
        </button>
      </form>
    </Modal>
  );
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
        <p className="muted small">Для гостя без смартфона. Остальную анкету он заполнит сам, войдя по номеру.</p>
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
  const [q, setQ] = useState("");
  const [list, setList] = useState<StaffMember[] | null>(null);
  const [binding, setBinding] = useState<StaffMember | null>(null);
  const [revoking, setRevoking] = useState<StaffMember | null>(null);
  const [creating, setCreating] = useState(false);

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

  const replace = (m: StaffMember) => setList((prev) => [m, ...(prev ?? []).filter((x) => x.id !== m.id)]);

  const toggleHidden = async (m: StaffMember) => {
    replace(await api.patch<StaffMember>(`/staff/members/${m.id}/`, { is_hidden: !m.is_hidden }));
  };

  const revoke = async () => {
    if (!revoking) return;
    replace(await api.del<StaffMember>(`/staff/members/${revoking.id}/card/`));
    setRevoking(null);
    notify("Карта отвязана");
  };

  return (
    <>
      <div className="guests-head">
        <input
          className="input search"
          placeholder="Телефон (можно последние цифры) или имя"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" onClick={() => setCreating(true)}>
          + Новый гость
        </button>
      </div>

      {list === null ? (
        <div className="muted">Загрузка…</div>
      ) : list.length === 0 ? (
        <div className="empty">Никого не нашли. Гость ещё не заполнил анкету — дайте ему QR или создайте вручную.</div>
      ) : (
        <div className="card list">
          {list.map((m) => (
            <div key={m.id} className="list-row">
              <Avatar name={m.full_name || "?"} photo={m.photo} size={48} />
              <div className="list-main">
                <div className="list-title">
                  {m.full_name || "Без имени"} {m.in_club && <span className="badge-club">в клубе</span>}
                  {m.is_hidden && <span className="pill bad">скрыт</span>}
                </div>
                <div className="muted small">
                  {formatPhone(m.phone)} · {cardState(m)}
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-small" onClick={() => setBinding(m)}>
                  {m.card ? "Перевыпустить" : "Выдать карту"}
                </button>
                {m.card && (
                  <button className="link" onClick={() => setRevoking(m)}>
                    Отвязать
                  </button>
                )}
                <button className="link" onClick={() => toggleHidden(m)}>
                  {m.is_hidden ? "Показать" : "Скрыть"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {binding && (
        <BindCard
          member={binding}
          onClose={() => setBinding(null)}
          onDone={(m) => {
            replace(m);
            setBinding(null);
            notify(`Карта привязана: ${m.full_name || formatPhone(m.phone)}`, "ok");
          }}
        />
      )}
      {creating && (
        <NewGuest
          onClose={() => setCreating(false)}
          onDone={(m) => {
            replace(m);
            setCreating(false);
            setBinding(m);
          }}
        />
      )}
      {revoking && (
        <Modal title="Отвязать карту?" onClose={() => setRevoking(null)}>
          <p>
            Карта {revoking.card?.uid} перестанет работать, а {revoking.full_name || "гость"} пропадёт из каталога,
            пока не получит новую.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setRevoking(null)}>
              Отмена
            </button>
            <button className="btn btn-danger" onClick={revoke}>
              Отвязать
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
