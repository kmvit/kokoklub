import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import Catalog from "./pages/Catalog";
import Chat from "./pages/Chat";
import Chats from "./pages/Chats";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Person from "./pages/Person";
import Profile from "./pages/Profile";
import Entrance from "./pages/staff/Entrance";
import Inside from "./pages/staff/Inside";
import Guests from "./pages/staff/Guests";
import GuestDetail from "./pages/staff/GuestDetail";
import BindCard from "./pages/staff/BindCard";
import StaffLayout from "./pages/staff/StaffLayout";

function RequireAuth({ children, staff = false }: { children: ReactNode; staff?: boolean }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loading">Загрузка…</div>;
  if (!me || (staff && !me.is_staff)) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="people" element={<Catalog />} />
        <Route path="people/:id" element={<Person />} />
        <Route path="login" element={<Login />} />
        <Route path="me" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="messages" element={<RequireAuth><Chats /></RequireAuth>} />
        <Route path="messages/:id" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="staff/login" element={<Navigate to="/login" replace />} />
        <Route path="staff" element={<RequireAuth staff><StaffLayout /></RequireAuth>}>
          <Route index element={<Inside />} />
          <Route path="guests" element={<Guests />} />
          <Route path="guests/:id" element={<GuestDetail />} />
          <Route path="bind" element={<BindCard />} />
        </Route>
      </Route>
      {/* экран у входа — на весь экран, без шапки портала */}
      <Route path="staff/entrance" element={<RequireAuth staff><Entrance /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
