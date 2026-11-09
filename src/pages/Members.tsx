import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAllowedOrgs } from "../lib/orgs";
import OrgSelect from "../components/OrgSelect";
import NewUserForm from "../components/NewUserForm";
import { useAuth } from "../lib/auth";
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
  const { orgs, ready, defaultOrgId } = useAllowedOrgs();
  const { can } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [depts, setDepts] = useState<Dept[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [resetInfo, setResetInfo] = useState<{ name: string; pw: string } | null>(null);

  const resetPassword = async (r: Row) => {
    if (!confirm(tx("यो user को पासवर्ड रिसेट गर्ने?", "Reset this user's password?"))) return;
    setMsg("");
    setResetInfo(null);
    const { data, error } = await supabase.functions.invoke("reset-user-password", { body: { user_id: r.user_id, org_id: orgId } });
    if (error || (data && data.error)) return setMsg(data?.error ?? error?.message ?? tx("त्रुटि भयो", "Something went wrong"));
    setResetInfo({ name: r.profiles?.full_name ?? "", pw: data.temporary_password });
  };

  // नयाँ सदस्यता (user पहिल्यै बनेको हुनुपर्छ; इमेलबाट खोजिन्छ)
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("teacher");
  const [dept, setDept] = useState("");

  // सम्पादन
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");

  useEffect(() => {
    if (ready && defaultOrgId) setOrgId(defaultOrgId);
  }, [ready, defaultOrgId]);

  const load = async (id: string) => {
    const [d, m] = await Promise.all([
      supabase.from("departments").select("id,name,name_en").eq("org_id", id).order("name"),
      supabase
        .from("memberships")
        .select("id,user_id,role,department_id,is_active")
        .eq("org_id", id)
        .order("created_at"),
    ]);
    setDepts((d.data ?? []) as Dept[]);
    if (m.error) {
      setRows([]);
      return setMsg(m.error.message);
    }
    const mem = (m.data ?? []) as { id: string; user_id: string; role: string; department_id: string | null; is_active: boolean }[];
    const ids = [...new Set(mem.map((x) => x.user_id))];
    const { data: profs, error: pErr } = ids.length
      ? await supabase.from("profiles").select("id,full_name,email,phone").in("id", ids)
      : { data: [], error: null };
    if (pErr) setMsg(pErr.message);
    const byId = new Map(((profs ?? []) as { id: string; full_name: string; email: string | null; phone: string | null }[]).map((p) => [p.id, p]));
    setRows(
      mem.map((x) => ({
        ...x,
        profiles: byId.get(x.user_id) ?? null,
      })) as Row[]
    );
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

      <div>
        <button type="button" className="btn-ghost" onClick={() => setShowNew((v) => !v)}>
          {showNew ? tx("फारम बन्द गर्नुहोस्", "Close form") : tx("नयाँ user बनाउनुहोस्", "Create new user")}
        </button>
      </div>
      {showNew && orgId && (
        <NewUserForm orgId={orgId} depts={depts} allowAdmin={can.superAdmin} onDone={() => void load(orgId)} />
      )}

      <div className="text-sm font-semibold text-slate-600">{tx("अवस्थित user लाई इमेलबाट थप्नुहोस्", "Add an existing user by email")}</div>
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
      {resetInfo && (
        <div className="card space-y-2 border-amber-300 bg-amber-50 text-sm">
          <div>{tx("अस्थायी पासवर्ड (एकपटक मात्र देखिन्छ):", "Temporary password (shown once only):")} <b className="font-mono">{resetInfo.pw}</b></div>
          <div className="text-slate-600">{resetInfo.name} — {tx("यो पासवर्ड user लाई सुरक्षित रूपमा दिनुहोस्। पहिलो लगइनमा नयाँ पासवर्ड सेट गर्नु पर्छ।", "Give this to the user securely. They must set a new password at first login.")}</div>
          <button className="btn-ghost text-xs" onClick={() => setResetInfo(null)}>{tx("बन्द गर्नुहोस्", "Close")}</button>
        </div>
      )}

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
                {can.campusAdmin && (
                  <button className="btn-ghost text-xs" onClick={() => void resetPassword(r)}>{tx("पासवर्ड रिसेट", "Reset password")}</button>
                )}
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
