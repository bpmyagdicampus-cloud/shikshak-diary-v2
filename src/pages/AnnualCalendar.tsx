import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { useAuthStore } from "../lib/store";
import { asRows, writeOp } from "../lib/crud";
import { displayDate } from "../lib/dates";
import { todayIso, type CalEvent } from "../lib/calendarDays";
import BsDateInput from "../components/common/BsDateInput";
import CalendarGrid from "../components/calendar/CalendarGrid";
import EntryRow from "../components/EntryRow";
import type { ItemAction } from "../components/ItemMenu";

/** क्याम्पसको वार्षिक भित्तेपात्रो: admin सम्पादन; सबै सदस्य हेर्छन् (सूची वा महिना क्यालेन्डर) */

interface EventType { id: string; name: string; isHoliday: boolean }

interface Draft {
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  teachingOff: boolean;
  campusOpen: boolean;
  notes: string;
}

const WEEK: { ne: string; en: string; day: number }[] = [
  { ne: "आइतबार", en: "Sunday", day: 0 }, { ne: "सोमबार", en: "Monday", day: 1 }, { ne: "मंगलबार", en: "Tuesday", day: 2 },
  { ne: "बुधबार", en: "Wednesday", day: 3 }, { ne: "बिहिबार", en: "Thursday", day: 4 }, { ne: "शुक्रबार", en: "Friday", day: 5 },
  { ne: "शनिबार", en: "Saturday", day: 6 },
];

const DEFAULT_TYPES: { ne: string; en: string; isHoliday: boolean }[] = [
  { ne: "कार्यक्रम", en: "Event", isHoliday: false },
  { ne: "बिदा", en: "Holiday", isHoliday: true },
  { ne: "परीक्षा", en: "Exam", isHoliday: false },
  { ne: "क्रियाकलाप", en: "Activity", isHoliday: false },
];

const blankDraft = (typeName: string): Draft => ({
  title: "", eventType: typeName, startDate: todayIso(), endDate: "", teachingOff: false, campusOpen: false, notes: "",
});

