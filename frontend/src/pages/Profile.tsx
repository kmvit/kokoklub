import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Avatar, StatusDot, useToast } from "../components/ui";
import { STATUS_LABEL, formatPhone, type Activity, type Me, type Status } from "../types";

type Form = Pick<
  Me,
  "full_name" | "activity" | "occupation" | "about" | "can_help" | "looking_for" | "telegram" | "show_phone" | "status" | "status_text"
> & { hobbies: string };

function toForm(me: Me): Form {
  return {
    full_name: me.full_name,
    activity: me.activity,
    occupation: me.occupation,
    about: me.about,
    can_help: me.can_help,
    looking_for: me.looking_for,
    telegram: me.telegram,
    show_phone: me.show_phone,
    status: me.status,
    status_text: me.status_text,
    hobbies: me.hobbies.join(", "),
  };
}

function MembershipNotice({ me }: { me: Me }) {
  if (!me.profile_complete) {
    return (
      <div className="notice">
        <strong>Добро пожаловать!</strong> Заполните анкету — по ней другие участники смогут вас найти.
      </div>
    );
  }
  if (!me.is_member) {
    return (
      <div className="notice">
        <strong>Анкета готова.</strong> Подойдите на бар и назовите номер телефона — вам выдадут клубную
        карту, и профиль появится в каталоге.
      </div>
    );
  }
  if (me.is_hidden) {
    return <div className="notice bad">Профиль скрыт из каталога администратором клуба.</div>;
  }
  return (
    <div className="notice ok">
      Вы член клуба{me.in_club ? " и сейчас в клубе" : ""}.{" "}
      <Link to={`/people/${me.id}`}>Как меня видят другие →</Link>
    </div>
  );
}

export default function Profile() {
  const { me, setMe, logout } = useAuth();
  const notify = useToast();
  const [form, setForm] = useState<Form | null>(me ? toForm(me) : null);
  const [consent, setConsent] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Activity[]>("/activities/").then(setActivities).catch(() => {});
    api.get<string[]>("/hobbies/").then(setSuggested).catch(() => {});
  }, []);

  if (!me || !form) return null;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value });
  const hobbyList = form.hobbies.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updated = await api.patch<Me>("/me/", {
        ...form,
        hobbies: hobbyList,
        ...(me.has_consent ? {} : { consent }),
      });
      setMe(updated);
      setForm(toForm(updated));
      notify("Профиль сохранён", "ok");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    const data = new FormData();
    data.append("photo", file);
    try {
      setMe(await api.post<Me>("/me/photo/", data));
    } catch (err) {
      notify((err as Error).message, "bad");
    }
  };

  return (
    <div className="page narrow">
      <h1>Мой профиль</h1>
      <MembershipNotice me={me} />

      <form className="card form" onSubmit={save}>
        <div className="photo-row">
          <Avatar name={form.full_name || "?"} photo={me.photo} size={96} />
          <div>
            <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
              {me.photo ? "Сменить фото" : "Загрузить фото"}
            </button>
            {me.photo && (
              <button type="button" className="link" onClick={() => api.del<Me>("/me/photo/").then(setMe)}>
                Удалить
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
            />
            <div className="muted small">Телефон: {formatPhone(me.phone)}</div>
          </div>
        </div>

        <label className="field">
          <span>ФИО *</span>
          <input className="input" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
        </label>
        <div className="row">
          <label className="field">
            <span>Вид деятельности</span>
            <select
              className="input"
              value={form.activity ?? ""}
              onChange={(e) => set("activity", e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Не выбран</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Чем занимаюсь</span>
            <input
              className="input"
              placeholder="Например, дизайнер интерфейсов"
              value={form.occupation}
              onChange={(e) => set("occupation", e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span>Чем могу помочь</span>
          <textarea
            className="input"
            rows={2}
            placeholder="Сделаю сайт, помогу с договором, научу играть на гитаре…"
            value={form.can_help}
            onChange={(e) => set("can_help", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Кого ищу</span>
          <textarea
            className="input"
            rows={2}
            placeholder="Дизайнера для проекта, компанию на настолки…"
            value={form.looking_for}
            onChange={(e) => set("looking_for", e.target.value)}
          />
        </label>
        <label className="field">
          <span>О себе</span>
          <textarea className="input" rows={3} value={form.about} onChange={(e) => set("about", e.target.value)} />
        </label>
        <label className="field">
          <span>Хобби — через запятую</span>
          <input
            className="input"
            placeholder="бег, настолки, кино"
            value={form.hobbies}
            onChange={(e) => set("hobbies", e.target.value)}
          />
        </label>
        {suggested.filter((h) => !hobbyList.includes(h)).length > 0 && (
          <div className="chips">
            {suggested
              .filter((h) => !hobbyList.includes(h))
              .slice(0, 10)
              .map((h) => (
                <button key={h} type="button" className="chip" onClick={() => set("hobbies", [...hobbyList, h].join(", "))}>
                  + {h}
                </button>
              ))}
          </div>
        )}

        <h3>Статус</h3>
        <div className="chips">
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <button key={s} type="button" className={`chip ${form.status === s ? "on" : ""}`} onClick={() => set("status", s)}>
              <StatusDot status={s} /> {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Подпись к статусу</span>
          <input
            className="input"
            maxLength={80}
            placeholder="Например, «работаю до 18:00, потом свободен»"
            value={form.status_text}
            onChange={(e) => set("status_text", e.target.value)}
          />
        </label>

        <h3>Контакты для членов клуба</h3>
        <label className="field">
          <span>Telegram</span>
          <input className="input" placeholder="@nickname" value={form.telegram} onChange={(e) => set("telegram", e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.show_phone} onChange={(e) => set("show_phone", e.target.checked)} />
          Показывать мой телефон членам клуба
        </label>

        {!me.has_consent && (
          <label className="check consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Я согласен на обработку персональных данных и на то, что моя анкета будет видна на портале клуба
          </label>
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn btn-wide" disabled={busy || (!me.has_consent && !consent)}>
          {me.profile_complete ? "Сохранить" : "Сохранить анкету"}
        </button>
      </form>

      <button className="link logout" onClick={logout}>
        Выйти из профиля
      </button>
    </div>
  );
}
