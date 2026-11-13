import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuthStore } from "../lib/store";
import { asRows, writeOp } from "../lib/crud";
import { displayDate } from "../lib/dates";
import BsDateInput from "../components/common/BsDateInput";
import { type ItemAction } from "../components/ItemMenu";
import EntryRow, { InlineEdit } from "../components/EntryRow";

/** क्याम्पसको वार्षिक भित्तेपात्रो (campus-wide events, बिदा, कार्यक्रम) — admin मात्र सम्पादन */
type EventType = "event" | "holiday" | "exam" | "activity";

interface EventRow {
  id: string;
  title: string;
  eventType: EventType;
  startDate: string;
  endDate: string;
  notes: string;
}

interface RawEvent {
  id: string;
  title: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  notes: string;
}

interface Draft {
  title: string;
  eventType: EventType;
  startDate: string;
  endDate: string;
  notes: string;
}

const emptyDraft = (): Draft => ({ title: "", eventType: "event", startDate: "", endDate: "", notes: "" });

export default function AnnualCalendar() {
  const { tx } = useT();
  const orgId = useAuthStore((s) => s.currentCampusId);
  const datePref = useAuthStore((s) => s.profile?.datePref ?? "bs");

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const typeLabel = (t: EventType) =>
    ({
      event: tx("कार्यक्रम", "Event"),
      holiday: tx("बिदा", "Holiday"),
      exam: tx("परीक्षा", "Exam"),
      activity: tx("क्रियाकलाप", "Activity"),
    } as Record<EventType, string>)[t];

  const refresh = useCallback(async () => {
    if (!orgId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,event_type,start_date,end_date,notes")
      .eq("org_id", orgId)
      .order("start_date");
    if (error) toast.error(error.message);
    else
      setEvents(
        asRows<RawEvent>(data).map((e) => ({
          id: e.id,
          title: e.title,
          eventType: e.event_type,
          startDate: e.start_date,
          endDate: e.end_date,
          notes: e.notes,
        }))
      );
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const validate = (d: Draft): string | null => {
    if (!d.title.trim()) return tx("शीर्षक आवश्यक छ।", "Title is required.");
    if (!d.startDate || !d.endDate) return tx("मिति छान्नुहोस्।", "Select dates.");
    if (d.endDate < d.startDate) return tx("अन्त्य मिति सुरु मितिभन्दा पछि हुनुपर्छ।", "End date must be after start date.");
    return null;
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const err = validate(draft);
    if (err) return toast.error(err);
    if (!orgId) return;
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase.from("calendar_events").insert({
          org_id: orgId,
          title: draft.title.trim(),
          event_type: draft.eventType,
          start_date: draft.startDate,
          end_date: draft.endDate,
          notes: draft.notes.trim(),
        }),
      tx("थपियो", "Added")
    );
    setBusy(false);
    if (ok) {
      setDraft(emptyDraft());
      await refresh();
    }
  };

  const saveEdit = async () => {
    if (!editId) return;
    const err = validate(editDraft);
    if (err) return toast.error(err);
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase
          .from("calendar_events")
          .update({
            title: editDraft.title.trim(),
            event_type: editDraft.eventType,
            start_date: editDraft.startDate,
            end_date: editDraft.endDate,
            notes: editDraft.notes.trim(),
          })
          .eq("id", editId),
      tx("सेभ भयो", "Saved")
    );
    setBusy(false);
    if (ok) {
      setEditId(null);
      await refresh();
    }
  };

  const remove = async (id: string) => {
    if (!confirm(tx("यो कार्यक्रम मेटाउने?", "Delete this event?"))) return;
    setBusy(true);
    await writeOp(() => supabase.from("calendar_events").delete().eq("id", id), tx("मेटियो", "Deleted"));
    setBusy(false);
    await refresh();
  };

  const actionsFor = (e: EventRow): ItemAction[] => [
    {
      label: tx("सम्पादन", "Edit"),
      onClick: () => {
        setEditId(e.id);
        setEditDraft({ title: e.title, eventType: e.eventType, startDate: e.startDate, endDate: e.endDate, notes: e.notes });
      },
    },
    { label: tx("मेटाउनुहोस्", "Delete"), onClick: () => void remove(e.id), danger: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{tx("क्याम्पस वार्षिक भित्तेपात्रो", "Campus annual calendar")}</h1>
        <p className="text-sm text-slate-500">
          {tx("क्याम्पसका समग्र कार्यक्रम, सार्वजनिक बिदा र विशेष दिन।", "Campus-wide events, public holidays and special days.")}
        </p>
      </div>

      {!orgId && <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>}

      {orgId && (
        <form onSubmit={add} className="card grid gap-3 sm:grid-cols-2">
          <input className="field sm:col-span-2" required placeholder={tx("शीर्षक", "Title")} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <select className="field" value={draft.eventType} onChange={(e) => setDraft({ ...draft, eventType: e.target.value as EventType })}>
            <option value="event">{typeLabel("event")}</option>
            <option value="holiday">{typeLabel("holiday")}</option>
            <option value="exam">{typeLabel("exam")}</option>
            <option value="activity">{typeLabel("activity")}</option>
          </select>
          <input className="field" placeholder={tx("टिप्पणी (वैकल्पिक)", "Notes (optional)")} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          <BsDateInput label={tx("सुरु मिति", "Start date")} value={draft.startDate} onChange={(iso) => setDraft({ ...draft, startDate: iso })} />
          <BsDateInput label={tx("अन्त्य मिति", "End date")} value={draft.endDate} onChange={(iso) => setDraft({ ...draft, endDate: iso })} />
          <div className="sm:col-span-2">
            <button className="btn" disabled={busy}>{tx("थप्नुहोस्", "Add")}</button>
          </div>
        </form>
      )}

      {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}

      <div className="space-y-3">
        {events.map((e) => (
          <EntryRow key={e.id} title={`${e.title} · ${typeLabel(e.eventType)}`} archived={false} actions={actionsFor(e)}>
            <div className="text-xs text-slate-500">
              {displayDate(e.startDate, datePref)} {e.startDate !== e.endDate && `– ${displayDate(e.endDate, datePref)}`}
              {e.notes ? ` · ${e.notes}` : ""}
            </div>
            {editId === e.id && (
              <InlineEdit onSave={() => void saveEdit()} onCancel={() => setEditId(null)} busy={busy}>
                <input className="field" value={editDraft.title} onChange={(x) => setEditDraft({ ...editDraft, title: x.target.value })} />
                <select className="field" value={editDraft.eventType} onChange={(x) => setEditDraft({ ...editDraft, eventType: x.target.value as EventType })}>
                  <option value="event">{typeLabel("event")}</option>
                  <option value="holiday">{typeLabel("holiday")}</option>
                  <option value="exam">{typeLabel("exam")}</option>
                  <option value="activity">{typeLabel("activity")}</option>
                </select>
                <BsDateInput label={tx("सुरु", "Start")} value={editDraft.startDate} onChange={(iso) => setEditDraft({ ...editDraft, startDate: iso })} />
                <BsDateInput label={tx("अन्त्य", "End")} value={editDraft.endDate} onChange={(iso) => setEditDraft({ ...editDraft, endDate: iso })} />
              </InlineEdit>
            )}
          </EntryRow>
        ))}
        {!loading && events.length === 0 && <p className="text-sm text-slate-500">{tx("कुनै कार्यक्रम छैन।", "No events yet.")}</p>}
      </div>
    </div>
  );
}