export default function AnnualCalendar() {
  const { tx, lang } = useT();
  const { can } = useAuth();
  const orgId = useAuthStore((s) => s.currentCampusId);
  const datePref = useAuthStore((s) => s.profile?.datePref ?? "bs");
  const canEdit = can.campusAdmin;

  const [tab, setTab] = useState<"list" | "calendar">("list");
  const [types, setTypes] = useState<EventType[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [weeklyOff, setWeeklyOff] = useState<number[]>([6]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [newType, setNewType] = useState("");
  const [newTypeHoliday, setNewTypeHoliday] = useState(false);
  const [form, setForm] = useState<{ id: string | null; draft: Draft } | null>(null);

  const typeNames = types.map((t) => t.name);
  const holidayOf = (name: string) => types.find((t) => t.name === name)?.isHoliday ?? false;

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    let { data: tdata, error: terr } = await supabase.from("calendar_event_types").select("id,name,is_holiday").eq("org_id", orgId).order("name");
    if (terr) toast.error(terr.message);
    if (!(tdata ?? []).length && canEdit) {
      await supabase.from("calendar_event_types").insert(DEFAULT_TYPES.map((t) => ({ org_id: orgId, name: t.ne, is_holiday: t.isHoliday })));
      ({ data: tdata } = await supabase.from("calendar_event_types").select("id,name,is_holiday").eq("org_id", orgId).order("name"));
    }
    setTypes(asRows<{ id: string; name: string; is_holiday: boolean }>(tdata).map((t) => ({ id: t.id, name: t.name, isHoliday: t.is_holiday })));

    const s = await supabase.from("campus_calendar_settings").select("weekly_off_days").eq("org_id", orgId).maybeSingle();
    if (s.data) setWeeklyOff(((s.data as { weekly_off_days: number[] }).weekly_off_days) ?? [6]);

    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,event_type,is_holiday,teaching_off,campus_open,start_date,end_date,notes")
      .eq("org_id", orgId)
      .order("start_date");
    if (error) toast.error(error.message);
    setEvents(
      asRows<{ id: string; title: string; event_type: string; teaching_off: boolean; campus_open: boolean; start_date: string; end_date: string | null; notes: string }>(data).map((e) => ({
        id: e.id, title: e.title, eventType: e.event_type, teachingOff: e.teaching_off, campusOpen: e.campus_open,
        startDate: e.start_date, endDate: e.end_date,
      }))
    );
    setLoading(false);
  }, [orgId, canEdit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const validate = (d: Draft): string | null => {
    if (!d.title.trim()) return tx("कार्यक्रमको नाम लेख्नुहोस्।", "Enter the event name.");
    if (!d.startDate) return tx("सुरु मिति छान्नुहोस्।", "Select the start date.");
    if (d.endDate && d.endDate < d.startDate) return tx("अन्तिम मिति सुरु मितिभन्दा पछि हुनुपर्छ।", "End date must be after the start date.");
    return null;
  };

  const save = async () => {
    if (!form || !orgId) return;
    const err = validate(form.draft);
    if (err) return setNote({ ok: false, text: err });
    const row = {
      title: form.draft.title.trim(),
      event_type: form.draft.eventType,
      is_holiday: form.draft.teachingOff,
      teaching_off: form.draft.teachingOff,
      campus_open: form.draft.campusOpen,
      start_date: form.draft.startDate,
      end_date: form.draft.endDate || null,
      notes: form.draft.notes.trim(),
    };
    setBusy(true);
    const ok = await writeOp(
      () => (form.id ? supabase.from("calendar_events").update(row).eq("id", form.id) : supabase.from("calendar_events").insert({ ...row, org_id: orgId })),
      form.id ? tx("कार्यक्रम सम्पादन भयो", "Event updated") : tx("कार्यक्रम थपियो", "Event added")
    );
    setBusy(false);
    if (ok) {
      setForm(null);
      setNote({ ok: true, text: tx("भित्तेपात्रोमा सुरक्षित भयो। सबै सदस्यले देख्नेछन्।", "Saved to the calendar. All members can see it.") });
      await refresh();
    }
  };

  const remove = async (id: string) => {
    if (!confirm(tx("यो कार्यक्रम मेटाउने हो?", "Delete this event?"))) return;
    setBusy(true);
    await writeOp(() => supabase.from("calendar_events").delete().eq("id", id), tx("मेटियो", "Deleted"));
    setBusy(false);
    setViewId(null);
    await refresh();
  };

  const saveWeekly = async () => {
    if (!orgId) return;
    setBusy(true);
    const ok = await writeOp(
      () => supabase.from("campus_calendar_settings").upsert({ org_id: orgId, weekly_off_days: weeklyOff, updated_at: new Date().toISOString() }),
      tx("साप्ताहिक बिदा सेभ भयो", "Weekly holidays saved")
    );
    setBusy(false);
    if (ok) await refresh();
  };

  const addType = async () => {
    const name = newType.trim();
    if (!name || !orgId) return;
    setBusy(true);
    const ok = await writeOp(() => supabase.from("calendar_event_types").insert({ org_id: orgId, name, is_holiday: newTypeHoliday }), tx("प्रकार थपियो", "Type added"));
    setBusy(false);
    if (ok) {
      setNewType("");
      setNewTypeHoliday(false);
      await refresh();
    }
  };

  const removeType = async (t: EventType) => {
    if (!confirm(tx(`"${t.name}" प्रकार मेटाउने हो?`, `Delete type "${t.name}"?`))) return;
    setBusy(true);
    await writeOp(() => supabase.from("calendar_event_types").delete().eq("id", t.id), tx("प्रकार मेटियो", "Type deleted"));
    setBusy(false);
    await refresh();
  };

  const actionsFor = (e: CalEvent): ItemAction[] => {
    const base: ItemAction[] = [{ label: tx("हेर्नुहोस्", "View"), onClick: () => setViewId(viewId === e.id ? null : e.id) }];
    if (!canEdit) return base;
    return [
      ...base,
      {
        label: tx("सम्पादन", "Edit"),
        onClick: () =>
          setForm({
            id: e.id,
            draft: { title: e.title, eventType: e.eventType, startDate: e.startDate, endDate: e.endDate ?? "", teachingOff: e.teachingOff, campusOpen: e.campusOpen, notes: "" },
          }),
      },
      { label: tx("मेटाउनुहोस्", "Delete"), danger: true, onClick: () => void remove(e.id) },
    ];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{tx("क्याम्पस वार्षिक भित्तेपात्रो", "Campus annual calendar")}</h1>
          <p className="text-sm text-slate-500">
            {tx("क्याम्पसका कार्यक्रम, बिदा र विशेष दिन। सबै सदस्यले यहाँ देख्छन्।", "Campus events, holidays and special days. All members can see them.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={tab === "list" ? "btn text-sm" : "btn-ghost text-sm"} onClick={() => setTab("list")}>{tx("सूची", "List")}</button>
          <button className={tab === "calendar" ? "btn text-sm" : "btn-ghost text-sm"} onClick={() => setTab("calendar")}>{tx("क्यालेन्डर", "Calendar")}</button>
          {canEdit && <button className="btn-ghost text-sm" onClick={() => setShowSettings((v) => !v)}>{tx("साप्ताहिक बिदा सेटिङ", "Weekly holiday settings")}</button>}
          {canEdit && <button className="btn-ghost text-sm" onClick={() => setShowTypes((v) => !v)}>{tx("प्रकारहरू", "Event types")}</button>}
          {canEdit && !form && <button className="btn text-sm" onClick={() => setForm({ id: null, draft: blankDraft(typeNames[0] ?? "") })}>{tx("+ नयाँ कार्यक्रम", "+ New event")}</button>}
        </div>
      </div>

      {note && (
        <p className={`rounded-lg border p-3 text-sm ${note.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-700"}`}>{note.text}</p>
      )}

      {/* साप्ताहिक बिदा सेटिङ (admin) */}
      {canEdit && showSettings && (
        <div className="card space-y-3">
          <div className="font-semibold">{tx("कुन वार हप्ताको बिदा मान्ने?", "Which weekdays are holidays?")}</div>
          <p className="text-xs text-slate-500">{tx("शनिबार पूर्वनिर्धारित बिदा हो। आइतबार सार्वजनिक बिदा मान्ने वा नमान्ने यहाँबाट छान्नुहोस्।", "Saturday is a holiday by default. Choose whether Sunday is a holiday here.")}</p>
          <div className="flex flex-wrap gap-3">
            {WEEK.map((w) => (
              <label key={w.day} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={weeklyOff.includes(w.day)}
                  onChange={(e) => setWeeklyOff(e.target.checked ? [...weeklyOff, w.day] : weeklyOff.filter((d) => d !== w.day))}
                />
                {lang === "ne" ? w.ne : w.en}
              </label>
            ))}
          </div>
          <button className="btn text-sm" disabled={busy} onClick={() => void saveWeekly()}>{tx("सेभ गर्नुहोस्", "Save")}</button>
        </div>
      )}

      {/* प्रकार व्यवस्थापन (admin) */}
      {canEdit && showTypes && (
        <div className="card space-y-3">
          <div className="font-semibold">{tx("कार्यक्रमका प्रकारहरू", "Event types")} ({types.length})</div>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-xs">
                {t.name}
                {t.isHoliday && <span className="text-amber-700">{tx("(बिदा)", "(holiday)")}</span>}
                <button className="font-bold text-red-600" onClick={() => void removeType(t)}>×</button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
            <input className="field max-w-xs" placeholder={tx("नयाँ प्रकार", "New type")} value={newType} onChange={(e) => setNewType(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newTypeHoliday} onChange={(e) => setNewTypeHoliday(e.target.checked)} />
              {tx("बिदा हो", "Is a holiday")}
            </label>
            <button className="btn text-sm" disabled={busy} onClick={() => void addType()}>{tx("थप्नुहोस्", "Add")}</button>
          </div>
        </div>
      )}

      {/* थप्ने/सम्पादन फारम (admin) */}
      {canEdit && form && (
        <div className="card grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 font-semibold">{form.id ? tx("कार्यक्रम सम्पादन", "Edit event") : tx("नयाँ कार्यक्रम", "New event")}</div>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{tx("कार्यक्रमको नाम *", "Event name *")}</span>
            <input className="field" value={form.draft.title} onChange={(e) => setForm({ ...form, draft: { ...form.draft, title: e.target.value } })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("प्रकार", "Type")}</span>
            <select
              className="field"
              value={form.draft.eventType}
              onChange={(e) => setForm({ ...form, draft: { ...form.draft, eventType: e.target.value, teachingOff: holidayOf(e.target.value) } })}
            >
              {typeNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <BsDateInput label={tx("सुरु मिति *", "Start date *")} value={form.draft.startDate} onChange={(iso) => setForm({ ...form, draft: { ...form.draft, startDate: iso } })} />
          <BsDateInput label={tx("अन्तिम मिति", "End date")} optional value={form.draft.endDate} onChange={(iso) => setForm({ ...form, draft: { ...form.draft, endDate: iso } })} />
          <div className="space-y-2 text-sm sm:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.draft.teachingOff} onChange={(e) => setForm({ ...form, draft: { ...form.draft, teachingOff: e.target.checked } })} />
              {tx("पठनपाठन बन्द (कक्षा हुँदैन)", "No teaching (classes off)")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.draft.campusOpen} onChange={(e) => setForm({ ...form, draft: { ...form.draft, campusOpen: e.target.checked } })} />
              {tx("क्याम्पस कार्यालय खुला रहन्छ", "Campus office stays open")}
            </label>
          </div>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">{tx("विवरण", "Description")}</span>
            <input className="field" value={form.draft.notes} onChange={(e) => setForm({ ...form, draft: { ...form.draft, notes: e.target.value } })} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn" disabled={busy} onClick={() => void save()}>{tx("सेभ गर्नुहोस्", "Save")}</button>
            <button className="btn-ghost" onClick={() => setForm(null)}>{tx("रद्द", "Cancel")}</button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}

      {tab === "calendar" && <CalendarGrid events={events} weeklyOff={weeklyOff} />}

      {tab === "list" && (
        <div className="space-y-3">
          {events.map((e) => (
            <EntryRow
              key={e.id}
              title={`${e.title} · ${e.eventType}`}
              archived={false}
              actions={actionsFor(e)}
            >
              <div className="text-xs text-slate-500">
                {displayDate(e.startDate, datePref)}
                {e.endDate && e.endDate !== e.startDate && <> → {displayDate(e.endDate, datePref)}</>}
              </div>
              {viewId === e.id && (
                <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">{tx("पठनपाठन", "Teaching")}</dt><dd>{e.teachingOff ? tx("बन्द", "Off") : tx("खुला", "On")}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("क्याम्पस कार्यालय", "Campus office")}</dt><dd>{e.campusOpen ? tx("खुला", "Open") : tx("बन्द", "Closed")}</dd></div>
                </dl>
              )}
            </EntryRow>
          ))}
          {!loading && events.length === 0 && (
            <p className="text-sm text-slate-500">{canEdit ? tx("कुनै कार्यक्रम छैन। माथिको \"+ नयाँ कार्यक्रम\" बाट थप्नुहोस्।", "No events yet. Use \"+ New event\" above.") : tx("अहिलेसम्म कुनै कार्यक्रम राखिएको छैन।", "No events yet.")}</p>
          )}
        </div>
      )}
    </div>
  );
}
