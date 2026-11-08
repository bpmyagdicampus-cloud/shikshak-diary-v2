import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
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

type AuthCtx = {
  session: Session | null;
  profile: Profile | null;
  isSuperAdmin: boolean;
  memberships: Membership[];
  loading: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setIsSuperAdmin(false);
      setMemberships([]);
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
    setProfile((p.data as Profile) ?? null);
    setIsSuperAdmin(!!sa.data);
    setMemberships(
      ((m.data ?? []) as any[]).map((r) => ({
        org_id: r.org_id,
        role: r.role,
        department_id: r.department_id,
        org_name: r.organizations?.name ?? "",
      }))
    );
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

  const reload = useCallback(() => load(session), [load, session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ session, profile, isSuperAdmin, memberships, loading, reload, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
