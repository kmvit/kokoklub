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
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), 3500);
    return () => window.clearTimeout(t);
  }, [result]);

  useCardReader(async (uid) => {
    try {
      const res = await api.post<InsideVisit & { action: "enter" | "exit" }>("/staff/scan/", { uid });
      setResult({ kind: res.action, name: res.member.full_name.split(" ")[0] || "гость", photo: res.member.photo });
    } catch (e) {
      setResult({ kind: "error", text: (e as Error).message });
    }
  });

  return (
    <div className={`entrance ${result?.kind ?? "idle"}`}>
      <Link to="/staff" className="entrance-exit" onClick={stopEntranceNfc}>
        ← персонал
      </Link>
      {!result && (
        <div className="entrance-box">
          <div className="entrance-logo">коко клуб</div>
          <div className="entrance-title">{nfc.status === "scanning" ? "Приложите карту" : "Считайте карту"}</div>
          <button className="btn" onClick={toggleScan}>{nfc.status === "scanning" ? "Остановить считывание" : "Считать метку телефоном"}</button>
          <div className="entrance-sub" role="status">{nfc.status === "scanning" ? "NFC включён — поднесите метку к телефону" : "Нажмите кнопку, затем поднесите метку"}</div>
          {nfc.error && <div className="error" role="alert">{nfc.error}</div>}
        </div>
      )}
      {result && result.kind !== "error" && (
        <div className="entrance-box">
          <Avatar name={result.name} photo={result.photo} size={160} />
          <div className="entrance-title">
            {result.kind === "enter" ? `Привет, ${result.name}!` : `До встречи, ${result.name}!`}
          </div>
        </div>
      )}
      {result?.kind === "error" && (
        <div className="entrance-box">
          <div className="entrance-title">{result.text}</div>
          <button className="btn" onClick={toggleScan}>Повторить считывание</button>
        </div>
      )}
    </div>
  );
}
