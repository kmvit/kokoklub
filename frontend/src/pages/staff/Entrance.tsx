import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Avatar } from "../../components/ui";
import type { InsideVisit } from "../../types";
import { useCardReader } from "../../useCardReader";

type Result =
  | { kind: "enter" | "exit"; name: string; photo: string | null }
  | { kind: "error"; text: string };

// Экран у входа: планшет с ридером в режиме киоска. Гость прикладывает
// карту — видит приветствие, через пару секунд экран снова ждёт.
export default function Entrance() {
  const [result, setResult] = useState<Result | null>(null);

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
      <Link to="/staff" className="entrance-exit">
        ← персонал
      </Link>
      {!result && (
        <div className="entrance-box">
          <div className="entrance-logo">коко клуб</div>
          <div className="entrance-title">Приложите карту</div>
          <div className="entrance-pulse" />
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
          <div className="entrance-sub">Подойдите, пожалуйста, на бар</div>
        </div>
      )}
    </div>
  );
}
