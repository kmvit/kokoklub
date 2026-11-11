import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
      <button className="status-btn" onClick={() => setOpen(!open)} title="Мой статус" aria-label="Изменить мой статус" aria-expanded={open} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
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
  const { me, reload, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const signOut = async () => {
    setLoggingOut(true);
    try { await logout(); } catch { /* logout clears the local session even on network failure */ }
    finally { setLoggingOut(false); navigate("/login", { replace: true }); }
  };
  const pathname = useLocation().pathname;
  const staffArea = Boolean(me?.is_staff);
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
    <div className={`app ${me ? "app-member" : "app-guest"} ${staffArea ? "app-staff" : ""}`}>
      <a href="#main-content" className="skip-link">Перейти к содержимому</a>
      <header className="header">
        <div className="header-inner">
          <Link to={staffArea ? "/staff" : "/"} className="logo">
            коко<span>клуб</span>
          </Link>
          <nav className={`nav ${mobileMenuOpen ? "nav-open" : ""}`} id="site-navigation" aria-label="Основная навигация" onClick={() => setMobileMenuOpen(false)}>
            {staffArea ? <><span className="workspace-label">Рабочий кабинет</span></> : <>
              {me && <NavLink to="/" end>Главная</NavLink>}
              <NavLink to="/afisha">Афиша</NavLink>
              {!me && <NavLink to="/login?mode=register">Стать участником</NavLink>}
              {me && <><NavLink to="/people">Люди</NavLink><NavLink to="/projects">Проекты</NavLink><NavLink to="/messages">Сообщения{me.unread > 0 && <span className="count">{me.unread}</span>}</NavLink>{menuUrl && <a href={menuUrl}>Меню бара</a>}</>}
            </>}
          </nav>
          <div className="header-right">
            {!staffArea && <StatusMenu />}
            {staffArea ? <button className="btn btn-ghost btn-small" disabled={loggingOut} onClick={signOut}>{loggingOut ? "Выходим…" : "Выйти"}</button> : me ? (
              <Link to="/me" className="me-link" title="Мой кабинет" aria-label="Мой кабинет">
                <Avatar name={me.full_name || "?"} photo={me.photo} size={36} /><span className="profile-link-label">Кабинет</span>
              </Link>
            ) : (
              <Link to="/login" className="btn btn-small">
                Войти
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
      <main className="main" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      {me && !staffArea && <nav className="mobile-dock" aria-label="Быстрые разделы">
        {([
          ["/", "Главная", "M3 10l9-7 9 7v10H3z M9 20v-7h6v7"],
          ["/afisha", "Афиша", "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16"],
          ["/people", "Люди", "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M22 21v-3a4 4 0 0 0-3-4 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 3a4 4 0 0 1 0 8"],
          ["/messages", "Сообщения", "M3 4h18v13H8l-5 4z M7 9h10 M7 13h6"],
          ["/me", "Кабинет", "M20 21v-3a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v3 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8"],
        ] as const).map(([to, label, path]) => <NavLink key={to} to={to} end={to === "/"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg><span>{label}</span>{to === "/messages" && me.unread > 0 && <span className="dock-badge" aria-label={`${me.unread} непрочитанных`}>{me.unread > 99 ? "99+" : me.unread}</span>}</NavLink>)}
      </nav>}
      <footer className="club-footer"><Link to={staffArea ? "/staff" : "/"} className="footer-logo">коко<span>клуб</span></Link><p>Хорошо, когда есть свои.</p><span>Люди. Идеи. Встречи.</span></footer>
    </div>
  );
}
