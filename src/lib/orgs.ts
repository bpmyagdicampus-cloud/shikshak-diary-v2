import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export type Org = { id: string; name: string; academic_year_start_month: number };

/**
 * व्यवस्थापन गर्न मिल्ने क्याम्पस।
 * Super admin: सबै; अरू admin: सदस्यता भएका admin क्याम्पस।
 * defaultOrgId = सक्रिय क्याम्पस (यदि सूचीमा छ भने), नभए पहिलो।
 */
export function useAllowedOrgs() {
  const { isSuperAdmin, memberships, loading, activeOrgId } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id,name,academic_year_start_month")
        .is("archived_at", null)
        .order("name");
      const all = (data ?? []) as Org[];
      setOrgs(isSuperAdmin ? all : all.filter((o) => memberships.some((m) => m.org_id === o.id && m.role === "admin")));
      setReady(true);
    })();
  }, [isSuperAdmin, memberships, loading]);

  const defaultOrgId = orgs.find((o) => o.id === activeOrgId)?.id ?? orgs[0]?.id ?? "";
  return { orgs, ready, defaultOrgId };
}
