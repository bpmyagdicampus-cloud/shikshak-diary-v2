import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useAuthStore } from "./lib/store";
import { useT } from "./lib/i18n";
import Shell from "./components/Shell";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Organizations from "./pages/Organizations";
import AcademicYears from "./pages/AcademicYears";
import SuperAdmins from "./pages/SuperAdmins";
import Departments from "./pages/Departments";
import Classes from "./pages/Classes";
import Subjects from "./pages/Subjects";
import Members from "./pages/Members";
import Account from "./pages/Account";
import Campus from "./pages/Campus";
import Diary from "./pages/Diary";

function Loading() {
  const { t } = useT();
  return <div className="flex min-h-screen items-center justify-center text-slate-500">{t("loading")}</div>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ ok, children }: { ok: boolean; children: ReactNode }) {
  const { t } = useT();
  if (!ok) return <div className="card text-sm text-red-700">{t("noAccess")}</div>;
  return <>{children}</>;
}

export default function App() {
  const { session, can, loading, profile } = useAuth();
  const location = useLocation();

  // Auth sync: एकपटक सुरु हुँदा Zustand store, Supabase auth परिवर्तनमा स्वतः अपडेट
  useEffect(() => useAuthStore.getState().init(), []);

  // Reset link कुनै पनि path मा आए पनि नयाँ पासवर्ड पृष्ठमा लैजाने
  useEffect(() => {
    if (window.location.hash.includes("type=recovery") && window.location.pathname !== "/reset-password") {
      window.location.replace("/reset-password" + window.location.hash);
    }
  }, []);

  if (loading) return <Loading />;

  // पासवर्ड रिसेट भएको user ले पहिले नयाँ पासवर्ड सेट गर्नुपर्छ
  if (
    session &&
    profile?.must_change_password &&
    location.pathname !== "/account" &&
    location.pathname !== "/reset-password"
  ) {
    return <Navigate to="/account" replace />;
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="account" element={<Account />} />
        <Route path="superadmins" element={<RequireRole ok={can.superAdmin}><SuperAdmins /></RequireRole>} />
        <Route path="orgs" element={<RequireRole ok={can.superAdmin}><Organizations /></RequireRole>} />
        <Route path="diary" element={<RequireRole ok={can.teacher}><Diary /></RequireRole>} />
        <Route path="campus" element={<RequireRole ok={can.campusAdmin}><Campus /></RequireRole>} />
        <Route path="departments" element={<RequireRole ok={can.campusAdmin}><Departments /></RequireRole>} />
        <Route path="classes" element={<RequireRole ok={can.campusAdmin || can.deptHead}><Classes /></RequireRole>} />
        <Route path="subjects" element={<RequireRole ok={can.campusAdmin || can.deptHead}><Subjects /></RequireRole>} />
        <Route path="members" element={<RequireRole ok={can.campusAdmin}><Members /></RequireRole>} />
        <Route path="years" element={<RequireRole ok={can.campusAdmin}><AcademicYears /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
