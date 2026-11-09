import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type Tokens = { access: string; refresh: string };

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (register && password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const tokens = register
        ? await api.post<Tokens>("/auth/register/", { email, phone, password, consent })
        : await api.post<Tokens>("/auth/login/", { email, password });
      const me = await login(tokens);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(me && !me.is_staff && !me.profile_complete ? "/me" : from && (!from.startsWith("/staff") || me?.is_staff) ? from : me?.is_staff ? "/staff" : "/people", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow-sm">
      <div className="card auth-card">
        <p className="eyebrow">Коко клуб / Свои рядом</p>
        <h1>{register ? "Регистрация в клубе" : "Вход в клуб"}</h1>
        <p className="muted">{register ? "Создайте учётную запись. Телефон нужен для клубной карты." : "Один вход для участников, кассиров и администратора."}</p>
        <form onSubmit={submit}>
          <label className="field"><span>Электронная почта</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          {register && <label className="field"><span>Телефон</span>
            <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>}
          <label className="field"><span>Пароль</span>
            <input className="input" type="password" autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          {register && <>
            <label className="field"><span>Повторите пароль</span>
              <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </label>
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /> Согласен на обработку персональных данных</label>
          </>}
          {error && <div className="error">{error}</div>}
          <button className="btn btn-wide" disabled={busy}>{busy ? "Подождите…" : register ? "Зарегистрироваться" : "Войти"}</button>
        </form>
        <button type="button" className="link resend" onClick={() => { setRegister(!register); setError(""); }}>
          {register ? "Уже есть учётная запись? Войти" : "Нет учётной записи? Зарегистрироваться"}
        </button>
      </div>
    </div>
  );
}
