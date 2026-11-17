import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { useAuthStore } from "../lib/store";
import { asRows } from "../lib/crud";
import { usePlanning, useMyClassSubjectsForPlan, type LessonDraft, type LessonRow, type PlanStatus, type UnitDraft, type UnitRow } from "../hooks/usePlanning";
import ItemMenu, { type ItemAction } from "../components/ItemMenu";
import EntryRow from "../components/EntryRow";
import BsDateInput from "../components/common/BsDateInput";
import { useCalendarSummary } from "../hooks/useCalendarSummary";
import { displayDate } from "../lib/dates";
import { todayIso } from "../lib/calendarDays";

type Tab = "units" | "lessons" | "approve";

const emptyUnit = (next: number): UnitDraft => ({
  unitNo: next, title: "", topics: "", plannedLh: 0, startDate: "", endDate: "", methods: "", materials: "", assessment: "",
});
const emptyLesson = (): LessonDraft => ({
  unitId: "", planDate: todayIso(), lh: 1, title: "", objectives: "", steps: "", resources: "", assessment: "",
});

interface PendingUnit { id: string; title: string; unit_no: number; class_subject_id: string; }

export default function Plans() {
  const { tx, pick } = useT();
  const { can } = useAuth();
  const orgId = useAuthStore((s) => s.currentCampusId);
  const mine = useMyClassSubjectsForPlan();

  const [tab, setTab] = useState<Tab>("units");
  const [csId, setCsId] = useState("");
  const plan = usePlanning(csId || null);

  const [unitEdit, setUnitEdit] = useState<{ id: string | null; draft: UnitDraft } | null>(null);
  const [lessonEdit, setLessonEdit] = useState<{ id: string | null; draft: LessonDraft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUnit[]>([]);

  const canApprove = can.campusAdmin || can.deptHead;
  const cal = useCalendarSummary();
  const datePref = useAuthStore((s) => s.profile?.datePref ?? "bs");
  const selected = mine.items.find((x) => x.id === csId) ?? null;
  const plannedLhSum = plan.units.reduce((sum, u) => sum + u.plannedLh, 0);

  // स्वीकृति बाँकी एकाइ (विभाग प्रमुख/admin, RLS अनुसार)
  useEffect(() => {
    if (!orgId || !canApprove) {
      setPending([]);
      return;
    }
    supabase
      .from("course_units")
      .select("id,title,unit_no,class_subject_id")
      .eq("org_id", orgId)
      .eq("status", "submitted")
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setPending(asRows<PendingUnit>(data));
      });
  }, [orgId, canApprove, plan.units]);

  const run = async (op: () => Promise<string | null>, ok: string): Promise<boolean> => {
    setBusy(true);
    const err = await op();
    setBusy(false);
    if (err) {
      toast.error(errText(err));
      return false;
    }
    toast.success(ok);
    return true;
  };

  const errText = (key: string): string => {
    const map: Record<string, string> = {
      select_class: tx("कक्षा-विषय छनोट गर्नुहोस्।", "Select a class-subject."),
      title_required: tx("शीर्षक आवश्यक छ।", "Title is required."),
      bad_lh: tx("LH सही हुनुपर्छ।", "LH is not valid."),
      bad_dates: tx("अन्त्य मिति सुरु मितिभन्दा पछि हुनुपर्छ।", "End date must be after start date."),
      bad_date: tx("मिति आवश्यक छ।", "Date is required."),
    };
    return map[key] ?? key;
  };

  const unitActions = (u: UnitRow): ItemAction[] => {
    const isDraft = u.status === "draft";
    const acts: ItemAction[] = [{ label: tx("हेर्नुहोस्", "View"), onClick: () => setViewId(viewId === u.id ? null : u.id) }];
    if (isDraft) {
      acts.push({ label: tx("सम्पादन", "Edit"), onClick: () => setUnitEdit({ id: u.id, draft: { unitNo: u.unitNo, title: u.title, topics: u.topics, plannedLh: u.plannedLh, startDate: u.startDate ?? "", endDate: u.endDate ?? "", methods: u.methods, materials: u.materials, assessment: u.assessment } }) });
      acts.push({ label: tx("स्वीकृतिका लागि पठाउनुहोस्", "Submit for approval"), onClick: () => void run(() => plan.setStatus("course_units", u.id, "submitted"), tx("पठाइयो", "Submitted")) });
      acts.push({ label: tx("मेटाउनुहोस्", "Delete"), danger: true, onClick: () => void run(() => plan.remove("course_units", u.id), tx("मेटियो", "Deleted")) });
    }
    if (u.status === "submitted" && canApprove) {
      acts.push({ label: tx("स्वीकृत गर्नुहोस्", "Approve"), onClick: () => void run(() => plan.setStatus("course_units", u.id, "approved"), tx("स्वीकृत भयो", "Approved")) });
    }
    return acts;
  };

  const lessonActions = (l: LessonRow): ItemAction[] => {
    const isDraft = l.status === "draft";
    const acts: ItemAction[] = [{ label: tx("हेर्नुहोस्", "View"), onClick: () => setViewId(viewId === l.id ? null : l.id) }];
    if (isDraft) {
      acts.push({ label: tx("सम्पादन", "Edit"), onClick: () => setLessonEdit({ id: l.id, draft: { unitId: l.unitId ?? "", planDate: l.planDate, lh: l.lh, title: l.title, objectives: l.objectives, steps: l.steps.join("\n"), resources: l.resources, assessment: l.assessment } }) });
      acts.push({ label: tx("स्वीकृतिका लागि पठाउनुहोस्", "Submit for approval"), onClick: () => void run(() => plan.setStatus("lesson_plans", l.id, "submitted"), tx("पठाइयो", "Submitted")) });
      acts.push({ label: tx("मेटाउनुहोस्", "Delete"), danger: true, onClick: () => void run(() => plan.remove("lesson_plans", l.id), tx("मेटियो", "Deleted")) });
    }
    if (l.status === "submitted" && canApprove) {
      acts.push({ label: tx("स्वीकृत गर्नुहोस्", "Approve"), onClick: () => void run(() => plan.setStatus("lesson_plans", l.id, "approved"), tx("स्वीकृत भयो", "Approved")) });
    }
    return acts;
  };

  const statusLabel = (s: PlanStatus) =>
    ({ draft: tx("मस्यौदा", "Draft"), submitted: tx("स्वीकृति बाँकी", "Awaiting approval"), approved: tx("स्वीकृत", "Approved") } as Record<PlanStatus, string>)[s];

  const csLabel = (id: string) => {
    const c = mine.items.find((x) => x.id === id);
    return c ? `${pick(c.classNameNe, c.classNameEn)} · ${pick(c.subjectNameNe, c.subjectNameEn)}` : "—";
  };

  const tabBtn = (t: Tab, label: string) => (
    <button className={tab === t ? "btn" : "btn-ghost"} onClick={() => setTab(t)}>{label}</button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tx("शिक्षण योजना", "Teaching plans")}</h1>
        <div className="flex flex-wrap gap-2">
          {tabBtn("units", tx("एकाइ योजना", "Unit plans"))}
          {tabBtn("lessons", tx("दैनिक पाठ योजना", "Daily lesson plans"))}
          {canApprove && tabBtn("approve", tx(`स्वीकृति (${pending.length})`, `Approvals (${pending.length})`))}
        </div>
      </div>

      {mine.error && <p className="text-sm text-red-600">{mine.error}</p>}

      {tab !== "approve" && (
        <label className="block max-w-xl text-sm">
          <span className="mb-1 block font-medium">{tx("कक्षा-विषय", "Class-subject")}</span>
          <select className="field" value={csId} onChange={(e) => setCsId(e.target.value)}>
            <option value="">{tx("छान्नुहोस्", "Select")}</option>
            {mine.items.map((c) => <option key={c.id} value={c.id}>{csLabel(c.id)}</option>)}
          </select>
        </label>
      )}

      {tab === "units" && csId && (
        <div className="space-y-4">
          {selected && (
            <div className="card space-y-3 border-2 border-brand/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">
                  {pick(selected.classNameNe, selected.classNameEn)} · {pick(selected.subjectNameNe, selected.subjectNameEn)}
                  {cal.yearName && <span className="ml-2 text-sm text-slate-500">({tx("शैक्षिक वर्ष", "Academic year")} {cal.yearName})</span>}
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                  {plannedLhSum >= selected.totalLh ? tx("योजना पूरा", "Plan complete") : tx("योजना बाँकी", "Plan incomplete")}
                </span>
              </div>
              {!cal.loaded && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}
              {cal.loaded && !cal.yearName && (
                <p className="text-sm text-amber-700">{tx("सक्रिय शैक्षिक वर्ष छैन।", "No active academic year.")}</p>
              )}
              {cal.yearName && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">{tx("खुद पढाउने दिन", "Net teaching days")}</div>
                    <div className="text-2xl font-bold">{cal.netTeachingDays} {tx("दिन", "days")}</div>
                    <div className="text-xs text-slate-500">{tx("योजना LH", "Planned LH")}: {plannedLhSum} / {selected.totalLh}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">{tx("कुल कार्यदिन", "Total working days")}</div>
                    <div className="text-2xl font-bold">{cal.totalWorkingDays} {tx("दिन", "days")}</div>
                    <div className="text-xs text-slate-500">{tx("साप्ताहिक बिदा बाहेक", "Excluding weekly off")}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">{tx("त्रैमासिक परीक्षा", "Term exams")}</div>
                    {cal.exams.length === 0 && <div className="text-sm">{tx("कुनै छैन", "None")}</div>}
                    {cal.exams.map((e) => (
                      <div key={e.id} className="text-sm">{e.title}: {displayDate(e.startDate, datePref)} – {displayDate(e.endDate, datePref)}</div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs text-slate-500">{tx("बिदा", "Vacations")}</div>
                    {cal.vacations.length === 0 && <div className="text-sm">{tx("कुनै छैन", "None")}</div>}
                    {cal.vacations.map((e) => (
                      <div key={e.id} className="text-sm">{e.title}: {displayDate(e.startDate, datePref)} – {displayDate(e.endDate, datePref)}</div>
                    ))}
                  </div>
                </div>
              )}
              {cal.error && <p className="text-sm text-red-600">{cal.error}</p>}
            </div>
          )}
          {!unitEdit && (
            <button className="btn" onClick={() => setUnitEdit({ id: null, draft: emptyUnit(plan.units.length + 1) })}>
              {tx("नयाँ एकाइ थप्नुहोस्", "Add unit")}
            </button>
          )}
          {unitEdit && (
            <form
              className="card grid gap-3 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(() => plan.saveUnit(unitEdit.draft, unitEdit.id), tx("सेभ भयो", "Saved"));
                if (ok) setUnitEdit(null);
              }}
            >
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">{tx("एकाइको नाम (जस्तै: Unit 1: Introduction)", "Unit name (e.g. Unit 1: Introduction)")}</span>
                <input className="field" required value={unitEdit.draft.title} onChange={(e) => setUnitEdit({ ...unitEdit, draft: { ...unitEdit.draft, title: e.target.value } })} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">{tx("मुख्य विषयवस्तु", "Main topics")}</span>
                <textarea className="field min-h-20" value={unitEdit.draft.topics} onChange={(e) => setUnitEdit({ ...unitEdit, draft: { ...unitEdit.draft, topics: e.target.value } })} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">{tx("पढाउने घण्टा (LH)", "Lecture hours (LH)")}</span>
                <input className="field" type="number" min={0} step={0.5} value={unitEdit.draft.plannedLh} onChange={(e) => setUnitEdit({ ...unitEdit, draft: { ...unitEdit.draft, plannedLh: Number(e.target.value) } })} />
              </label>
              <BsDateInput label={tx("सुरु मिति", "From")} value={unitEdit.draft.startDate} onChange={(iso) => setUnitEdit({ ...unitEdit, draft: { ...unitEdit.draft, startDate: iso } })} />
              <BsDateInput label={tx("अन्त्य मिति", "To")} value={unitEdit.draft.endDate} onChange={(iso) => setUnitEdit({ ...unitEdit, draft: { ...unitEdit.draft, endDate: iso } })} />
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">{tx("शिक्षण विधि", "Teaching methods")}</span>
                <textarea className="field min-h-16" value={unitEdit.draft.methods} onChange={(e) => setUnitEdit({ ...unitEdit, draft: { ...unitEdit.draft, methods: e.target.value } })} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">{tx("सामग्री", "Materials")}</span>
                <textarea className="field min-h-16" value={unitEdit.draft.materials} onChange={(e) => setUnitEdit({ ...unitEdit, draft: { ...unitEdit.draft, materials: e.target.value } })} />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium">{tx("मूल्याङ्कन", "Assessment")}</span>
                <textarea className="field min-h-16" value={unitEdit.draft.assessment} onChange={(e) => setUnitEdit({ ...unitEdit, draft: { ...unitEdit.draft, assessment: e.target.value } })} />
              </label>
              <div className="flex gap-2 sm:col-span-2">
                <button className="btn" disabled={busy}>{tx("सेभ गर्नुहोस्", "Save")}</button>
                <button type="button" className="btn-ghost" onClick={() => setUnitEdit(null)}>{tx("रद्द", "Cancel")}</button>
              </div>
            </form>
          )}
          {plan.units.map((u) => (
            <EntryRow key={u.id} title={`${tx("एकाइ", "Unit")} ${u.unitNo}: ${u.title}`} archived={false} actions={unitActions(u)}>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-2 py-0.5">{statusLabel(u.status)}</span>
                <span>{tx("योजना LH", "Planned LH")}: {u.plannedLh}</span>
              </div>
              {viewId === u.id && (
                <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">{tx("विषयवस्तु", "Topics")}</dt><dd>{u.topics || "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("शिक्षण विधि", "Methods")}</dt><dd>{u.methods || "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("सामग्री", "Materials")}</dt><dd>{u.materials || "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("मूल्याङ्कन", "Assessment")}</dt><dd>{u.assessment || "—"}</dd></div>
                </dl>
              )}
            </EntryRow>
          ))}
          {!plan.loading && plan.units.length === 0 && <p className="text-sm text-slate-500">{tx("कुनै एकाइ छैन।", "No units yet.")}</p>}
        </div>
      )}

      {tab === "lessons" && csId && (
        <div className="space-y-4">
          {!lessonEdit && (
            <button className="btn" onClick={() => setLessonEdit({ id: null, draft: emptyLesson() })}>
              {tx("नयाँ दैनिक पाठ योजना", "New daily lesson plan")}
            </button>
          )}
          {lessonEdit && (
            <form
              className="card grid gap-3 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(() => plan.saveLesson(lessonEdit.draft, lessonEdit.id), tx("सेभ भयो", "Saved"));
                if (ok) setLessonEdit(null);
              }}
            >
              <select className="field" value={lessonEdit.draft.unitId} onChange={(e) => setLessonEdit({ ...lessonEdit, draft: { ...lessonEdit.draft, unitId: e.target.value } })}>
                <option value="">{tx("एकाइ (वैकल्पिक)", "Unit (optional)")}</option>
                {plan.units.map((u) => <option key={u.id} value={u.id}>{`${u.unitNo}: ${u.title}`}</option>)}
              </select>
              <input className="field" type="date" required value={lessonEdit.draft.planDate} onChange={(e) => setLessonEdit({ ...lessonEdit, draft: { ...lessonEdit.draft, planDate: e.target.value } })} />
              <input className="field sm:col-span-2" required value={lessonEdit.draft.title} onChange={(e) => setLessonEdit({ ...lessonEdit, draft: { ...lessonEdit.draft, title: e.target.value } })} placeholder={tx("पाठको शीर्षक", "Lesson title")} />
              <input className="field" type="number" min={0.5} max={12} step={0.5} value={lessonEdit.draft.lh} onChange={(e) => setLessonEdit({ ...lessonEdit, draft: { ...lessonEdit.draft, lh: Number(e.target.value) } })} placeholder={tx("LH", "LH")} />
              <textarea className="field" value={lessonEdit.draft.objectives} onChange={(e) => setLessonEdit({ ...lessonEdit, draft: { ...lessonEdit.draft, objectives: e.target.value } })} placeholder={tx("उद्देश्य", "Objectives")} />
              <textarea className="field sm:col-span-2" value={lessonEdit.draft.steps} onChange={(e) => setLessonEdit({ ...lessonEdit, draft: { ...lessonEdit.draft, steps: e.target.value } })} placeholder={tx("चरणहरू (प्रत्येक लाइनमा एउटा)", "Steps (one per line)")} />
              <textarea className="field" value={lessonEdit.draft.resources} onChange={(e) => setLessonEdit({ ...lessonEdit, draft: { ...lessonEdit.draft, resources: e.target.value } })} placeholder={tx("सामग्री", "Resources")} />
              <textarea className="field" value={lessonEdit.draft.assessment} onChange={(e) => setLessonEdit({ ...lessonEdit, draft: { ...lessonEdit.draft, assessment: e.target.value } })} placeholder={tx("मूल्याङ्कन", "Assessment")} />
              <div className="flex gap-2 sm:col-span-2">
                <button className="btn" disabled={busy}>{tx("सेभ गर्नुहोस्", "Save")}</button>
                <button type="button" className="btn-ghost" onClick={() => setLessonEdit(null)}>{tx("रद्द", "Cancel")}</button>
              </div>
            </form>
          )}
          {plan.lessons.map((l) => (
            <EntryRow key={l.id} title={`${l.planDate} · ${l.title} · LH ${l.lh}`} archived={false} actions={lessonActions(l)}>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-2 py-0.5">{statusLabel(l.status)}</span>
              </div>
              {viewId === l.id && (
                <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">{tx("उद्देश्य", "Objectives")}</dt><dd>{l.objectives || "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("चरणहरू", "Steps")}</dt><dd>{l.steps.join(" → ") || "—"}</dd></div>
                </dl>
              )}
            </EntryRow>
          ))}
          {!plan.loading && plan.lessons.length === 0 && <p className="text-sm text-slate-500">{tx("कुनै पाठ योजना छैन।", "No lesson plans yet.")}</p>}
        </div>
      )}

      {tab === "approve" && (
        <div className="space-y-3">
          {pending.length === 0 && <p className="text-sm text-slate-500">{tx("स्वीकृति बाँकी छैन।", "Nothing waiting for approval.")}</p>}
          {pending.map((u) => (
            <div key={u.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">{tx("एकाइ", "Unit")} {u.unit_no}: {u.title}</div>
              <ItemMenu
                actions={[
                  { label: tx("स्वीकृत गर्नुहोस्", "Approve"), onClick: () => void run(() => plan.setStatus("course_units", u.id, "approved"), tx("स्वीकृत भयो", "Approved")) },
                ]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
