import { useEffect, useState } from "react";
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
  full_name: string;
  email: string | null;
  phone: string | null;
};

const ROLE_KEYS = ["admin", "department_head", "teacher", "student"] as const;

/** manage-user Edge Function को कल (त्रुटि सन्देश सहित) */
async function manage(body: Record<string, unknown>): Promise<{ data: any; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("manage-user", { body });
  if (error) {
    try {
      const j = await (error as any).context.json();
      return { data: null, error: j.error ?? error.message };
    } catch {
      return { data: null, error: error.message };
    }
  }
  if (data?.error) return { data: null, error: data.error };
  return { data, error: null };
}

export default function Members() {
  const { tx, pick } = useT();
  const { orgs, ready, defaultOrgId } = useAllowedOrgs();
  const { can } = useAuth();
  const [orgId, setOrgId] = useState("");
  const [depts, setDepts] = useState<Dept[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetPw, setResetPw] = useState<string | null>(null);

  // फारमका मान (चयन गरिएको सदस्यबाट)
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fRole, setFRole] = useState<string>("teacher");
  const [fDept, setFDept] = useState("");
  const [fActive, setFActive] = useState(true);

  useEffect(() => {
    if (ready && defaultOrgId) setOrgId(defaultOrgId);
  }, [ready, defaultOrgId]);

  const load = async (id: string) => {
    const [d, m] = await Promise.all([
      supabase.from("departments").select("id,name,name_en").eq("org_id", id).order("name"),
      supabase.from("memberships").select("id,user_id,role,department_id,is_active").eq("org_id", id).order("created_at"),
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
        full_name: byId.get(x.user_id)?.full_name ?? "",
        email: byId.get(x.user_id)?.email ?? null,
        phone: byId.get(x.user_id)?.phone ?? null,
      }))
    );
  };

  useEffect(() => {
    if (orgId) void load(orgId);
  }, [orgId]);

  const select = (r: Row) => {
    setSelId(r.id);
    setOk(false);
    setMsg("");
    setResetPw(null);
    setFName(r.full_name);
    setFPhone(r.phone ?? "");
    setFEmail(r.email ?? "");
    setFRole(r.role);
    setFDept(r.department_id ?? "");
    setFActive(r.is_active);
  };

  const sel = rows.find((r) => r.id === selId) ?? null;
  const deptName = (id: string | null) => {
    const d = depts.find((x) => x.id === id);
    return d ? pick(d.name, d.name_en) : "—";
  };
  const roleLabel = (r: string) =>
    ({
      admin: tx("एडमिन", "Admin"),
      department_head: tx("विभाग प्रमुख", "Department head"),
      teacher: tx("शिक्षक", "Teacher"),
      student: tx("विद्यार्थी", "Student"),
    } as Record<string, string>)[r] ?? r;

  const run = async (label: string, body: Record<string, unknown>, after?: (data: any) => void) => {
    setBusy(true);
    setMsg("");
    setOk(false);
    const { data, error } = await manage(body);
    setBusy(false);
    if (error) return setMsg(error);
    setOk(true);
    setMsg(label);
    if (after) after(data);
    await load(orgId);
  };

  const saveProfile = () =>
    sel && run(tx("प्रोफाइल सेभ भयो", "Profile saved"), { action: "update_profile", user_id: sel.user_id, full_name: fName, phone: fPhone });

  const saveEmail = () =>
    sel && fEmail !== (sel.email ?? "") &&
    run(tx("इमेल सेभ भयो", "Email saved"), { action: "update_email", user_id: sel.user_id, email: fEmail });

  const saveMembership = () => {
    if (!sel) return;
    const needsDept = fRole === "department_head" || fRole === "teacher";
    if (needsDept && !fDept) return setMsg(tx("विभाग छान्नुहोस्।", "Select a department."));
    return run(tx("भूमिका/विभाग सेभ भयो", "Role and department saved"), {
      action: "set_membership",
      membership_id: sel.id,
      role: fRole,
      department_id: needsDept ? fDept : null,
      is_active: fActive,
    });
  };

  const resetPassword = () => {
    if (!sel) return;
    if (!confirm(tx("यो user को पासवर्ड रिसेट गर्ने?", "Reset this user's password?"))) return;
    return run(tx("पासवर्ड रिसेट भयो", "Password reset"), { action: "reset_password", user_id: sel.user_id, org_id: orgId }, (d) =>
      setResetPw(d.temporary_password)
    );
  };

  const removeMember = () => {
    if (!sel) return;
    if (!confirm(tx("यो सदस्यता हटाउने?", "Remove this membership?"))) return;
    return run(tx("सदस्यता हटाइयो", "Membership removed"), { action: "delete_membership", membership_id: sel.id }, () => setSelId(null));
  };

  const inputCls = "field";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tx("सदस्य र भूमिका", "Members & roles")}</h1>
        <button className="btn" onClick={() => setShowNew((v) => !v)}>
          {showNew ? tx("फारम बन्द गर्नुहोस्", "Close form") : tx("नयाँ user बनाउनुहोस्", "Create new user")}
        </button>
      </div>

      <OrgSelect orgs={orgs} value={orgId} onChange={setOrgId} />

      {showNew && orgId && (
        <NewUserForm orgId={orgId} depts={depts} allowAdmin={can.superAdmin} onDone={() => void load(orgId)} />
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* सूची */}
        <div className="space-y-2">
          {!rows.length && <p className="text-sm text-slate-500">{tx("यस क्याम्पसमा कुनै सदस्य छैन।", "No members in this campus.")}</p>}
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => select(r)}
              className={`card block w-full text-left ${selId === r.id ? "border-brand ring-1 ring-brand" : ""} ${r.is_active ? "" : "opacity-60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{r.full_name || r.email || "—"}</div>
                <span className="text-xs text-slate-500">{r.is_active ? tx("सक्रिय", "Active") : tx("निष्क्रिय", "Inactive")}</span>
              </div>
              <div className="text-xs text-slate-500">
                {r.email} · {roleLabel(r.role)} · {deptName(r.department_id)}
              </div>
            </button>
          ))}
        </div>

        {/* विवरण र सम्पादन */}
        <div>
          {!sel ? (
            <p className="text-sm text-slate-500">{tx("सूचीबाट सदस्य छान्नुहोस्।", "Select a member from the list.")}</p>
          ) : (
            <div className="card space-y-4">
              <div className="font-semibold">{tx("सदस्यको विवरण", "Member details")}</div>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tx("पूरा नाम", "Full name")}</span>
                <input className={inputCls} value={fName} onChange={(e) => setFName(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tx("फोन", "Phone")}</span>
                <input className={inputCls} value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
              </label>
              <button className="btn-ghost text-sm" disabled={busy} onClick={() => void saveProfile()}>{tx("नाम/फोन सेभ", "Save name/phone")}</button>

              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tx("लगइन इमेल", "Login email")}</span>
                <input className={inputCls} type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
              </label>
              <button className="btn-ghost text-sm" disabled={busy || fEmail === (sel.email ?? "")} onClick={() => void saveEmail()}>{tx("इमेल सेभ", "Save email")}</button>

              <div className="border-t border-slate-200 pt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{tx("भूमिका (यो क्याम्पसमा)", "Role (this campus)")}</span>
                  <select className={inputCls} value={fRole} onChange={(e) => setFRole(e.target.value)} disabled={!can.superAdmin && fRole === "admin"}>
                    {ROLE_KEYS.filter((k) => k !== "admin" || can.superAdmin).map((k) => (
                      <option key={k} value={k}>{roleLabel(k)}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{tx("विभाग", "Department")}</span>
                  <select className={inputCls} value={fDept} onChange={(e) => setFDept(e.target.value)}>
                    <option value="">{tx("छान्नुहोस्", "Select")}</option>
                    {depts.map((d) => <option key={d.id} value={d.id}>{pick(d.name, d.name_en)}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={fActive} onChange={(e) => setFActive(e.target.checked)} />
                  {tx("यो क्याम्पसमा सक्रिय (अनचेक = निष्क्रिय)", "Active in this campus (uncheck = deactivate)")}
                </label>
              </div>
              <button className="btn text-sm" disabled={busy} onClick={() => void saveMembership()}>{tx("भूमिका/विभाग सेभ", "Save role/department")}</button>

              <div className="border-t border-slate-200 pt-4 flex flex-wrap gap-2">
                <button className="btn-ghost text-sm" disabled={busy} onClick={() => void resetPassword()}>{tx("पासवर्ड रिसेट", "Reset password")}</button>
                <button className="btn-ghost text-sm text-red-600" disabled={busy} onClick={() => void removeMember()}>{tx("सदस्यता हटाउनुहोस्", "Remove membership")}</button>
              </div>

              {resetPw && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                  <div>{tx("नयाँ अस्थायी पासवर्ड (नोट गर्नुहोस्):", "New temporary password (note it now):")}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-white px-2 py-1 font-mono">{resetPw}</code>
                    <button className="btn-ghost text-xs" onClick={() => void navigator.clipboard?.writeText(resetPw)}>{tx("कपी", "Copy")}</button>
                    <button className="btn-ghost text-xs" onClick={() => setResetPw(null)}>{tx("बन्द", "Close")}</button>
                  </div>
                </div>
              )}

              {msg && <p className={`text-sm ${ok ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>}
            </div>
          )}
          {!sel && msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
