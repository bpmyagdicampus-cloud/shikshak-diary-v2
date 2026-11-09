import { useState } from "react";
import { toast } from "sonner";
import { useT } from "../lib/i18n";
import { displayDate } from "../lib/dates";
import { useAuthStore } from "../lib/store";
import { useDiary, bsFromIso, isEditable, todayIso, type DiaryDraft, type DiaryEntry, type DiaryErrorKey } from "../hooks/useDiary";
import DiaryEntryForm from "../components/diary/DiaryEntryForm";
import EntryRow from "../components/EntryRow";
import type { ItemAction } from "../components/ItemMenu";

const emptyDraft = (): DiaryDraft => ({
  classSubjectId: "",
  bs: bsFromIso(todayIso()),
  lh: 1,
  unit: "",
  topic: "",
  totalStudents: 0,
  presentCount: 0,
  absentCount: 0,
  remarks: "",
  activities: [],
  specialRemark: "",
  specialInMonthly: false,
  methods: "",
  studentActivities: "",
  studentFeedback: "",
  evaluationDone: "",
});

const DIARY_ERROR_KEYS: DiaryErrorKey[] = [
  "select_class", "bad_date", "future_date", "outside_window", "bad_lh", "bad_counts", "bad_present",
];

export default function Diary() {
  const { tx, pick } = useT();
  const datePref = useAuthStore((s) => s.profile?.datePref ?? "bs");
  const diary = useDiary();

  const [draft, setDraft] = useState<DiaryDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const errorMessage = (key: string): string => {
    const map: Record<DiaryErrorKey, string> = {
      select_class: tx("कक्षा र विषय छान्नुहोस्।", "Select a class and subject."),
      bad_date: tx("BS मिति सही छैन।", "The BS date is not valid."),
      future_date: tx("भविष्यको मिति अनुमति छैन।", "Future dates are not allowed."),
      outside_window: tx(`${7} दिनभित्रको मिति मात्र अनुमति छ।`, `Only dates within the last 7 days are allowed.`),
      bad_lh: tx("LH ०.५ देखि १२ भित्र हुनुपर्छ।", "LH must be between 0.5 and 12."),
      bad_counts: tx("विद्यार्थी संख्या नकारात्मक हुन सक्दैन।", "Student counts cannot be negative."),
      bad_present: tx("उपस्थित + अनुपस्थित, कुल विद्यार्थी भन्दा बढी हुन सक्दैन।", "Present + absent cannot exceed total students."),
    };
    return (DIARY_ERROR_KEYS as string[]).includes(key) ? map[key as DiaryErrorKey] : key;
  };

  const startEdit = (e: DiaryEntry) => {
    setViewId(null);
    setEditingId(e.id);
    setErrorText(null);
    setDraft({
      classSubjectId: e.classSubjectId,
      bs: bsFromIso(e.entryDate),
      lh: e.lh,
      unit: e.unit,
      topic: e.topic,
      totalStudents: e.totalStudents,
      presentCount: e.presentCount,
      absentCount: e.absentCount,
      remarks: e.remarks,
      activities: e.activities,
      specialRemark: e.specialRemark,
      specialInMonthly: e.specialInMonthly,
      methods: e.methods,
      studentActivities: e.studentActivities,
      studentFeedback: e.studentFeedback,
      evaluationDone: e.evaluationDone,
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setErrorText(null);
  };

  const submit = async () => {
    setBusy(true);
    setErrorText(null);
    const result = await diary.saveEntry(draft, editingId);
    setBusy(false);
    if (result) {
      setErrorText(errorMessage(result));
      return;
    }
    toast.success(editingId ? tx("डायरी अपडेट भयो", "Entry updated") : tx("डायरी सेभ भयो", "Entry saved"));
    resetForm();
  };

  const remove = async (e: DiaryEntry) => {
    if (!confirm(tx("यो डायरी मेटाउने?", "Delete this entry?"))) return;
    const result = await diary.deleteEntry(e.id);
    if (result) toast.error(result);
    else toast.success(tx("मेटियो", "Deleted"));
  };

  const actionsFor = (e: DiaryEntry): ItemAction[] => {
    const editable = isEditable(e.entryDate);
    const key = e.id;
    const base: ItemAction[] = [
      { label: tx("हेर्नुहोस्", "View"), onClick: () => setViewId(viewId === key ? null : key) },
    ];
    if (!editable) return base;
    return [
      ...base,
      { label: tx("सम्पादन", "Edit"), onClick: () => startEdit(e) },
      { label: tx("मेटाउनुहोस्", "Delete"), onClick: () => void remove(e), danger: true },
    ];
  };

  const q = search.trim().toLowerCase();
  const visibleEntries = diary.entries.filter(
    (e) =>
      (!classFilter || e.classSubjectId === classFilter) &&
      (!q || e.topic.toLowerCase().includes(q) || e.entryDate.includes(q))
  );

  const csLabel = (id: string) => {
    const c = diary.classSubjects.find((x) => x.id === id);
    return c ? `${pick(c.classNameNe, c.classNameEn)} · ${pick(c.subjectNameNe, c.subjectNameEn)}` : "—";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{tx("दैनिक डायरी", "Daily diary")}</h1>
        <p className="text-sm text-slate-500">
          {tx(`आजदेखि ७ दिनभित्रका प्रविष्टि मात्र सम्पादन वा मेटाउन सकिन्छ।`, `You can edit or delete entries from the last 7 days only.`)}
        </p>
      </div>

      <DiaryEntryForm
        options={diary.classSubjects}
        draft={draft}
        onChange={(patch) => setDraft({ ...draft, ...patch })}
        onSubmit={() => void submit()}
        onCancel={resetForm}
        busy={busy}
        editing={editingId !== null}
        errorText={errorText}
      />

      <div className="flex flex-wrap items-center gap-3">
        <input className="field max-w-xs" placeholder={tx("पाठ वा मिति खोज्नुहोस्", "Search topic or date")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="field max-w-xs" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">{tx("सबै कक्षा", "All classes")}</option>
          {diary.classSubjects.map((c) => (
            <option key={c.id} value={c.id}>{pick(c.classNameNe, c.classNameEn)} · {pick(c.subjectNameNe, c.subjectNameEn)}</option>
          ))}
        </select>
      </div>

      {diary.error && <p className="text-sm text-red-600">{diary.error}</p>}
      {diary.loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}

      <div className="space-y-3">
        {visibleEntries.map((e) => (
          <EntryRow
            key={e.id}
            title={`${displayDate(e.entryDate, datePref)} · ${csLabel(e.classSubjectId)} · LH ${e.lh}`}
            archived={!isEditable(e.entryDate)}
            actions={actionsFor(e)}
          >
            {viewId === e.id && (
              <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">{tx("एकाइ", "Unit")}</dt><dd>{e.unit || "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("शीर्षक", "Topic")}</dt><dd>{e.topic || "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("उपस्थित / अनुपस्थित", "Present / Absent")}</dt><dd>{e.presentCount} / {e.absentCount} ({tx("कुल", "Total")}: {e.totalStudents})</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("टिप्पणी", "Remarks")}</dt><dd>{e.remarks || "—"}</dd></div>
                {!isEditable(e.entryDate) && (
                  <div className="sm:col-span-2 text-xs text-amber-700">{tx("सम्पादन अवधि (७ दिन) सकियो।", "The 7-day edit window has passed.")}</div>
                )}
              </dl>
            )}
          </EntryRow>
        ))}
        {!diary.loading && diary.entries.length === 0 && (
          <p className="text-sm text-slate-500">{tx("कुनै डायरी छैन।", "No entries yet.")}</p>
        )}
      </div>
    </div>
  );
}
