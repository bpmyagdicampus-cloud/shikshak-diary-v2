import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";

type Org = { id: string; name: string; name_en: string | null; academic_year_start_month: number };

export default function Organizations() {
  const { t } = useT();
  const [rows, setRows] = useState<Org[]>([]);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [startMonth, setStartMonth] = useState(4); // Shrawan (BS month 4)
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,name_en,academic_year_start_month")
      .order("name");
    if (error) setMsg(error.message);
    else setRows((data ?? []) as Org[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    const { error } = await supabase.from("organizations").insert({
      name: name.trim(),
      name_en: nameEn.trim() || null,
      academic_year_start_month: startMonth,
    });
    if (error) return setMsg(error.message);
    setName("");
    setNameEn("");
    setMsg(t("saved"));
    await load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("organizations")}</h1>

      <form onSubmit={create} className="card grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("name")}</span>
          <input className="field" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("name")} (English)</span>
          <input className="field" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("startMonth")}</span>
          <select className="field" value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn w-full sm:w-auto">{t("create")}</button>
        </div>
        {msg && <p className="text-sm text-slate-600 sm:col-span-2">{msg}</p>}
      </form>

      <div className="space-y-2">
        {rows.map((o) => (
          <div key={o.id} className="card flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">{o.name}</div>
              <div className="text-xs text-slate-500">{o.name_en}</div>
            </div>
            <div className="text-xs text-slate-500">{t("startMonth")}: {o.academic_year_start_month}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
