import { Link, NavLink, Outlet } from "react-router-dom";

export default function StaffLayout() {
  return (
    <div className="page">
      <div className="staff-tabs">
        <NavLink to="/staff" end>
          Кто в клубе
        </NavLink>
        <NavLink to="/staff/guests">Гости и карты</NavLink>
        <Link to="/staff/entrance" className="staff-entrance-link">
          Экран у входа ↗
        </Link>
      </div>
      <Outlet />
    </div>
  );
}
