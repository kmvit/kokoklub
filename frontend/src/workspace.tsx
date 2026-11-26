import { createRoot } from "react-dom/client";
import { createPath, Route, Router, Routes, type To } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ToastProvider } from "./components/ui";
import Account from "./components/Account";
import VisitPacks from "./components/VisitPacks";
import Community from "./pages/Community";
import MeetingProgram from "./pages/MeetingProgram";
import Profile from "./pages/Profile";
import Catalog from "./pages/Catalog";
import Person from "./pages/Person";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Chats from "./pages/Chats";
import Chat from "./pages/Chat";
import StaffLayout from "./pages/staff/StaffLayout";
import Guests from "./pages/staff/Guests";
import GuestDetail from "./pages/staff/GuestDetail";
import Inside from "./pages/staff/Inside";
import Entrance from "./pages/staff/Entrance";
import BindCard from "./pages/staff/BindCard";
import type { Me } from "./types";
import { stopEntranceNfc } from "./entranceNfc";

const href = (to: To) => "#" + (typeof to === "string" ? to : createPath(to)).replace(/^\//, "");
const navigation = {
  createHref: href, go: (delta: number) => history.go(delta),
  push: (to: To) => { location.hash = href(to); },
  replace: (to: To) => { location.replace(href(to)); },
};

function Screens({ onBalance }: { onBalance: (balance: number) => void }) {
  const { me, loading } = useAuth();
  if (loading) return <p role="status">Загрузка…</p>;
  return <Routes>
    <Route path="/host" element={<MeetingProgram />} />
    <Route path="/votes" element={<MeetingProgram />} />
    {me && !me.is_staff && <>
      {["cabinet", "me"].map(path => <Route key={path} path={path} element={<Profile onBalance={onBalance} />} />)}
      <Route path="history/*" element={<Account onBalance={onBalance} />} />
      <Route path="shop" element={<VisitPacks />} />
      {["feed", "records", "library", "club"].map(path => <Route key={path} path={path} element={<Community />} />)}
      {["members", "people"].map(path => <Route key={path} path={path} element={<Catalog />} />)}
      <Route path="people/:id" element={<Person />} />
      <Route path="projects" element={<Projects />} /><Route path="projects/:id" element={<ProjectDetail />} />
      <Route path="messages" element={<Chats />} /><Route path="messages/:id" element={<Chat />} />
    </>}
    {me?.is_staff && <><Route path="/staff" element={<StaffLayout />}>
      <Route index element={<Inside />} /><Route path="guests" element={<Guests />} />
      <Route path="guests/:id" element={<GuestDetail />} /><Route path="bind" element={<BindCard />} />
    </Route><Route path="staff/entrance" element={<Entrance />} /></>}
    <Route path="*" element={<p>Раздел недоступен. <a href="#afisha">Открыть афишу</a></p>} />
  </Routes>;
}

export function mountWorkspace(
  el: HTMLElement, path: string, me: Me | null,
  onMeChange: (me: Me | null) => void, onBalance: (balance: number) => void,
) {
  const root = createRoot(el);
  let currentPath = "";
  const navigate = (nextPath: string) => {
    if (currentPath === nextPath) return;
    if (currentPath.split("?")[0] === "staff/entrance") stopEntranceNfc();
    currentPath = nextPath;
    root.render(<Router location={"/" + currentPath} navigator={navigation}>
      <AuthProvider initialMe={me} onMeChange={onMeChange}><ToastProvider><Screens onBalance={onBalance} /></ToastProvider></AuthProvider>
    </Router>);
  };
  navigate(path);
  return {
    navigate,
    unmount() {
      root.unmount();
      if (currentPath.split("?")[0] === "staff/entrance") stopEntranceNfc();
    },
  };
}
