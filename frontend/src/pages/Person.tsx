import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Avatar, StatusLine, useToast } from "../components/ui";
import type { MemberDetail } from "../types";

function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <section className="profile-section">
      <h3>{title}</h3>
      <p className="pre">{text}</p>
    </section>
  );
}

export default function Person() {
  const { id } = useParams();
  const { me } = useAuth();
  const navigate = useNavigate();
  const notify = useToast();
  const [person, setPerson] = useState<MemberDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<MemberDetail>(`/members/${id}/`)
      .then(setPerson)
      .catch((e) => setError(e.status === 404 ? "Такого участника нет" : e.message));
  }, [id, me?.id]);

  const write = async () => {
    try {
      const { id: chatId } = await api.post<{ id: number }>("/chats/", { member: Number(id) });
      navigate(`/messages/${chatId}`);
    } catch (e) {
      notify((e as Error).message, "bad");
    }
  };

  if (error) return <div className="page"><div className="empty">{error}</div></div>;
  if (!person) return <div className="page muted">Загрузка…</div>;

  const isMe = me?.id === person.id;
  return (
    <div className="page narrow">
      <Link to="/people" className="back">
        ← Все участники
      </Link>
      <div className="card profile-head">
        <Avatar name={person.full_name} photo={person.photo} size={112} />
        <div className="profile-head-info">
          <h1>{person.full_name}</h1>
          <div className="muted">{[person.occupation, person.activity].filter(Boolean).join(" · ")}</div>
          <StatusLine status={person.status} text={person.status_text} inClub={person.in_club} />
          {person.member_since && (
            <div className="muted small">
              В клубе с {new Date(person.member_since).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
            </div>
          )}
        </div>
      </div>

      <div className="profile-actions">
        {isMe ? (
          <Link to="/me" className="btn">
            Редактировать профиль
          </Link>
        ) : !me ? (
          <Link to="/login" state={{ from: `/people/${person.id}` }} className="btn">
            Войти, чтобы написать
          </Link>
        ) : me.is_member ? (
          <button className="btn" onClick={write}>
            Написать
          </button>
        ) : (
          <div className="notice">Писать участникам могут члены клуба. Клубную карту можно получить на баре.</div>
        )}
      </div>

      <div className="card">
        <Section title="Чем могу помочь" text={person.can_help} />
        <Section title="Кого ищу" text={person.looking_for} />
        <Section title="О себе" text={person.about} />
        {person.hobbies.length > 0 && (
          <section className="profile-section">
            <h3>Хобби</h3>
            <div className="tags">
              {person.hobbies.map((h) => (
                <span key={h} className="tag">
                  {h}
                </span>
              ))}
            </div>
          </section>
        )}
        <section className="profile-section">
          <h3>Контакты</h3>
          {person.contacts ? (
            person.contacts.telegram || person.contacts.phone ? (
              <div className="contacts">
                {person.contacts.telegram && (
                  <a href={`https://t.me/${person.contacts.telegram}`} target="_blank" rel="noreferrer">
                    Telegram: @{person.contacts.telegram}
                  </a>
                )}
                {person.contacts.phone && <a href={`tel:${person.contacts.phone}`}>{person.contacts.phone}</a>}
              </div>
            ) : (
              <p className="muted">Участник не оставил контактов — напишите ему здесь.</p>
            )
          ) : (
            <p className="muted">Контакты видят только члены клуба.</p>
          )}
        </section>
      </div>
    </div>
  );
}
