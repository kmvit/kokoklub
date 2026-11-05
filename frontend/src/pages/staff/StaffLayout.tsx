import { Link, NavLink, Outlet } from "react-router-dom";
import { beginEntranceNfc } from "../../entranceNfc";

export default function StaffLayout() {
  return (
    <div className="page staff-page">
      <nav className="staff-tabs" aria-label="Разделы персонала">
        <NavLink to="/staff" end>
          <span className="staff-tab-desktop">Кто в клубе</span><span className="staff-tab-mobile">В клубе</span>
        </NavLink>
        <NavLink to="/staff/guests"><span className="staff-tab-desktop">Гости и карты</span><span className="staff-tab-mobile">Гости</span></NavLink>
        <NavLink to="/staff/bind"><span className="staff-tab-desktop">Привязать карту</span><span className="staff-tab-mobile">Карта</span></NavLink>
        <Link to="/staff/entrance" className="staff-entrance-link" onClick={beginEntranceNfc}>
          <span className="staff-tab-desktop">Экран у входа ↗</span><span className="staff-tab-mobile">Вход</span>
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}
