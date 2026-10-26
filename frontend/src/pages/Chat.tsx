import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Avatar, StatusLine, useToast } from "../components/ui";
import { formatWhen, type ChatMessage, type MemberShort } from "../types";

interface Conversation {
  id: number;
  other: MemberShort;
  messages: ChatMessage[];
}

// Пока без онлайна: новые сообщения подтягиваются при открытии,
// при возврате на вкладку и по кнопке «Обновить».
export default function Chat() {
  const { id } = useParams();
  const { reload } = useAuth();
  const notify = useToast();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setConv(await api.get<Conversation>(`/chats/${id}/`));
      reload(); // счётчик непрочитанных в шапке
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, reload]);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [conv?.messages.length]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || !conv) return;
    setSending(true);
    try {
      const msg = await api.post<ChatMessage>(`/chats/${id}/messages/`, { text });
      setConv({ ...conv, messages: [...conv.messages, msg] });
      setText("");
    } catch (err) {
      notify((err as Error).message, "bad");
    } finally {
      setSending(false);
    }
  };

  if (error) return <div className="page"><div className="empty">{error}</div></div>;
  if (!conv) return <div className="page muted">Загрузка…</div>;

  return (
    <div className="page narrow chat-page">
      <div className="chat-head">
        <Link to="/messages" className="back">
          ←
        </Link>
        <Link to={`/people/${conv.other.id}`} className="chat-who">
          <Avatar name={conv.other.full_name} photo={conv.other.photo} size={44} />
          <div>
            <strong>{conv.other.full_name}</strong>
            <StatusLine status={conv.other.status} text={conv.other.status_text} inClub={conv.other.in_club} />
          </div>
        </Link>
        <button className="btn btn-ghost btn-small" onClick={load}>
          Обновить
        </button>
      </div>

      <div className="messages">
        {conv.messages.length === 0 && (
          <div className="muted center">Напишите первым — расскажите, кто вы и зачем пишете.</div>
        )}
        {conv.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.mine ? "mine" : ""}`}>
            <div className="pre">{m.text}</div>
            <div className="bubble-meta">
              {formatWhen(m.created_at)}
              {m.mine && (m.read ? " · прочитано" : "")}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={send}>
        <textarea
          className="input"
          rows={2}
          placeholder="Сообщение…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn" disabled={sending || !text.trim()}>
          Отправить
        </button>
      </form>
    </div>
  );
}
