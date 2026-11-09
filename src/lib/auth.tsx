import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "admin" | "department_head" | "teacher" | "student";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  lang: "ne" | "en";
  date_pref: "bs" | "ad";
};

export type Membership = {
  org_id: string;
  role: Role;
  department_id: string | null;
  org_name: string;
};

export type OrgOption = { id: string; name: string };

/** सक्रिय क्याम्पसमा user का भूमिका (हरेक क्याम्पसमा छुट्टै) */
export type CampusRoles = {
  superAdmin: boolean;
  campusAdmin: boolean;
  deptHead: boolean;
  teacher: boolean;
  student: boolean;
};

type AuthCtx = {
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

const Ctx = createContext<AuthCtx | null>(null);
const ACTIVE_KEY = "sd_active_org";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(true);

  const setActiveOrg = useCallback((id: string) => {
    setActiveOrgId(id);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setIsSuperAdmin(false);
      setMemberships([]);
      setOrgOptions([]);
      setLoading(false);
      return;
    }
    const uid = s.user.id;
    const [p, sa, m] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,lang,date_pref").eq("id", uid).maybeSingle(),
      supabase.from("platform_roles").select("user_id").eq("user_id", uid).maybeSingle(),
      supabase
        .from("memberships")
        .select("org_id,role,department_id,is_active, organizations(name)")
        .eq("user_id", uid)
        .eq("is_active", true),
    ]);
    const superAdmin = !!sa.data;
    const mem: Membership[] = ((m.data ?? []) as any[]).map((r) => ({
      org_id: r.org_id,
      role: r.role,
      department_id: r.department_id,
      org_name: r.organizations?.name ?? "",
    }));

    setProfile((p.data as Profile) ?? null);
    setIsSuperAdmin(superAdmin);
    setMemberships(mem);

    // Super admin: सबै क्याम्पस; अरूलाई आफ्नो सदस्यताका क्याम्पस
    if (superAdmin) {
      const { data: all } = await supabase.from("organizations").select("id,name").is("archived_at", null).order("name");
      setOrgOptions(((all ?? []) as OrgOption[]));
    } else {
      const uniq = new Map<string, string>();
      mem.forEach((x) => uniq.set(x.org_id, x.org_name));
      setOrgOptions([...uniq.entries()].map(([id, name]) => ({ id, name })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void load(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      void load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // सक्रिय क्याम्पस अमान्य भए पहिलो उपलब्ध क्याम्पस छान्ने
  useEffect(() => {
    if (!orgOptions.length) return;
    if (!orgOptions.some((o) => o.id === activeOrgId)) {
      setActiveOrg(orgOptions[0].id);
    }
  }, [orgOptions, activeOrgId, setActiveOrg]);

  const activeMemberships = useMemo(
    () => memberships.filter((m) => m.org_id === activeOrgId),
    [memberships, activeOrgId]
  );

  // भूमिका सधैँ सक्रिय क्याम्पस अनुसार (super admin बाहेक)
  const can: CampusRoles = useMemo(() => {
    const has = (r: Role) => activeMemberships.some((m) => m.role === r);
    return {
      superAdmin: isSuperAdmin,
      campusAdmin: isSuperAdmin || has("admin"),
      deptHead: isSuperAdmin || has("department_head"),
      teacher: has("teacher"),
      student: has("student"),
    };
  }, [isSuperAdmin, activeMemberships]);

  const reload = useCallback(() => load(session), [load, session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider
      value={{
        session,
        profile,
        isSuperAdmin,
        memberships,
        activeOrgId,
        setActiveOrg,
        activeMemberships,
        orgOptions,
        can,
        loading,
        reload,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
