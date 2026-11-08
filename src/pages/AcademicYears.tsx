import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { academicYearName, bsToAdIso, displayDate } from "../lib/dates";

type Org = { id: string; name: string; academic_year_start_month: number };
type Year = { id: string; name: string; calendar_system: "bs" | "ad"; start_date: string; end_date: string; is_active: boolean };

/** अर्को दिन: ISO मितिबाट एक दिन घटाउने */
function dayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export default function AcademicYears() {
  const { tx } = useT();
  const { t } = useT();
  const { profile, isSuperAdmin, memberships } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [years, setYears] = useState<Year[]>([]);
  const [system, setSystem] = useState<"bs" | "ad">("bs");
  const [bsYear, setBsYear] = useState(2083);
  const [adStart, setAdStart] = useState("");
  const [adEnd, setAdEnd] = useState("");
  const [msg, setMsg] = useState("");
  const pref = profile?.date_pref ?? "bs";

  // Admin ले आफ्नै संस्था मात्र; super admin ले सबै
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("organizations").select("id,name,academic_year_start_month").order("name");
      const all = (data ?? []) as Org[];
      const allowed = isSuperAdmin ? all : all.filter((o) => memberships.some((m) => m.org_id === o.id && m.role === "admin"));
      setOrgs(allowed);
      if (allowed[0]) setOrgId(allowed[0].id);
    })();
  }, [isSuperAdmin, memberships]);

  const org = orgs.find((o) => o.id === orgId);

  const loadYears = async (id: string) => {
    const { data, error } = await supabase
      .from("academic_years")
      .select("id,name,calendar_system,start_date,end_date,is_active")
      .eq("org_id", id)
      .order("start_date", { ascending: false });
    if (error) setMsg(error.message);
    else setYears((data ?? []) as Year[]);
  };

  useEffect(() => {
    if (orgId) void loadYears(orgId);
  }, [orgId]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setMsg("");

    let name: string;
    let start: string;
    let end: string;

    if (system === "bs") {
      // BS: श्रावण (संस्थाको सुरु महिना) देखि अर्को वर्षको सुरु अघिल्लो दिनसम्म
      const m = org.academic_year_start_month;
      start = bsToAdIso(bsYear, m, 1);
      end = dayBefore(bsToAdIso(bsYear + 1, m, 1));
      name = academicYearName(bsYear);
    } else {
      if (!adStart || !adEnd) return setMsg(tx("AD सुरु र अन्त्य मिति भर्नुहोस्।", "Enter AD start and end dates."));
      start = adStart;
      end = adEnd;
      name = `${adStart.slice(0, 4)}/${adEnd.slice(2, 4)}`;
    }

    if (end <= start) return setMsg(tx("अन्त्य मिति सुरु मितिभन्दा पछि हुनुपर्छ।", "End date must be after start date."));

    // एउटा संस्थामा एउटै मात्र सक्रिय वर्ष: पुरानो सक्रिय हटाएर नयाँ सक्रिय
    // पहिलो वर्ष स्वतः सक्रिय हुन्छ
    const makeActive = years.length === 0;
    const { error } = await supabase.from("academic_years").insert({
      org_id: org.id,
      name,
      calendar_system: system,
      start_date: start,
      end_date: end,
      is_active: makeActive,
    });
    if (error) return setMsg(error.message);
    setMsg(t("saved"));
    await loadYears(org.id);
  };

  const activate = async (y: Year) => {
    if (!org) return;
    // पहिले सबै निष्क्रिय, त्यसपछि छानिएको सक्रिय (unique index अनुसार)
    const off = await supabase.from("academic_years").update({ is_active: false }).eq("org_id", org.id);
    if (off.error) return setMsg(off.error.message);
    const on = await supabase.from("academic_years").update({ is_active: true }).eq("id", y.id);
    if (on.error) return setMsg(on.error.message);
    await loadYears(org.id);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("academicYears")}</h1>

      {orgs.length > 1 && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t("organizations")}</span>
          <select className="field max-w-sm" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      <form onSubmit={create} className="card space-y-3">
        <div className="text-sm font-medium">{t("calendar")}</div>
        <div className="flex gap-2">
          <button type="button" className={system === "bs" ? "btn" : "btn-ghost"} onClick={() => setSystem("bs")}>{t("bs")}</button>
          <button type="button" className={system === "ad" ? "btn" : "btn-ghost"} onClick={() => setSystem("ad")}>{t("ad")}</button>
        </div>

        {system === "bs" ? (
          <label className="block max-w-xs text-sm">
            <span className="mb-1 block font-medium">{tx("BS वर्ष (जस्तै 2083)", "BS year (e.g. 2083)")}</span>
            <input className="field" type="number" min={2000} max={2099} value={bsYear} onChange={(e) => setBsYear(Number(e.target.value))} />
            <span className="mt-1 block text-xs text-slate-500">
              {tx("सुरु: महिना", "Start: month")} {org?.academic_year_start_month ?? 4}, {tx("गते १", "day 1")}
            </span>
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">{t("startDate")}</span>
              <input className="field" type="date" required value={adStart} onChange={(e) => setAdStart(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">{t("endDate")}</span>
              <input className="field" type="date" required value={adEnd} onChange={(e) => setAdEnd(e.target.value)} />
            </label>
          </div>
        )}

        <button className="btn" disabled={!org}>{t("create")}</button>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </form>

      <div className="space-y-2">
        {years.map((y) => (
          <div key={y.id} className="card flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">
                {y.name} {y.is_active && <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Active</span>}
              </div>
              <div className="text-xs text-slate-500">
                {displayDate(y.start_date, pref)} → {displayDate(y.end_date, pref)} · {y.calendar_system.toUpperCase()}
              </div>
            </div>
            {!y.is_active && <button className="btn-ghost text-xs" onClick={() => void activate(y)}>{tx("Active बनाउनुहोस्", "Make active")}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
