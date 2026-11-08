import { useAuth } from "../lib/auth";
import { useT, type TKey } from "../lib/i18n";

const ROLE_KEY: Record<string, TKey> = {
  admin: "admin",
  department_head: "departmentHead",
  teacher: "teacher",
  student: "student",
};

export default function Dashboard() {
  const { t } = useT();
  const { profile, isSuperAdmin, memberships } = useAuth();

  const roles: string[] = [];
  if (isSuperAdmin) roles.push(t("superAdmin"));
  for (const m of memberships) {
    const k = ROLE_KEY[m.role];
    if (k) roles.push(`${t(k)} — ${m.org_name}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {t("welcome")}, {profile?.full_name || profile?.email}
      </h1>
      <div className="card">
        <ul className="list-disc pl-5 text-sm">
          {roles.length ? roles.map((r) => <li key={r}>{r}</li>) : <li>—</li>}
        </ul>
      </div>
    </div>
  );
}
