import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { STATUS_LABEL, type Me, type Status } from "../types";
import { Avatar, StatusDot, useToast } from "./ui";

// Переключатель статуса в шапке: как в ICQ — один клик, и все видят.
function StatusMenu() {
  const { me, setMe } = useAuth();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!me) return null;
  const choose = async (status: Status) => {
    setOpen(false);
    try {
      setMe(await api.patch<Me>("/me/", { status }));
    } catch (e) {
      notify((e as Error).message, "bad");
    }
  };
  return (
    <div className="status-menu" ref={box}>
      <button className="status-btn" onClick={() => setOpen(!open)} title="Мой статус">
        <StatusDot status={me.status} />
        <span className="hide-sm">{STATUS_LABEL[me.status]}</span>
      </button>
      {open && (
        <div className="menu">
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <button key={s} className={s === me.status ? "active" : ""} onClick={() => choose(s)}>
              <StatusDot status={s} /> {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { me, reload } = useAuth();
  const landing = useLocation().pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  // бар клуба живёт в Падаче — ссылка на меню приходит из настроек бэкенда
  const [menuUrl, setMenuUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ menu_url: string | null }>("/site/").then((s) => setMenuUrl(s.menu_url)).catch(() => {});
  }, []);

  // счётчик непрочитанных обновляется, когда человек возвращается на вкладку
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);

  // на лендинге шапка прозрачная, пока не начали листать
  useEffect(() => {
    if (!landing) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [landing]);

  return (
    <div className={`app ${landing ? "app-landing" : ""}`}>
      <header className={`header ${scrolled ? "scrolled" : ""}`}>
        <div className="header-inner">
          <Link to="/" className="logo">
            коко<span>клуб</span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              Клуб
            </NavLink>
            <NavLink to="/people">Участники</NavLink>
            {menuUrl && <a href={menuUrl}>Меню</a>}
            {me && (
              <NavLink to="/messages">
                Сообщения
                {me.unread > 0 && <span className="count">{me.unread}</span>}
              </NavLink>
            )}
            {me?.is_staff && <NavLink to="/staff">Персонал</NavLink>}
          </nav>
          <div className="header-right">
            <StatusMenu />
            {me ? (
              <Link to="/me" className="me-link" title="Мой профиль">
                <Avatar name={me.full_name || "?"} photo={me.photo} size={36} />
              </Link>
            ) : (
              <Link to="/login" className="btn btn-small">
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className={landing ? "main main-full" : "main"}>
        <Outlet />
      </main>
    </div>
  );
}
