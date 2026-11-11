import { Link, NavLink, Outlet } from "react-router-dom";
import { beginEntranceNfc } from "../../entranceNfc";

export default function StaffLayout() {
  return (
    <div className="page staff-page">
      <div className="staff-workspace-heading"><div><p className="eyebrow">Коко клуб</p><h1>Кабинет кассира</h1></div><Link className="btn btn-ghost" to="/">В клуб</Link></div>
      <nav className="staff-tabs" aria-label="Разделы персонала">
        <NavLink to="/staff" end>
          <span className="staff-tab-desktop">Кто в клубе</span><span className="staff-tab-mobile">В клубе</span>
        </NavLink>
        <NavLink to="/staff/guests"><span className="staff-tab-desktop">Найти гостя</span><span className="staff-tab-mobile">Гости</span></NavLink>
        <NavLink to="/staff/bind"><span className="staff-tab-desktop">Выдать карту</span><span className="staff-tab-mobile">Выдать карту</span></NavLink>
        <Link to="/staff/entrance" className="staff-entrance-link" onClick={beginEntranceNfc}>
          <span className="staff-tab-desktop">Экран у входа ↗</span><span className="staff-tab-mobile">Экран входа</span>
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}
