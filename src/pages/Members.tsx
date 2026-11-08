import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAllowedOrgs } from "../lib/orgs";
import OrgSelect from "../components/OrgSelect";
import { useT } from "../lib/i18n";

type Dept = { id: string; name: string; name_en?: string | null };
type Row = {
  id: string;
  user_id: string;
  role: string;
  department_id: string | null;
  is_active: boolean;
  profiles: { full_name: string; email: string | null; phone: string | null } | null;
};

const ROLES = [
  { v: "admin", ne: "एडमिन", en: "Admin" },
  { v: "department_head", ne: "विभाग प्रमुख", en: "Department head" },
  { v: "teacher", ne: "शिक्षक", en: "Teacher" },
  { v: "student", ne: "विद्यार्थी", en: "Student" },
];

export default function Members() {
  const { tx, pick } = useT();
  const { orgs, ready } = useAllowedOrgs();
  const [orgId, setOrgId] = useState("");
  const [depts, setDepts] = useState<Dept[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");

  // नयाँ सदस्यता (user पहिल्यै बनेको हुनुपर्छ; इमेलबाट खोजिन्छ)
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("teacher");
  const [dept, setDept] = useState("");

  // सम्पादन
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");

  useEffect(() => {
    if (ready && orgs[0] && !orgId) setOrgId(orgs[0].id);
  }, [ready, orgs, orgId]);

  const load = async (id: string) => {
    const [d, m] = await Promise.all([
      supabase.from("departments").select("id,name,name_en").eq("org_id", id).order("name"),
      supabase
        .from("memberships")
        .select("id,user_id,role,department_id,is_active,profiles(full_name,email,phone)")
        .eq("org_id", id)
        .order("created_at"),
    ]);
    setDepts((d.data ?? []) as Dept[]);
    setRows((m.data ?? []) as unknown as Row[]);
  };

  useEffect(() => {
    if (orgId) void load(orgId);
  }, [orgId]);

  const deptName = (id: string | null) => depts.find((d) => d.id === id)?.name ?? "—";
  const needsDept = role === "department_head" || role === "teacher";

  const addMember = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (needsDept && !dept) return setMsg(tx("विभाग छान्नुहोस्।", "Please select a department."));
    // इमेलबाट user खोज्ने (सुरक्षित RPC: केवल id र नाम फर्काउँछ)
    const { data: found, error: pErr } = await supabase.rpc("find_user_by_email", { p_email: email.trim() });
    if (pErr) return setMsg(pErr.message);
    const prof = (found as { id: string }[] | null)?.[0];
    if (!prof) return setMsg(tx("यो इमेलको user भेटिएन। पहिले user बनाइएको हुनुपर्छ।", "No user found with this email. Create the user first."));

    const { error } = await supabase.from("memberships").insert({
      user_id: prof.id,
      org_id: orgId,
      role,
      department_id: needsDept ? dept : (dept || null),
    });
    if (error) return setMsg(error.message);
    setEmail("");
    setMsg(tx("सदस्यता थपियो", "Member added"));
    await load(orgId);
  };

  const toggle = async (r: Row) => {
    const { error } = await supabase.from("memberships").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return setMsg(error.message);
    await load(orgId);
  };

  const startEdit = (r: Row) => {
    setEditId(r.user_id);
    setEName(r.profiles?.full_name ?? "");
    setEPhone(r.profiles?.phone ?? "");
  };

  const saveEdit = async () => {
    if (!editId) return;
    const { error } = await supabase.from("profiles").update({ full_name: eName.trim(), phone: ePhone.trim() || null }).eq("id", editId);
    if (error) return setMsg(error.message);
    setEditId(null);
    await load(orgId);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tx("सदस्य र भूमिका · Members & Roles", "Members & Roles")}</h1>
      <OrgSelect orgs={orgs} value={orgId} onChange={setOrgId} />

      <form onSubmit={addMember} className="card grid gap-3 sm:grid-cols-4">
        <input className="field" type="email" required placeholder={tx("इमेल (user पहिल्यै बनेको)", "Email (existing user)")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.v} value={r.v}>{tx(r.ne, r.en)}</option>)}
        </select>
        <select className="field" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">{needsDept ? tx("विभाग (अनिवार्य)", "Department (required)") : tx("विभाग (वैकल्पिक)", "Department (optional)")}</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{pick(d.name, d.name_en)}</option>)}
        </select>
        <button className="btn">{tx("सदस्य थप्नुहोस्", "Add member")}</button>
      </form>

      {msg && <p className="text-sm text-slate-600">{msg}</p>}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className={`card space-y-2 ${r.is_active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{r.profiles?.full_name || "—"}</div>
                <div className="text-xs text-slate-500">
                  {r.profiles?.email} · {ROLES.find((x) => x.v === r.role) && tx(ROLES.find((x) => x.v === r.role)!.ne, ROLES.find((x) => x.v === r.role)!.en)} · {deptName(r.department_id)}
                  {r.profiles?.phone ? ` · ${r.profiles.phone}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost text-xs" onClick={() => startEdit(r)}>{tx("सम्पादन", "Edit")}</button>
                <button className="btn-ghost text-xs" onClick={() => void toggle(r)}>{r.is_active ? tx("निष्क्रिय", "Deactivate") : tx("सक्रिय", "Activate")}</button>
              </div>
            </div>
            {editId === r.user_id && (
              <div className="grid gap-2 border-t border-slate-200 pt-2 sm:grid-cols-3">
                <input className="field" placeholder={tx("पूरा नाम", "Full name")} value={eName} onChange={(e) => setEName(e.target.value)} />
                <input className="field" placeholder={tx("फोन", "Phone")} value={ePhone} onChange={(e) => setEPhone(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn" onClick={() => void saveEdit()}>{tx("सेभ", "Save")}</button>
                  <button className="btn-ghost" onClick={() => setEditId(null)}>{tx("रद्द", "Cancel")}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
