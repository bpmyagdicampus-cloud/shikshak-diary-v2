import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export type Org = { id: string; name: string; academic_year_start_month: number };

/** Super admin ले सबै, admin ले आफ्नो संस्था मात्र */
export function useAllowedOrgs() {
  const { isSuperAdmin, memberships, loading } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id,name,academic_year_start_month")
        .order("name");
      const all = (data ?? []) as Org[];
      setOrgs(isSuperAdmin ? all : all.filter((o) => memberships.some((m) => m.org_id === o.id && m.role === "admin")));
      setReady(true);
    })();
  }, [isSuperAdmin, memberships, loading]);

  return { orgs, ready };
}
