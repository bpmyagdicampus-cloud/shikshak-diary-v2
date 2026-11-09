import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/* ------------------------------------------------------------------ */
/* Domain types                                                        */
/* ------------------------------------------------------------------ */

export type AppRole = "admin" | "department_head" | "teacher" | "student";

export interface UserProfile {
  id: string;
  fullName: string;
  email: string | null;
  lang: "ne" | "en";
  datePref: "bs" | "ad";
  mustChangePassword: boolean;
}

export interface Membership {
  id: string;
  /** Tenant ID (DB: organizations.id / memberships.org_id) */
  campusId: string;
  campusName: string;
  role: AppRole;
  departmentId: string | null;
}

export interface CampusOption {
  id: string;
  name: string;
}

export interface RbacFlags {
  isSuperAdmin: boolean;
  isCampusAdmin: boolean;
  isDeptHead: boolean;
  isTeacher: boolean;
  isStudent: boolean;
}

export type AuthStatus = "idle" | "loading" | "ready" | "signed_out" | "error";

/* ------------------------------------------------------------------ */
/* Raw DB row shapes (Supabase responses)                              */
/* ------------------------------------------------------------------ */

interface ProfileRow {
  id: string;
  full_name: string;
  email: string | null;
  lang: "ne" | "en";
  date_pref: "bs" | "ad";
  must_change_password: boolean;
}

interface MembershipRow {
  id: string;
  org_id: string;
  role: AppRole;
  department_id: string | null;
  organizations: { name: string } | null;
}

interface OrgRow {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const ACTIVE_CAMPUS_KEY = "sd_active_campus";

interface AuthState {
  status: AuthStatus;
  errorMessage: string | null;
  session: Session | null;
  profile: UserProfile | null;
  isSuperAdmin: boolean;
  memberships: Membership[];
  campuses: CampusOption[];
  currentCampusId: string | null;

  /** Auth state बदलिँदा स्वतः sync गर्छ। Unsubscribe function फर्काउँछ। */
  init: () => () => void;
  /** Session अनुसार profile, super admin, membership, क्याम्पस सूची पुनः लोड गर्छ। */
  refresh: () => Promise<void>;
  setCurrentCampus: (campusId: string) => void;
  signOut: () => Promise<void>;
}

function readStoredCampus(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CAMPUS_KEY);
  } catch {
    return null;
  }
}

function writeStoredCampus(campusId: string): void {
  try {
    localStorage.setItem(ACTIVE_CAMPUS_KEY, campusId);
  } catch {
    /* storage unavailable: ignore */
  }
}

/** सक्रिय क्याम्पस: अघिल्लो छनोट मान्य छ भने त्यही, नभए पहिलो उपलब्ध */
function resolveCampus(preferred: string | null, campuses: CampusOption[]): string | null {
  if (preferred && campuses.some((c) => c.id === preferred)) return preferred;
  return campuses[0]?.id ?? null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "idle",
  errorMessage: null,
  session: null,
  profile: null,
  isSuperAdmin: false,
  memberships: [],
  campuses: [],
  currentCampusId: null,

  init: () => {
    void get().refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      void get().refresh();
    });
    return () => data.subscription.unsubscribe();
  },

  refresh: async () => {
    set({ status: "loading", errorMessage: null });
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData.session;

      if (!session) {
        set({
          status: "signed_out",
          session: null,
          profile: null,
          isSuperAdmin: false,
          memberships: [],
          campuses: [],
          currentCampusId: null,
        });
        return;
      }

      const uid = session.user.id;
      const [profileRes, superRes, membershipRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,lang,date_pref,must_change_password")
          .eq("id", uid)
          .maybeSingle(),
        supabase.from("platform_roles").select("user_id").eq("user_id", uid).maybeSingle(),
        supabase
          .from("memberships")
          .select("id,org_id,role,department_id,organizations(name)")
          .eq("user_id", uid)
          .eq("is_active", true),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (membershipRes.error) throw membershipRes.error;

      const profileRow = profileRes.data as ProfileRow | null;
      const isSuperAdmin = !!superRes.data;

      const profile: UserProfile | null = profileRow
        ? {
            id: profileRow.id,
            fullName: profileRow.full_name,
            email: profileRow.email,
            lang: profileRow.lang,
            datePref: profileRow.date_pref,
            mustChangePassword: profileRow.must_change_password,
          }
        : null;

      const memberships: Membership[] = ((membershipRes.data ?? []) as MembershipRow[]).map((m) => ({
        id: m.id,
        campusId: m.org_id,
        campusName: m.organizations?.name ?? "",
        role: m.role,
        departmentId: m.department_id,
      }));

      // Super admin: सबै क्याम्पस; अरू: सदस्यता भएका क्याम्पस
      let campuses: CampusOption[];
      if (isSuperAdmin) {
        const { data: orgs, error: orgErr } = await supabase
          .from("organizations")
          .select("id,name")
          .is("archived_at", null)
          .order("name");
        if (orgErr) throw orgErr;
        campuses = ((orgs ?? []) as OrgRow[]).map((o) => ({ id: o.id, name: o.name }));
      } else {
        const unique = new Map<string, string>();
        memberships.forEach((m) => unique.set(m.campusId, m.campusName));
        campuses = [...unique.entries()].map(([id, name]) => ({ id, name }));
      }

      set({
        status: "ready",
        session,
        profile,
        isSuperAdmin,
        memberships,
        campuses,
        currentCampusId: resolveCampus(readStoredCampus(), campuses),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown auth error";
      set({ status: "error", errorMessage: message });
    }
  },

  setCurrentCampus: (campusId) => {
    if (!get().campuses.some((c) => c.id === campusId)) return;
    writeStoredCampus(campusId);
    set({ currentCampusId: campusId });
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      set({ errorMessage: error.message });
      return;
    }
    set({ status: "signed_out", session: null, profile: null, memberships: [], campuses: [], currentCampusId: null, isSuperAdmin: false });
  },
}));

/* ------------------------------------------------------------------ */
/* Selectors (components इन्हीँबाट पढ्ने; logic store बाहिर नगर्ने)      */
/* ------------------------------------------------------------------ */

/** सक्रिय क्याम्पसका सदस्यताहरू */
export const selectCurrentMemberships = (s: AuthState): Membership[] =>
  s.memberships.filter((m) => m.campusId === s.currentCampusId);

/** सक्रिय क्याम्पसमा RBAC भूमिका (super admin ले सबै क्याम्पसमा) */
export const selectRbac = (s: AuthState): RbacFlags => {
  const current = selectCurrentMemberships(s);
  const has = (role: AppRole) => current.some((m) => m.role === role);
  return {
    isSuperAdmin: s.isSuperAdmin,
    isCampusAdmin: s.isSuperAdmin || has("admin"),
    isDeptHead: s.isSuperAdmin || has("department_head"),
    isTeacher: has("teacher"),
    isStudent: has("student"),
  };
};
