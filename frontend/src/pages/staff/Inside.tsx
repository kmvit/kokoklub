import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { StatusLine, useToast } from "../../components/ui";
import { formatPhone, formatTime, type InsideVisit } from "../../types";
import { useCardReader } from "../../useCardReader";
import StaffPhoto from "./StaffPhoto";

// Планшет на баре: кто сейчас в клубе. Ридер можно подключить и сюда —
// тогда карта, приложенная на баре, тоже отмечает вход и выход.
export default function Inside() {
  const notify = useToast();
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
      const res = await api.post<InsideVisit & { action: "enter" | "exit" }>("/staff/scan/", { uid });
      notify(`${res.member.full_name || "Гость"}: ${res.action === "enter" ? "вошёл" : "вышел"}`, "ok");
      load();
    } catch (e) {
      notify((e as Error).message, "bad");
    }
  });

  const leave = async (v: InsideVisit) => {
    await api.post(`/staff/visits/${v.id}/leave/`);
    load();
  };

  return (
    <>
      <h2 className="staff-section-title">
        Сейчас в клубе {visits && <span className="muted">· {visits.length}</span>}
      </h2>
      {visits === null ? (
        <div className="muted">Загрузка…</div>
      ) : visits.length === 0 ? (
        <div className="empty">Пока никого. Гость приложит карту у входа — и появится здесь.</div>
      ) : (
        <div className="grid">
          {visits.map((v) => (
            <div key={v.id} className="card inside-card">
              <StaffPhoto name={v.member.full_name || "Гость"} photo={v.member.photo} />
              <div className="inside-card-body">
                <div className="member-card-name">
                  <strong>{v.member.full_name || formatPhone(v.member.phone)}</strong>
                  <span className="muted">{v.member.occupation || v.member.activity}</span>
                </div>
                <StatusLine status={v.member.status} text={v.member.status_text} />
                <div className="inside-foot">
                  <span className="muted small">
                    с {formatTime(v.entered_at)} · {formatPhone(v.member.phone)}
                  </span>
                  <button className="link" onClick={() => leave(v)}>
                    Отметить выход
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
