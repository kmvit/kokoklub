import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait(wait - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post<{ phone: string; retry_after: number }>("/auth/code/", { phone });
      setSentTo(res.phone);
      setWait(res.retry_after);
    } catch (err) {
      const body = (err as { body?: { retry_after?: number } }).body;
      if (body?.retry_after) {
        setSentTo(phone);
        setWait(body.retry_after);
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const tokens = await api.post<{ access: string; refresh: string }>("/auth/verify/", { phone: sentTo, code });
      const me = await login(tokens);
      // новичок сразу попадает в анкету
      const from = (location.state as { from?: string } | null)?.from;
      navigate(me && !me.profile_complete ? "/me" : from || "/people", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="page narrow-sm">
      <div className="card auth-card">
        <h1>Вход в клуб</h1>
        {!sentTo ? (
          <form onSubmit={requestCode}>
            <p className="muted">Пришлём код в SMS. Если вы здесь впервые — создадим профиль.</p>
            <label className="field">
              <span>Телефон</span>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 900 000-00-00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="btn btn-wide" disabled={busy || phone.replace(/\D/g, "").length < 10}>
              Получить код
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="muted">
              Код отправлен на +{sentTo}.{" "}
              <button type="button" className="link" onClick={() => { setSentTo(null); setCode(""); setError(""); }}>
                Другой номер
              </button>
            </p>
            <label className="field">
              <span>Код из SMS</span>
              <input
                className="input code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="btn btn-wide" disabled={busy || code.length !== 4}>
              Войти
            </button>
            <button type="button" className="link resend" disabled={wait > 0 || busy} onClick={() => requestCode()}>
              {wait > 0 ? `Отправить код ещё раз через ${wait} с` : "Отправить код ещё раз"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
