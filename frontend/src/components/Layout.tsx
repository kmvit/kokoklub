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
  const pathname = useLocation().pathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // бар клуба живёт в Падаче — ссылка на меню приходит из настроек бэкенда
  const [menuUrl, setMenuUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ menu_url: string | null }>("/site/").then((s) => setMenuUrl(s.menu_url)).catch(() => {});
  }, []);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  // счётчик непрочитанных обновляется, когда человек возвращается на вкладку
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);

  return (
    <div className="app">
      <a href="#main-content" className="skip-link">Перейти к содержимому</a>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo">
            коко<span>клуб</span>
          </Link>
          <nav className={`nav ${mobileMenuOpen ? "nav-open" : ""}`} id="site-navigation" aria-label="Основная навигация" onClick={() => setMobileMenuOpen(false)}>
            {me && <NavLink to="/" end>Главная</NavLink>}
            <NavLink to={me ? "/afisha" : "/"} end>Афиша</NavLink>
            {me && <>
              <NavLink to="/people">Картотека</NavLink>
              <NavLink to="/projects">Проекты</NavLink>
              <NavLink to="/me">Личный кабинет</NavLink>
              {menuUrl && <a href={menuUrl}>Меню</a>}
            </>}
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
                Регистрация / Войти
              </Link>
            )}
          </div>
          <button
            className="header-menu-toggle"
            type="button"
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-controls="site-navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="main" id="main-content">
        <Outlet />
      </main>
      <footer className="club-footer"><Link to="/" className="footer-logo">коко<span>клуб</span></Link><p>Хорошо, когда есть свои.</p><span>Люди. Идеи. Встречи.</span></footer>
    </div>
  );
}
