import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAllowedOrgs } from "../lib/orgs";
import OrgSelect from "../components/OrgSelect";
import { useT } from "../lib/i18n";
import { bsToAdIso, adIsoToBs } from "../lib/dates";

type Campus = {
  id: string;
  name: string;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  head_name: string | null;
  established_on: string | null;
  established_calendar: "bs" | "ad" | null;
  academic_year_start_month: number;
};

type Form = {
  name: string;
  name_en: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  head_name: string;
  calendar: "bs" | "ad";
  established: string; // BS: YYYY-MM-DD, AD: YYYY-MM-DD
  start_month: number;
};

const toForm = (c: Campus): Form => ({
  name: c.name ?? "",
  name_en: c.name_en ?? "",
  address: c.address ?? "",
  phone: c.phone ?? "",
  email: c.email ?? "",
  website: c.website ?? "",
  head_name: c.head_name ?? "",
  calendar: c.established_calendar ?? "bs",
  established: c.established_on
    ? c.established_calendar === "ad"
      ? c.established_on
      : adIsoToBs(c.established_on)
    : "",
  start_month: c.academic_year_start_month ?? 4,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function Campus() {
  const { tx } = useT();
  const { orgs, ready, defaultOrgId } = useAllowedOrgs();
  const [orgId, setOrgId] = useState("");
  const [campus, setCampus] = useState<Campus | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && defaultOrgId) setOrgId(defaultOrgId);
  }, [ready, defaultOrgId]);

  const load = async (id: string) => {
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,name_en,address,phone,email,website,head_name,established_on,established_calendar,academic_year_start_month")
      .eq("id", id)
      .maybeSingle();
    if (error) return setMsg(error.message);
    const c = data as Campus | null;
    setCampus(c);
    setForm(c ? toForm(c) : null);
    setEditing(false);
  };

  useEffect(() => {
    if (orgId) void load(orgId);
  }, [orgId]);

  const set = (k: keyof Form, v: string | number) => form && setForm({ ...form, [k]: v } as Form);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !campus) return;
    setMsg("");
    setOk(false);

    let established_on: string | null = null;
    if (form.established) {
      if (!DATE_RE.test(form.established)) {
        return setMsg(tx("स्थापना मिति YYYY-MM-DD ढाँचामा लेख्नुहोस्, जस्तै 2050-04-01।", "Enter the establishment date as YYYY-MM-DD."));
      }
      if (form.calendar === "bs") {
        const [y, m, d] = form.established.split("-").map(Number);
        established_on = bsToAdIso(y, m, d);
      } else {
        established_on = form.established;
      }
    }

    setBusy(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: form.name.trim(),
        name_en: form.name_en.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        head_name: form.head_name.trim() || null,
        established_on,
        established_calendar: established_on ? form.calendar : null,
        academic_year_start_month: form.start_month,
      })
      .eq("id", campus.id);
    setBusy(false);
    if (error) return setMsg(error.message);
    setOk(true);
    setMsg(tx("सुरक्षित भयो", "Saved"));
    await load(campus.id);
  };

  const field = (label: string, key: keyof Form, type = "text") => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        className="field"
        type={type}
        disabled={!editing}
        value={String(form?.[key] ?? "")}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tx("क्याम्पस प्रोफाइल", "Campus profile")}</h1>
        {campus && !editing && (
          <button className="btn" onClick={() => setEditing(true)}>{tx("सम्पादन", "Edit")}</button>
        )}
      </div>

      <OrgSelect orgs={orgs} value={orgId} onChange={setOrgId} />

      {!campus || !form ? (
        <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>
      ) : (
        <form onSubmit={save} className="card grid gap-4 sm:grid-cols-2">
          {field(tx("क्याम्पसको नाम (नेपाली)", "Campus name (Nepali)"), "name")}
          {field(tx("क्याम्पसको नाम (English)", "Campus name (English)"), "name_en")}
          {field(tx("ठेगाना", "Address"), "address")}
          {field(tx("क्याम्पस प्रमुख", "Campus head"), "head_name")}
          {field(tx("फोन", "Phone"), "phone")}
          {field(tx("इमेल", "Email"), "email", "email")}
          {field(tx("Website", "Website"), "website", "url")}

          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("सुरु महिना (शैक्षिक वर्ष)", "Academic year start month")}</span>
            <select className="field" disabled={!editing} value={form.start_month} onChange={(e) => set("start_month", Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("मिति प्रणाली", "Date system")}</span>
            <select className="field" disabled={!editing} value={form.calendar} onChange={(e) => set("calendar", e.target.value)}>
              <option value="bs">{tx("विक्रम संवत (BS)", "Bikram Sambat (BS)")}</option>
              <option value="ad">{tx("ग्रेगोरियन (AD)", "Gregorian (AD)")}</option>
            </select>
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">
              {tx("स्थापना मिति (YYYY-MM-DD)", "Established on (YYYY-MM-DD)")}
            </span>
            <input className="field" disabled={!editing} placeholder={form.calendar === "bs" ? "2050-04-01" : "1993-07-16"} value={form.established} onChange={(e) => set("established", e.target.value)} />
          </label>

          {editing && (
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button className="btn" disabled={busy}>{tx("सेभ गर्नुहोस्", "Save")}</button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setForm(toForm(campus));
                  setEditing(false);
                  setMsg("");
                }}
              >
                {tx("रद्द", "Cancel")}
              </button>
            </div>
          )}
          {msg && <p className={`text-sm sm:col-span-2 ${ok ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>}
        </form>
      )}
    </div>
  );
}
