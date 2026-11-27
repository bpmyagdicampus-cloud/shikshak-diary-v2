import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuthStore } from "../lib/store";
import { displayDate } from "../lib/dates";
import { todayIso } from "../lib/calendarDays";
import BsDateInput from "../components/common/BsDateInput";

/** क्याम्पस प्रोफाइल: पहिले view (मानक विवरण); Edit थिचेमा मात्र फारम खुल्छ */

interface Campus {
  id: string;
  name: string;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  head_name: string | null;
  established_on: string | null;
  academic_year_start_month: number;
}

interface Form {
  name: string;
  name_en: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  head_name: string;
  established: string;
  start_month: number;
}

const toForm = (c: Campus): Form => ({
  name: c.name ?? "",
  name_en: c.name_en ?? "",
  address: c.address ?? "",
  phone: c.phone ?? "",
  email: c.email ?? "",
  website: c.website ?? "",
  head_name: c.head_name ?? "",
  established: c.established_on ?? "",
  start_month: c.academic_year_start_month ?? 4,
});

const MONTHS: { ne: string; en: string }[] = [
  { ne: "बैशाख", en: "Baisakh" }, { ne: "जेठ", en: "Jestha" }, { ne: "असार", en: "Ashad" },
  { ne: "साउन", en: "Shrawan" }, { ne: "भदौ", en: "Bhadra" }, { ne: "असोज", en: "Ashwin" },
  { ne: "कार्तिक", en: "Kartik" }, { ne: "मंसिर", en: "Mangsir" }, { ne: "पुष", en: "Poush" },
  { ne: "माघ", en: "Magh" }, { ne: "फागुन", en: "Falgun" }, { ne: "चैत", en: "Chaitra" },
];

export default function Campus() {
  const { tx, lang } = useT();
  const orgId = useAuthStore((s) => s.currentCampusId);
  const datePref = useAuthStore((s) => s.profile?.datePref ?? "bs");

  const [campus, setCampus] = useState<Campus | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,name_en,address,phone,email,website,head_name,established_on,academic_year_start_month")
      .eq("id", orgId)
      .maybeSingle();
    setLoading(false);
    if (error) return toast.error(error.message);
    const c = data as Campus | null;
    setCampus(c);
    setForm(c ? toForm(c) : null);
    setEditing(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const startEdit = () => {
    if (!campus) return;
    setForm({ ...toForm(campus), established: campus.established_on || todayIso() });
    setEditing(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !campus) return;
    if (!form.name.trim()) return toast.error(tx("क्याम्पसको नाम लेख्नुहोस्।", "Enter the campus name."));
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
        established_on: form.established || null,
        established_calendar: "bs",
        academic_year_start_month: form.start_month,
      })
      .eq("id", campus.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(tx("क्याम्पस प्रोफाइल सेभ भयो", "Campus profile saved"));
    await load();
  };

  const Item = ({ label, value }: { label: string; value: string }) => (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-base text-slate-900">{value || "—"}</dd>
    </div>
  );

  if (!orgId) return <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>;
  if (loading && !campus) return <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>;
  if (!campus || !form) return null;

  const monthName = (n: number) => {
    const m = MONTHS[n - 1];
    return m ? (lang === "ne" ? m.ne : m.en) : String(n);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tx("क्याम्पस प्रोफाइल", "Campus Profile")}</h1>
        {!editing && (
          <button className="btn" onClick={startEdit}>{tx("सम्पादन", "Edit")}</button>
        )}
      </div>

      {!editing && (
        <div className="card">
          <dl className="grid gap-6 sm:grid-cols-2">
            <Item label={tx("क्याम्पसको नाम (नेपाली)", "Campus name (Nepali)")} value={campus.name} />
            <Item label={tx("क्याम्पसको नाम (English)", "Campus name (English)")} value={campus.name_en ?? ""} />
            <Item label={tx("ठेगाना", "Address")} value={campus.address ?? ""} />
            <Item label={tx("क्याम्पस प्रमुख", "Campus Chief")} value={campus.head_name ?? ""} />
            <Item label={tx("फोन", "Phone")} value={campus.phone ?? ""} />
            <Item label={tx("इमेल", "Email")} value={campus.email ?? ""} />
            <Item label="Website" value={campus.website ?? ""} />
            <Item label={tx("शैक्षिक वर्ष सुरु महिना", "Academic year start month")} value={monthName(campus.academic_year_start_month)} />
            <Item label={tx("स्थापना मिति", "Established on")} value={campus.established_on ? displayDate(campus.established_on, datePref) : ""} />
          </dl>
        </div>
      )}

      {editing && (
        <form onSubmit={save} className="card grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("क्याम्पसको नाम (नेपाली) *", "Campus name (Nepali) *")}</span>
            <input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("क्याम्पसको नाम (English)", "Campus name (English)")}</span>
            <input className="field" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("ठेगाना", "Address")}</span>
            <input className="field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("क्याम्पस प्रमुख", "Campus Chief")}</span>
            <input className="field" value={form.head_name} onChange={(e) => setForm({ ...form, head_name: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("फोन", "Phone")}</span>
            <input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("इमेल", "Email")}</span>
            <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Website</span>
            <input className="field" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("शैक्षिक वर्ष सुरु महिना", "Academic year start month")}</span>
            <select className="field" value={form.start_month} onChange={(e) => setForm({ ...form, start_month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={m.en} value={i + 1}>{lang === "ne" ? m.ne : m.en}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2">
            <BsDateInput label={tx("स्थापना मिति", "Established on")} value={form.established} onChange={(iso) => setForm({ ...form, established: iso })} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn" disabled={busy}>{tx("सेभ गर्नुहोस्", "Save")}</button>
            <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setForm(toForm(campus)); }}>{tx("रद्द", "Cancel")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
