import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuth } from "../../auth";

export default function StaffLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(await api.post("/auth/staff/", { phone, password }));
      navigate("/staff", { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="page narrow-sm">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Вход для персонала</h1>
        <label className="field">
          <span>Телефон</span>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-wide" disabled={busy}>
          Войти
        </button>
      </form>
    </div>
  );
}
