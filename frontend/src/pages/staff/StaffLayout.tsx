import { Link, NavLink, Outlet } from "react-router-dom";
import { beginEntranceNfc } from "../../entranceNfc";
import "./cashier.css";

export default function StaffLayout() {
  return (
    <div className="cashier">
      <header className="cashier-head">
        <h1>Кабинет кассира</h1>
        <Link to="/staff/entrance" onClick={() => { if (window.isSecureContext && "NDEFReader" in window) beginEntranceNfc(); }}>Сканер карт</Link>
      </header>
      <nav className="cashier-nav" aria-label="Разделы кассы">
        <NavLink to="/staff" end>В клубе</NavLink>
        <NavLink to="/staff/guests">Найти гостя</NavLink>
        <NavLink to="/staff/bind">Выдать карту</NavLink>
      </nav>
      <div className="cashier-content"><Outlet /></div>
    </div>
  );
}
