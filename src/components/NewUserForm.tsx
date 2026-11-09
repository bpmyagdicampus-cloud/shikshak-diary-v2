import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";

type Dept = { id: string; name: string; name_en?: string | null };

/** नयाँ user बनाउने फारम (Edge Function मार्फत) */
export default function NewUserForm({
  orgId,
  depts,
  allowAdmin,
  onDone,
}: {
  orgId: string;
  depts: Dept[];
  allowAdmin: boolean;
  onDone: () => void;
}) {
  const { tx, pick } = useT();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("teacher");
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pw, setPw] = useState("");
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const needsDept = role === "department_head" || role === "teacher";
  const roles = [
    ...(allowAdmin ? [{ v: "admin", l: tx("एडमिन", "Admin") }] : []),
    { v: "department_head", l: tx("विभाग प्रमुख", "Department head") },
    { v: "teacher", l: tx("शिक्षक", "Teacher") },
    { v: "student", l: tx("विद्यार्थी", "Student") },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setTempPw(null);
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        email,
        full_name: fullName,
        phone,
        role,
        org_id: orgId,
        department_id: needsDept ? dept : null,
        password: pw || undefined,
      },
    });
    setBusy(false);
    if (error || (data && data.error)) {
      return setMsg(data?.error ?? error?.message ?? tx("त्रुटि भयो", "Something went wrong"));
    }
    setPw("");
    if (data?.created) {
      setTempPw(data.temporary_password);
      setMsg(tx("नयाँ user बनाइयो। अस्थायी पासवर्ड एकपटक मात्र देखिन्छ, सुरक्षित रूपमा हस्तान्तरण गर्नुहोस्।", "New user created. The temporary password is shown once; hand it over securely."));
    } else {
      setMsg(tx("यो इमेल पहिल्यै छ, सदस्यता थपियो।", "This email already exists; membership added."));
    }
    setEmail("");
    setFullName("");
    setPhone("");
    onDone();
  };

  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
      <div className="font-semibold sm:col-span-2">{tx("नयाँ user बनाउनुहोस्", "Create a new user")}</div>
      <input className="field" type="email" required placeholder={tx("इमेल", "Email")} value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="field" required placeholder={tx("पूरा नाम", "Full name")} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <input className="field" placeholder={tx("फोन (वैकल्पिक)", "Phone (optional)")} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
        {roles.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
      </select>
      <select className="field sm:col-span-2" value={dept} disabled={!needsDept} onChange={(e) => setDept(e.target.value)}>
        <option value="">{needsDept ? tx("विभाग छान्नुहोस् (अनिवार्य)", "Select department (required)") : tx("विभाग (आवश्यक छैन)", "Department (not required)")}</option>
        {depts.map((d) => <option key={d.id} value={d.id}>{pick(d.name, d.name_en)}</option>)}
      </select>
      <input className="field sm:col-span-2" type="text" autoComplete="off" placeholder={tx("अस्थायी पासवर्ड (खाली छोडे स्वतः बन्छ, कम्तीमा ८ अक्षर)", "Temporary password (leave blank to auto-generate, min 8 chars)")} value={pw} onChange={(e) => setPw(e.target.value)} />
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <button className="btn" disabled={busy}>{tx("user बनाउनुहोस्", "Create user")}</button>
      </div>
      {msg && <p className="text-sm text-slate-700 sm:col-span-2">{msg}</p>}
      {tempPw && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:col-span-2">
          <div className="text-sm">{tx("अस्थायी पासवर्ड (यहीँ नोट गर्नुहोस्):", "Temporary password (note it now):")}</div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-2 py-1 font-mono text-base">{tempPw}</code>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                void navigator.clipboard?.writeText(tempPw);
                setCopied(true);
              }}
            >
              {copied ? tx("कपी भयो", "Copied") : tx("कपी गर्नुहोस्", "Copy")}
            </button>
            <button type="button" className="btn-ghost text-xs" onClick={() => { setTempPw(null); setCopied(false); }}>
              {tx("बन्द गर्नुहोस्", "Close")}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
