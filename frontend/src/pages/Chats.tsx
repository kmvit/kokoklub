import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Avatar, StatusDot } from "../components/ui";
import { formatWhen, type ChatSummary } from "../types";

export default function Chats() {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<ChatSummary[]>("/chats/").then(setChats).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page narrow">
      <h1>Сообщения</h1>
      {error && <div className="notice bad">{error}</div>}
      {chats === null ? (
        <div className="muted">Загрузка…</div>
      ) : chats.length === 0 ? (
        <div className="empty">
          Переписок пока нет. Найдите человека в <Link to="/people">каталоге</Link> и нажмите «Написать».
        </div>
      ) : (
        <div className="card list">
          {chats.map((c) => (
            <Link key={c.id} to={`/messages/${c.id}`} className={`list-row ${c.unread ? "unread" : ""}`}>
              <Avatar name={c.other.full_name} photo={c.other.photo} size={48} />
              <div className="list-main">
                <div className="list-title">
                  <StatusDot status={c.other.status} /> {c.other.full_name}
                </div>
                <div className="muted ellipsis">
                  {c.last?.mine && "Вы: "}
                  {c.last?.text}
                </div>
              </div>
              <div className="list-side">
                {c.last && <span className="muted small">{formatWhen(c.last.created_at)}</span>}
                {c.unread > 0 && <span className="count">{c.unread}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
