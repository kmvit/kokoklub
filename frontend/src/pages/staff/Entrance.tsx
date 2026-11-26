import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { Avatar } from "../../components/ui";
import { beginEntranceNfc, getEntranceNfc, subscribeEntranceNfc, stopEntranceNfc } from "../../entranceNfc";
import type { InsideVisit, StaffMember } from "../../types";
import { useCardReader } from "../../useCardReader";

type Result =
  | { kind: "enter" | "exit"; name: string; photo: string | null }
  | { kind: "error"; text: string };

// Экран у входа: планшет с ридером в режиме киоска. Гость прикладывает
// карту — видит приветствие, через пару секунд экран снова ждёт.
export default function Entrance() {
  const [result, setResult] = useState<Result | null>(null);
  const navigate = useNavigate();
  const nfc = useSyncExternalStore(subscribeEntranceNfc, getEntranceNfc);
  const phoneReader = window.isSecureContext && "NDEFReader" in window;
  const processed = useRef<string | null>(null);

  const toggleScan = () => {
    if (nfc.status === "scanning") {
      stopEntranceNfc();
      return;
    }
    processed.current = null;
    setResult(null);
    beginEntranceNfc();
  };

  useEffect(() => {
    if (nfc.status !== "read" || !nfc.uid || processed.current === nfc.uid) return;
    processed.current = nfc.uid;
    api.post<StaffMember>("/staff/card-lookup/", { uid: nfc.uid })
      .then((guest) => navigate(`/staff/guests/${guest.id}`))
      .catch((error) => setResult({ kind: "error", text: (error as Error).message }));
  }, [nfc, navigate]);

  useEffect(() => {
    if (!result || result.kind === "error") return;
    const t = window.setTimeout(() => setResult(null), 3500);
    return () => window.clearTimeout(t);
  }, [result]);

  useCardReader(async (uid) => {
    try {
      setResult(null);
      const res = await api.post<(InsideVisit & { action: "enter" | "exit" }) | { action: "desk"; member_id: number }>("/staff/scan/", { uid });
      if (res.action === "desk") { navigate(`/staff/guests/${res.member_id}`); return; }
      setResult({ kind: res.action, name: res.member.full_name.split(" ")[0] || "гость", photo: res.member.photo });
    } catch (e) {
      setResult({ kind: "error", text: (e as Error).message });
    }
  });

  const scanning = nfc.status === "scanning";
  const lookingUp = nfc.status === "read" && !result;
  const error = result?.kind === "error" ? result.text : phoneReader ? nfc.error : "";
  const visit = result && result.kind !== "error" ? result : null;

  return (
    <section className="cashier gate">
      <header className="cashier-head">
        <h1>Вход в клуб</h1>
        <Link to="/staff" onClick={stopEntranceNfc}>← В кассу</Link>
      </header>
      <div className="gate-body">
        <div className="gate-reader" aria-hidden="true">
          {visit ? <Avatar name={visit.name} photo={visit.photo} size={80} /> :
            <div className="gate-card"><span>коко</span><i /></div>}
        </div>
        <div className="gate-message" role="status">
          <h2>{visit ? (visit.kind === "enter" ? "Вход отмечен" : "Выход отмечен")
            : error ? "Карта не считана" : lookingUp ? "Ищем гостя…" : scanning ? "Приложите карту" : "Сканер карт"}</h2>
          <p>{visit ? (visit.kind === "enter" ? `Привет, ${visit.name}!` : `До встречи, ${visit.name}!`)
            : error || (lookingUp ? "Открываем карточку гостя." : scanning ? "Поднесите карту гостя к задней панели телефона."
            : phoneReader ? "Включите NFC кнопкой ниже или приложите карту к внешнему ридеру."
            : "Приложите карту к внешнему ридеру. Если ридера нет, найдите гостя по имени или телефону.")}</p>
        </div>
        <div className="gate-actions">
          {phoneReader && !visit && <button className="btn" disabled={lookingUp} onClick={toggleScan}>
            {scanning ? "Остановить считывание" : "Считать карту телефоном"}
          </button>}
          <Link className="btn" to="/staff/guests" onClick={stopEntranceNfc}>Найти гостя</Link>
        </div>
      </div>
    </section>
  );
}
