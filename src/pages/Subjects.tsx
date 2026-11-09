import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAllowedOrgs } from "../lib/orgs";
import OrgSelect from "../components/OrgSelect";
import { useT } from "../lib/i18n";

type Opt = { id: string; name: string; name_en?: string | null };
type Subj = { id: string; name: string; code: string | null; department_id: string };
type Cls = { id: string; name: string; department_id: string };
type Link = { id: string; class_id: string; subject_id: string; teacher_user_id: string | null; total_lh: number };
type Teacher = { user_id: string; name: string; department_id: string };

export default function Subjects() {
  const { tx, pick } = useT();
  const { orgs, ready, defaultOrgId } = useAllowedOrgs();
  const [orgId, setOrgId] = useState("");
  const [yearId, setYearId] = useState("");
  const [years, setYears] = useState<Opt[]>([]);
  const [depts, setDepts] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Subj[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [msg, setMsg] = useState("");

  // विषय थप्ने
  const [sDept, setSDept] = useState("");
  const [sName, setSName] = useState("");
  const [sCode, setSCode] = useState("");
  // कक्षामा विषय जोड्ने (पुनः प्रयोग: छानेको विषय र शिक्षक)
  const [lClass, setLClass] = useState("");
  const [lSubject, setLSubject] = useState("");
  const [lTeacher, setLTeacher] = useState("");
  const [lLh, setLLh] = useState(60);

  useEffect(() => {
    if (ready && defaultOrgId) setOrgId(defaultOrgId);
  }, [ready, defaultOrgId]);

  const loadBase = async (id: string) => {
    const [y, d, s, m] = await Promise.all([
      supabase.from("academic_years").select("id,name,is_active").eq("org_id", id).order("start_date", { ascending: false }),
      supabase.from("departments").select("id,name,name_en").eq("org_id", id).order("name"),
      supabase.from("subjects").select("id,name,code,department_id").eq("org_id", id).order("name"),
      supabase.from("memberships").select("user_id,department_id,profiles(full_name,email)").eq("org_id", id).eq("role", "teacher").eq("is_active", true),
    ]);
    const ys = (y.data ?? []) as (Opt & { is_active: boolean })[];
    setYears(ys);
    setYearId((cur) => cur || ys.find((x) => x.is_active)?.id || ys[0]?.id || "");
    setDepts((d.data ?? []) as Opt[]);
    setSubjects((s.data ?? []) as Subj[]);
    setTeachers(
      ((m.data ?? []) as any[]).map((r) => ({
        user_id: r.user_id,
        department_id: r.department_id,
        name: r.profiles?.full_name || r.profiles?.email || "",
      }))
    );
  };

  const loadYear = async (yid: string) => {
    const [c, l] = await Promise.all([
      supabase.from("classes").select("id,name,department_id").eq("academic_year_id", yid).order("name"),
      supabase.from("class_subjects").select("id,class_id,subject_id,teacher_user_id,total_lh"),
    ]);
    const cs = (c.data ?? []) as Cls[];
    setClasses(cs);
    const ids = new Set(cs.map((x) => x.id));
    setLinks(((l.data ?? []) as Link[]).filter((x) => ids.has(x.class_id)));
  };

  useEffect(() => {
    if (orgId) void loadBase(orgId);
  }, [orgId]);
  useEffect(() => {
    if (yearId) void loadYear(yearId);
  }, [yearId]);

  const addSubject = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("subjects").insert({
      org_id: orgId,
      department_id: sDept,
      name: sName.trim(),
      code: sCode.trim() || null,
    });
    if (error) return setMsg(error.message);
    setSName("");
    setSCode("");
    await loadBase(orgId);
  };

  const linkClassSubject = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    const { error } = await supabase.from("class_subjects").insert({
      class_id: lClass,
      subject_id: lSubject,
      teacher_user_id: lTeacher || null,
      total_lh: lLh,
    });
    if (error) return setMsg(error.message);
    await loadYear(yearId);
  };

  // कक्षा छानिएपछि त्यस विभागका विषय र शिक्षक मात्र देखाउने
  const chosenClass = classes.find((c) => c.id === lClass);
  const deptSubjects = subjects.filter((s) => s.department_id === chosenClass?.department_id);
  const deptTeachers = teachers.filter((t) => t.department_id === chosenClass?.department_id);
  const subjName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "—";
  const teacherName = (id: string | null) => teachers.find((t) => t.user_id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tx("विषय · Subjects", "Subjects")}</h1>
      <div className="flex flex-wrap gap-3">
        <OrgSelect orgs={orgs} value={orgId} onChange={setOrgId} />
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium">{tx("शैक्षिक वर्ष", "Academic year")}</span>
          <select className="field" value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </label>
      </div>

      <form onSubmit={addSubject} className="card grid gap-3 sm:grid-cols-4">
        <select className="field" required value={sDept} onChange={(e) => setSDept(e.target.value)}>
          <option value="">{tx("विभाग", "Department")}</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{pick(d.name, d.name_en)}</option>)}
        </select>
        <input className="field" required placeholder={tx("विषयको नाम", "Subject name")} value={sName} onChange={(e) => setSName(e.target.value)} />
        <input className="field" placeholder={tx("कोड (वैकल्पिक)", "Code (optional)")} value={sCode} onChange={(e) => setSCode(e.target.value)} />
        <button className="btn">{tx("विषय थप्नुहोस्", "Add subject")}</button>
      </form>

      <form onSubmit={linkClassSubject} className="card grid gap-3 sm:grid-cols-5">
        <select className="field" required value={lClass} onChange={(e) => { setLClass(e.target.value); setLSubject(""); setLTeacher(""); }}>
          <option value="">{tx("कक्षा", "Class")}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="field" required value={lSubject} onChange={(e) => setLSubject(e.target.value)} disabled={!lClass}>
          <option value="">{tx("विषय", "Subject")}</option>
          {deptSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="field" value={lTeacher} onChange={(e) => setLTeacher(e.target.value)} disabled={!lClass}>
          <option value="">{tx("शिक्षक (पछि)", "Teacher (later)")}</option>
          {deptTeachers.map((t) => <option key={t.user_id} value={t.user_id}>{t.name}</option>)}
        </select>
        <input className="field" type="number" min={0} value={lLh} onChange={(e) => setLLh(Number(e.target.value))} placeholder={tx("कुल LH", "Total LH")} />
        <button className="btn" disabled={!lClass || !lSubject}>{tx("कक्षामा जोड्नुहोस्", "Link to class")}</button>
      </form>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="space-y-2">
        {links.map((l) => (
          <div key={l.id} className="card flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <b>{classes.find((c) => c.id === l.class_id)?.name}</b> · {subjName(l.subject_id)}
            </div>
            <div className="text-slate-500">{tx("शिक्षक", "Teacher")}: {teacherName(l.teacher_user_id)} · LH: {l.total_lh}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
