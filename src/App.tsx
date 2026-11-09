import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
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
  const { session, isSuperAdmin, memberships, loading } = useAuth();
  if (loading) return <Loading />;
  const isAdmin = memberships.some((m) => m.role === "admin");
  const isHead = memberships.some((m) => m.role === "department_head");
  const staff = isSuperAdmin || isAdmin;

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="superadmins" element={<RequireRole ok={isSuperAdmin}><SuperAdmins /></RequireRole>} />
        <Route path="orgs" element={<RequireRole ok={isSuperAdmin}><Organizations /></RequireRole>} />
        <Route path="departments" element={<RequireRole ok={staff}><Departments /></RequireRole>} />
        <Route path="classes" element={<RequireRole ok={staff || isHead}><Classes /></RequireRole>} />
        <Route path="subjects" element={<RequireRole ok={staff || isHead}><Subjects /></RequireRole>} />
        <Route path="members" element={<RequireRole ok={staff}><Members /></RequireRole>} />
        <Route path="years" element={<RequireRole ok={staff}><AcademicYears /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
