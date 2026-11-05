import { Link, NavLink, Outlet } from "react-router-dom";
import { beginEntranceNfc } from "../../entranceNfc";

export default function StaffLayout() {
  return (
    <div className="page">
      <div className="staff-tabs">
        <NavLink to="/staff" end>
          Кто в клубе
        </NavLink>
        <NavLink to="/staff/guests">Гости и карты</NavLink>
        <NavLink to="/staff/bind">Привязать карту</NavLink>
        <Link to="/staff/entrance" className="staff-entrance-link" onClick={beginEntranceNfc}>
          Экран у входа ↗
        </Link>
      </div>
      <Outlet />
    </div>
  );
}
