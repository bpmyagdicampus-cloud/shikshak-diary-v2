import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAllowedOrgs } from "../lib/orgs";
import OrgSelect from "../components/OrgSelect";
import { useT } from "../lib/i18n";

type Opt = { id: string; name: string; name_en?: string | null };
type Cls = { id: string; name: string; department_id: string; program_id: string | null };
type Sec = { id: string; class_id: string; name: string };

export default function Classes() {
  const { tx, pick } = useT();
  const { orgs, ready } = useAllowedOrgs();
  const [orgId, setOrgId] = useState("");
  const [years, setYears] = useState<Opt[]>([]);
  const [yearId, setYearId] = useState("");
  const [depts, setDepts] = useState<Opt[]>([]);
  const [programs, setPrograms] = useState<(Opt & { department_id: string })[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [sections, setSections] = useState<Sec[]>([]);

  const [deptId, setDeptId] = useState("");
  const [progId, setProgId] = useState("");
  const [name, setName] = useState("");
  const [secName, setSecName] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (ready && orgs[0] && !orgId) setOrgId(orgs[0].id);
  }, [ready, orgs, orgId]);

  const loadBase = async (id: string) => {
    const [y, d, p] = await Promise.all([
      supabase.from("academic_years").select("id,name,is_active").eq("org_id", id).order("start_date", { ascending: false }),
      supabase.from("departments").select("id,name,name_en").eq("org_id", id).order("name"),
      supabase.from("programs").select("id,name,department_id").eq("org_id", id).order("name"),
    ]);
    const ys = (y.data ?? []) as (Opt & { is_active: boolean })[];
    setYears(ys);
    setYearId((cur) => cur || ys.find((x) => x.is_active)?.id || ys[0]?.id || "");
    setDepts((d.data ?? []) as Opt[]);
    setPrograms((p.data ?? []) as (Opt & { department_id: string })[]);
  };

  const loadClasses = async (yid: string) => {
    const { data } = await supabase.from("classes").select("id,name,department_id,program_id").eq("academic_year_id", yid).order("name");
    const cs = (data ?? []) as Cls[];
    setClasses(cs);
    if (cs.length) {
      const { data: s } = await supabase.from("sections").select("id,class_id,name").in("class_id", cs.map((c) => c.id)).order("name");
      setSections((s ?? []) as Sec[]);
    } else setSections([]);
  };

  useEffect(() => {
    if (orgId) void loadBase(orgId);
  }, [orgId]);

  useEffect(() => {
    if (yearId) void loadClasses(yearId);
  }, [yearId]);

  // विभाग छानिएपछि त्यसका कार्यक्रम मात्र देखाउने (पुनः प्रयोग)
  const deptPrograms = programs.filter((p) => p.department_id === deptId);

  const addClass = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    const { error } = await supabase.from("classes").insert({
      org_id: orgId,
      academic_year_id: yearId,
      department_id: deptId,
      program_id: progId || null,
      name: name.trim(),
    });
    if (error) return setMsg(error.message);
    setName("");
    await loadClasses(yearId);
  };

  const addSection = async (classId: string) => {
    const v = (secName[classId] || "").trim();
    if (!v) return;
    const { error } = await supabase.from("sections").insert({ class_id: classId, name: v });
    if (error) return setMsg(error.message);
    setSecName({ ...secName, [classId]: "" });
    await loadClasses(yearId);
  };

  const removeSection = async (id: string) => {
    const { error } = await supabase.from("sections").delete().eq("id", id);
    if (error) return setMsg(error.message);
    await loadClasses(yearId);
  };

  const deptName = (id: string) => depts.find((d) => d.id === id)?.name ?? "—";
  const progName = (id: string | null) => programs.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tx("कक्षा र सेक्सन · Classes & Sections", "Classes & Sections")}</h1>
      <div className="flex flex-wrap gap-3">
        <OrgSelect orgs={orgs} value={orgId} onChange={setOrgId} />
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium">{tx("शैक्षिक वर्ष · Academic year", "Academic year")}</span>
          <select className="field" value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_active ? " (Active)" : ""}</option>)}
          </select>
        </label>
      </div>

      <form onSubmit={addClass} className="card grid gap-3 sm:grid-cols-3">
        <select className="field" required value={deptId} onChange={(e) => { setDeptId(e.target.value); setProgId(""); }}>
          <option value="">{tx("विभाग छान्नुहोस्", "Select department")}</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{pick(d.name, d.name_en)}</option>)}
        </select>
        <select className="field" value={progId} onChange={(e) => setProgId(e.target.value)} disabled={!deptId}>
          <option value="">{tx("कार्यक्रम (वैकल्पिक)", "Program (optional)")}</option>
          {deptPrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="field" required placeholder={tx("कक्षा (जस्तै MBS III)", "Class (e.g. MBS III)")} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="sm:col-span-3"><button className="btn" disabled={!yearId}>{tx("कक्षा थप्नुहोस्", "Add class")}</button></div>
      </form>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="space-y-3">
        {classes.map((c) => (
          <div key={c.id} className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold">{c.name}</div>
              <div className="text-xs text-slate-500">{deptName(c.department_id)} · {progName(c.program_id)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {sections.filter((s) => s.class_id === c.id).map((s) => (
                <span key={s.id} className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-sm">
                  {tx("सेक्सन", "Section")} {s.name}
                  <button className="text-xs text-red-600" onClick={() => void removeSection(s.id)}>×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="field max-w-[10rem]" placeholder={tx("सेक्सन (A, B…)", "Section (A, B…)")} value={secName[c.id] || ""} onChange={(e) => setSecName({ ...secName, [c.id]: e.target.value })} />
              <button className="btn-ghost" onClick={() => void addSection(c.id)}>{tx("सेक्सन थप्नुहोस्", "Add section")}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
