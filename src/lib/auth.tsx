/**
 * Compatibility hook: AuthProvider हटाइयो।
 * सबै auth state अब Zustand store (`./store`) बाट आउँछ।
 * यो hook केवल पुराना field नाम (full_name, org_id आदि) भएका पृष्ठहरूलाई
 * अस्थायी रूपमा चलाउन छ; नयाँ code ले सिधै `useAuthStore` / `selectRbac` प्रयोग गर्नुपर्छ।
 */
import { useMemo } from "react";
import type { Session } from "@supabase/supabase-js";
import { useAuthStore, selectRbac, type AppRole } from "./store";

export type Role = AppRole;

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  lang: "ne" | "en";
  date_pref: "bs" | "ad";
  must_change_password: boolean;
};

export type Membership = {
  org_id: string;
  role: Role;
  department_id: string | null;
  org_name: string;
};

export type OrgOption = { id: string; name: string };

export type CampusRoles = {
  superAdmin: boolean;
  campusAdmin: boolean;
  deptHead: boolean;
  teacher: boolean;
  student: boolean;
};

export type AuthView = {
  session: Session | null;
  profile: Profile | null;
  isSuperAdmin: boolean;
  memberships: Membership[];
  activeOrgId: string;
  setActiveOrg: (id: string) => void;
  activeMemberships: Membership[];
  orgOptions: OrgOption[];
  can: CampusRoles;
  loading: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useAuth(): AuthView {
  const s = useAuthStore();

  return useMemo<AuthView>(() => {
    const profile: Profile | null = s.profile
      ? {
          id: s.profile.id,
          full_name: s.profile.fullName,
          email: s.profile.email,
          lang: s.profile.lang,
          date_pref: s.profile.datePref,
          must_change_password: s.profile.mustChangePassword,
        }
      : null;

    const memberships: Membership[] = s.memberships.map((m) => ({
      org_id: m.campusId,
      role: m.role,
      department_id: m.departmentId,
      org_name: m.campusName,
    }));

    const rbac = selectRbac(s);

    return {
      session: s.session,
      profile,
      isSuperAdmin: s.isSuperAdmin,
      memberships,
      activeOrgId: s.currentCampusId ?? "",
      setActiveOrg: s.setCurrentCampus,
      activeMemberships: memberships.filter((m) => m.org_id === s.currentCampusId),
      orgOptions: s.campuses.map((c) => ({ id: c.id, name: c.name })),
      can: {
        superAdmin: rbac.isSuperAdmin,
        campusAdmin: rbac.isCampusAdmin,
        deptHead: rbac.isDeptHead,
        teacher: rbac.isTeacher,
        student: rbac.isStudent,
      },
      loading: s.status === "idle" || s.status === "loading",
      reload: s.refresh,
      signOut: s.signOut,
    };
  }, [s]);
}
