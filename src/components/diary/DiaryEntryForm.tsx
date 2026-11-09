import type { FormEvent } from "react";
import { useT } from "../../lib/i18n";
import type { DiaryDraft, MyClassSubject } from "../../hooks/useDiary";
import { MAX_LH } from "../../hooks/useDiary";

/** Stateless: मान र callback props बाट आउँछ */
export interface DiaryEntryFormProps {
  options: MyClassSubject[];
  draft: DiaryDraft;
  onChange: (patch: Partial<DiaryDraft>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  editing: boolean;
  errorText: string | null;
}

const YEARS = Array.from({ length: 21 }, (_, i) => 2075 + i);
const MONTHS_NE = ["बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कार्तिक", "मंसिर", "पुष", "माघ", "फागुन", "चैत"];
const MONTHS_EN = ["Baisakh", "Jestha", "Ashad", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

export default function DiaryEntryForm({ options, draft, onChange, onSubmit, onCancel, busy, editing, errorText }: DiaryEntryFormProps) {
  const { tx, pick, lang } = useT();
  const months = lang === "ne" ? MONTHS_NE : MONTHS_EN;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const label = "mb-1 block text-sm font-medium";

  return (
    <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 font-semibold">
        {editing ? tx("डायरी सम्पादन", "Edit diary entry") : tx("नयाँ दैनिक डायरी", "New daily entry")}
      </div>

      <div className="sm:col-span-2">
        <label className={label}>{tx("कक्षा र विषय", "Class and subject")}</label>
        <select className="field" required value={draft.classSubjectId} onChange={(e) => onChange({ classSubjectId: e.target.value })}>
          <option value="">{tx("कक्षा छान्नुहोस्", "Select class")}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {pick(o.classNameNe, o.classNameEn)} · {pick(o.subjectNameNe, o.subjectNameEn)}
            </option>
          ))}
        </select>
        {options.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">{tx("तपाईंलाई कुनै कक्षा-विषय तोकिएको छैन।", "No class-subjects are assigned to you.")}</p>
        )}
      </div>

      <div>
        <label className={label}>{tx("मिति (BS)", "Date (BS)")}</label>
        <div className="grid grid-cols-3 gap-2">
          <select className="field" value={draft.bs.year} onChange={(e) => onChange({ bs: { ...draft.bs, year: Number(e.target.value) } })}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="field" value={draft.bs.month} onChange={(e) => onChange({ bs: { ...draft.bs, month: Number(e.target.value) } })}>
            {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="field" value={draft.bs.day} onChange={(e) => onChange({ bs: { ...draft.bs, day: Number(e.target.value) } })}>
            {Array.from({ length: 32 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>{tx("पढाएका घण्टा (LH)", "Lecture hours (LH)")}</label>
        <input className="field" type="number" min={0.5} max={MAX_LH} step={0.5} required value={draft.lh} onChange={(e) => onChange({ lh: Number(e.target.value) })} />
      </div>

      <div>
        <label className={label}>{tx("एकाइ", "Unit")}</label>
        <input className="field" placeholder={tx("जस्तै: Unit 2", "e.g. Unit 2")} value={draft.unit} onChange={(e) => onChange({ unit: e.target.value })} />
      </div>

      <div>
        <label className={label}>{tx("पढाएको शीर्षक / पाठ", "Topic taught")}</label>
        <input className="field" value={draft.topic} onChange={(e) => onChange({ topic: e.target.value })} />
      </div>

      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>{tx("कुल विद्यार्थी", "Total students")}</label>
          <input className="field" type="number" min={0} value={draft.totalStudents} onChange={(e) => onChange({ totalStudents: Number(e.target.value) })} />
        </div>
        <div>
          <label className={label}>{tx("उपस्थित", "Present")}</label>
          <input className="field" type="number" min={0} value={draft.presentCount} onChange={(e) => onChange({ presentCount: Number(e.target.value) })} />
        </div>
        <div>
          <label className={label}>{tx("अनुपस्थित", "Absent")}</label>
          <input className="field" type="number" min={0} value={draft.absentCount} onChange={(e) => onChange({ absentCount: Number(e.target.value) })} />
        </div>
      </div>

      <div className="sm:col-span-2">
        <label className={label}>{tx("टिप्पणी", "Remarks")}</label>
        <textarea className="field min-h-16" value={draft.remarks} onChange={(e) => onChange({ remarks: e.target.value })} />
      </div>

      {errorText && <p className="sm:col-span-2 text-sm text-red-600">{errorText}</p>}

      <div className="sm:col-span-2 flex flex-wrap gap-2">
        <button className="btn" disabled={busy || options.length === 0}>
          {busy ? tx("सेभ हुँदैछ…", "Saving…") : editing ? tx("अपडेट गर्नुहोस्", "Update") : tx("सेभ गर्नुहोस्", "Save")}
        </button>
        {editing && (
          <button type="button" className="btn-ghost" onClick={onCancel}>{tx("रद्द", "Cancel")}</button>
        )}
      </div>
    </form>
  );
}
