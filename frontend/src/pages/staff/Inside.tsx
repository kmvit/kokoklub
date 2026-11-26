import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { StatusLine, useToast } from "../../components/ui";
import { formatPhone, formatTime, type InsideVisit } from "../../types";
import { useCardReader } from "../../useCardReader";
import StaffPhoto from "./StaffPhoto";

// Планшет на баре: кто сейчас в клубе. Ридер можно подключить и сюда —
// тогда карта, приложенная на баре, тоже отмечает вход и выход.
export default function Inside() {
  const notify = useToast();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState<number | null>(null);
  const [visits, setVisits] = useState<InsideVisit[] | null>(null);

  const load = useCallback(() => {
    api.get<InsideVisit[]>("/staff/inside/").then(setVisits).catch((e) => notify(e.message, "bad"));
  }, [notify]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 15000);
    return () => window.clearInterval(t);
  }, [load]);

  useCardReader(async (uid) => {
    try {
      const res = await api.post<InsideVisit & { action: "enter" | "exit" } | { action: "desk"; member_id: number }>("/staff/scan/", { uid });
      if (res.action === "desk") { navigate(`/staff/guests/${res.member_id}`); return; }
      notify(`${res.member.full_name || "Гость"}: ${res.action === "enter" ? "вошёл" : "вышел"}`, "ok");
      load();
    } catch (e) {
      notify((e as Error).message, "bad");
    }
  });

  const leave = async (v: InsideVisit) => {
    setLeaving(v.id);
    try {
      await api.post(`/staff/visits/${v.id}/leave/`);
      setVisits(rows => rows?.filter(row => row.id !== v.id) ?? null);
      notify("Выход отмечен", "ok");
    } catch (e) { notify((e as Error).message, "bad"); }
    finally { setLeaving(null); }
  };

  return (
    <>
      <h2 className="staff-section-title">
        Сейчас в клубе {visits && <span className="muted">· {visits.length}</span>}
      </h2>
      {visits === null ? (
        <div className="muted">Загрузка…</div>
      ) : visits.length === 0 ? (
        <div className="empty">Пока никого. <Link to="/staff/guests">Найти гостя и оформить вход</Link></div>
      ) : (
        <div className="cashier-list">
          {visits.map(v => (
            <div key={v.id} className="cashier-visit">
              <Link className="cashier-person" to={`/staff/guests/${v.member.id}`}>
                <StaffPhoto name={v.member.full_name || "Гость"} photo={v.member.photo} />
                <div><strong>{v.member.full_name || formatPhone(v.member.phone)}</strong>
                  <small>С {formatTime(v.entered_at)} · {formatPhone(v.member.phone)}</small>
                  <StatusLine status={v.member.status} text={v.member.status_text} />
                </div>
              </Link>
              <button className="cashier-leave" disabled={leaving !== null} aria-label={`Отметить выход: ${v.member.full_name || formatPhone(v.member.phone)}`} onClick={() => leave(v)}>Выход</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
