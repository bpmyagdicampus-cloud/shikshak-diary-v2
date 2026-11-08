import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAllowedOrgs } from "../lib/orgs";
import OrgSelect from "../components/OrgSelect";
import { useT } from "../lib/i18n";

type Dept = { id: string; name: string; name_en: string | null };
type Program = { id: string; name: string; department_id: string };

export default function Departments() {
  const { tx, pick } = useT();
  const [deptNameEn, setDeptNameEn] = useState("");
  const { orgs, ready } = useAllowedOrgs();
  const [orgId, setOrgId] = useState("");
  const [depts, setDepts] = useState<Dept[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [deptName, setDeptName] = useState("");
  const [progName, setProgName] = useState("");
  const [progDept, setProgDept] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (ready && orgs[0] && !orgId) setOrgId(orgs[0].id);
  }, [ready, orgs, orgId]);

  const load = async (id: string) => {
    const [d, p] = await Promise.all([
      supabase.from("departments").select("id,name,name_en").eq("org_id", id).order("name"),
      supabase.from("programs").select("id,name,department_id").eq("org_id", id).order("name"),
    ]);
    setDepts((d.data ?? []) as Dept[]);
    setPrograms((p.data ?? []) as Program[]);
  };

  useEffect(() => {
    if (orgId) void load(orgId);
  }, [orgId]);

  const addDept = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("departments").insert({ org_id: orgId, name: deptName.trim(), name_en: deptNameEn.trim() || null });
    if (error) return setMsg(error.message);
    setDeptName("");
    setDeptNameEn("");
    setMsg(tx("सुरक्षित भयो", "Saved"));
    await load(orgId);
  };

  const addProgram = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("programs").insert({ org_id: orgId, department_id: progDept, name: progName.trim() });
    if (error) return setMsg(error.message);
    setProgName("");
    setMsg(tx("सुरक्षित भयो", "Saved"));
    await load(orgId);
  };

  const removeDept = async (id: string) => {
    if (!confirm(tx("यो विभाग मेट्ने? यससँग जोडिएका कार्यक्रम, कक्षा र विषय पनि मेटिन सक्छन्।", "Delete this department? Linked programs, classes and subjects may also be deleted."))) return;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) return setMsg(error.message);
    await load(orgId);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tx("विभाग र कार्यक्रम · Departments & Programs", "Departments & Programs")}</h1>
      <OrgSelect orgs={orgs} value={orgId} onChange={setOrgId} />

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={addDept} className="card space-y-3">
          <div className="font-semibold">{tx("नयाँ विभाग · New department", "New department")}</div>
          <input className="field" required placeholder={tx("विभागको नाम (नेपाली)", "Department name (Nepali)")} value={deptName} onChange={(e) => setDeptName(e.target.value)} />
          <input className="field" placeholder={tx("English नाम (वैकल्पिक)", "English name (optional)")} value={deptNameEn} onChange={(e) => setDeptNameEn(e.target.value)} />
          <button className="btn">{tx("थप्नुहोस्", "Add")}</button>
        </form>

        <form onSubmit={addProgram} className="card space-y-3">
          <div className="font-semibold">{tx("नयाँ कार्यक्रम · New program", "New program")}</div>
          <select className="field" required value={progDept} onChange={(e) => setProgDept(e.target.value)}>
            <option value="">{tx("विभाग छान्नुहोस्", "Select department")}</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input className="field" required placeholder={tx("कार्यक्रमको नाम (जस्तै MBS)", "Program name (e.g. MBS)")} value={progName} onChange={(e) => setProgName(e.target.value)} />
          <button className="btn">{tx("थप्नुहोस्", "Add")}</button>
        </form>
      </div>

      {msg && <p className="text-sm text-slate-600">{msg}</p>}

      <div className="space-y-3">
        {depts.map((d) => (
          <div key={d.id} className="card">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{pick(d.name, d.name_en)}</div>
              <button className="btn-ghost text-xs" onClick={() => void removeDept(d.id)}>{tx("मेटाउनुहोस्", "Delete")}</button>
            </div>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
              {programs.filter((p) => p.department_id === d.id).map((p) => <li key={p.id}>{p.name}</li>)}
              {!programs.some((p) => p.department_id === d.id) && <li className="list-none text-slate-400">{tx("कार्यक्रम छैन", "No programs")}</li>}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
