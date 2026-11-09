import type { FormEvent } from "react";
import { useT } from "../../lib/i18n";
import type { DiaryDraft, MyClassSubject } from "../../hooks/useDiary";
import { CLASS_ACTIVITIES, MAX_LH } from "../../hooks/useDiary";

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

      <div className="sm:col-span-2 space-y-2">
        <div className={label}>{tx("कक्षा क्रियाकलाप कोड (मासिक प्रतिवेदनका लागि)", "Class activity codes (for monthly report)")}</div>
        <div className="flex flex-wrap gap-2">
          {CLASS_ACTIVITIES.map((a) => {
            const on = draft.activities.includes(a.code);
            return (
              <button
                key={a.code}
                type="button"
                onClick={() =>
                  onChange({ activities: on ? draft.activities.filter((c) => c !== a.code) : [...draft.activities, a.code] })
                }
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"}`}
              >
                {a.code} · {tx(a.ne, a.en)}
              </button>
            );
          })}
        </div>
      </div>

      <details className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          {tx("शिक्षण विधि, विद्यार्थी क्रियाकलाप र मूल्याङ्कन", "Methods, student activities & evaluation")}
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>{tx("प्रयोग गरिएको शिक्षण विधि", "Methods & methodology used")}</label>
            <textarea className="field min-h-20" value={draft.methods} onChange={(e) => onChange({ methods: e.target.value })} />
          </div>
          <div>
            <label className={label}>{tx("विद्यार्थी क्रियाकलाप", "Students' activities")}</label>
            <textarea className="field min-h-20" value={draft.studentActivities} onChange={(e) => onChange({ studentActivities: e.target.value })} />
          </div>
          <div>
            <label className={label}>{tx("विद्यार्थी पृष्ठपोषण", "Students' feedback")}</label>
            <textarea className="field min-h-20" value={draft.studentFeedback} onChange={(e) => onChange({ studentFeedback: e.target.value })} />
          </div>
          <div>
            <label className={label}>{tx("गरिएको मूल्याङ्कन", "Evaluation done")}</label>
            <textarea className="field min-h-20" value={draft.evaluationDone} onChange={(e) => onChange({ evaluationDone: e.target.value })} />
          </div>
        </div>
      </details>

      <div className="sm:col-span-2">
        <label className={label}>{tx("विशेष कैफियत", "Special remark")}</label>
        <textarea className="field min-h-16" placeholder={tx("विशेष कैफियत लेख्नुहोस्", "Write a special remark")} value={draft.specialRemark} onChange={(e) => onChange({ specialRemark: e.target.value })} />
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.specialInMonthly} onChange={(e) => onChange({ specialInMonthly: e.target.checked })} />
          {tx("मासिक प्रतिवेदनको Remarks मा देखाउनुहोस्", "Include in monthly report remarks")}
        </label>
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
