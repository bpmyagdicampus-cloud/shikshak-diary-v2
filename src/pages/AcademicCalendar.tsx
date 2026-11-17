import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { useAuthStore } from "../lib/store";
import { asRows, writeOp } from "../lib/crud";
import { displayDate } from "../lib/dates";
import { todayIso } from "../lib/calendarDays";
import BsDateInput from "../components/common/BsDateInput";
import EntryRow, { InlineEdit } from "../components/EntryRow";
import type { ItemAction } from "../components/ItemMenu";

/** विभाग अनुसार शैक्षिक कार्यतालिका — विभाग प्रमुख/admin सम्पादन; विभागका शिक्षक पढ्ने मात्र */
type ItemType =
  | "class_start" | "internal_exam" | "result_publish" | "winter_vacation"
  | "summer_vacation" | "practical" | "viva" | "other";

const ITEM_TYPES: ItemType[] = [
  "class_start", "internal_exam", "result_publish", "winter_vacation",
  "summer_vacation", "practical", "viva", "other",
];

interface Dept { id: string; name: string; name_en: string | null }
interface YearOpt { id: string; name: string; is_active: boolean }
interface Header {
  id: string;
  classStart: string;
  classEnd: string;
  totalWorkingDays: number | null;
  totalTeachingDays: number | null;
  status: "draft" | "published";
  notes: string;
}
interface Item { id: string; itemType: ItemType; title: string; startDate: string; endDate: string; notes: string }

interface HeaderRaw {
  id: string; class_start: string | null; class_end: string | null;
  total_working_days: number | null; total_teaching_days: number | null;
  status: "draft" | "published"; notes: string;
}
interface ItemRaw { id: string; item_type: ItemType; title: string; start_date: string; end_date: string; notes: string }

const emptyItem = () => ({ itemType: "internal_exam" as ItemType, title: "", startDate: todayIso(), endDate: todayIso(), notes: "" });

export default function AcademicCalendar() {
  const { tx, pick } = useT();
  const { can } = useAuth();
  const orgId = useAuthStore((s) => s.currentCampusId);
  const memberships = useAuthStore((s) => s.memberships);
  const datePref = useAuthStore((s) => s.profile?.datePref ?? "bs");

  const [years, setYears] = useState<YearOpt[]>([]);
  const [yearId, setYearId] = useState("");
  const [depts, setDepts] = useState<Dept[]>([]);
  const [deptId, setDeptId] = useState("");
  const [header, setHeader] = useState<Header | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState(emptyItem);
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState(emptyItem);
  const [viewId, setViewId] = useState<string | null>(null);

  const myDeptIds = useMemo(
    () => memberships.filter((m) => m.campusId === orgId && m.departmentId).map((m) => m.departmentId as string),
    [memberships, orgId]
  );
  const canEdit = can.campusAdmin || (can.deptHead && myDeptIds.includes(deptId));

  const typeLabel = (t: ItemType): string =>
    ({
      class_start: tx("कक्षा सुरु", "Class start"),
      internal_exam: tx("आन्तरिक परीक्षा", "Internal exam"),
      result_publish: tx("नतिजा प्रकाशन", "Result publication"),
      winter_vacation: tx("जाडो बिदा", "Winter vacation"),
      summer_vacation: tx("गर्मी बिदा", "Summer vacation"),
      practical: tx("प्रयोगात्मक", "Practical"),
      viva: tx("भाइभा", "Viva"),
      other: tx("अन्य", "Other"),
    } as Record<ItemType, string>)[t];

  /** वर्ष र विभाग सूची */
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [y, d] = await Promise.all([
        supabase.from("academic_years").select("id,name,is_active").eq("org_id", orgId).is("archived_at", null).order("start_date", { ascending: false }),
        supabase.from("departments").select("id,name,name_en").eq("org_id", orgId).is("archived_at", null).order("name"),
      ]);
      if (y.error) toast.error(y.error.message);
      if (d.error) toast.error(d.error.message);
      const ys = asRows<YearOpt>(y.data);
      setYears(ys);
      setYearId((cur) => cur || ys.find((x) => x.is_active)?.id || ys[0]?.id || "");
      const allDepts = asRows<Dept>(d.data);
      // admin: सबै; विभाग प्रमुख/शिक्षक: आफ्नो विभाग मात्र
      setDepts(can.campusAdmin ? allDepts : allDepts.filter((x) => myDeptIds.includes(x.id)));
    })();
  }, [orgId, can.campusAdmin, myDeptIds]);

  useEffect(() => {
    if (!deptId && depts[0]) setDeptId(depts[0].id);
  }, [depts, deptId]);

  const load = useCallback(async () => {
    if (!orgId || !deptId || !yearId) {
      setHeader(null);
      setItems([]);
      return;
    }
    setLoading(true);
    const h = await supabase
      .from("academic_calendars")
      .select("id,class_start,class_end,total_working_days,total_teaching_days,status,notes")
      .eq("department_id", deptId)
      .eq("academic_year_id", yearId)
      .maybeSingle();
    if (h.error) {
      toast.error(h.error.message);
      setLoading(false);
      return;
    }
    const hr = h.data as HeaderRaw | null;
    if (!hr) {
      setHeader(null);
      setItems([]);
      setLoading(false);
      return;
    }
    setHeader({
      id: hr.id,
      classStart: hr.class_start ?? "",
      classEnd: hr.class_end ?? "",
      totalWorkingDays: hr.total_working_days,
      totalTeachingDays: hr.total_teaching_days,
      status: hr.status,
      notes: hr.notes,
    });
    const it = await supabase
      .from("academic_calendar_items")
      .select("id,item_type,title,start_date,end_date,notes")
      .eq("calendar_id", hr.id)
      .order("start_date");
    if (it.error) toast.error(it.error.message);
    setItems(
      asRows<ItemRaw>(it.data).map((x) => ({
        id: x.id, itemType: x.item_type, title: x.title, startDate: x.start_date, endDate: x.end_date, notes: x.notes,
      }))
    );
    setLoading(false);
  }, [orgId, deptId, yearId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** कार्यतालिका बनाउने (पहिलो पटक) */
  const createHeader = async () => {
    if (!orgId || !deptId || !yearId) return;
    setBusy(true);
    const ok = await writeOp(
      () => supabase.from("academic_calendars").insert({ org_id: orgId, department_id: deptId, academic_year_id: yearId }),
      tx("कार्यतालिका बनाइयो", "Calendar created")
    );
    setBusy(false);
    if (ok) await load();
  };

  /** विवरण सेभ (कक्षा सुरु/अन्त्य, कार्यदिन, पढाइ दिन, स्थिति) */
  const saveHeader = async () => {
    if (!header) return;
    if (header.classStart && header.classEnd && header.classEnd < header.classStart) {
      return toast.error(tx("कक्षा अन्त्य सुरुभन्दा पछि हुनुपर्छ।", "Class end must be after class start."));
    }
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase
          .from("academic_calendars")
          .update({
            class_start: header.classStart || null,
            class_end: header.classEnd || null,
            total_working_days: header.totalWorkingDays,
            total_teaching_days: header.totalTeachingDays,
            status: header.status,
            notes: header.notes,
          })
          .eq("id", header.id),
      tx("सेभ भयो", "Saved")
    );
    setBusy(false);
    if (ok) await load();
  };

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!header) return;
    if (!newItem.title.trim() || !newItem.startDate || !newItem.endDate) return toast.error(tx("शीर्षक र मितिहरू भर्नुहोस्।", "Fill title and dates."));
    if (newItem.endDate < newItem.startDate) return toast.error(tx("अन्त्य मिति सुरुभन्दा पछि हुनुपर्छ।", "End date must be after start date."));
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase.from("academic_calendar_items").insert({
          calendar_id: header.id,
          item_type: newItem.itemType,
          title: newItem.title.trim(),
          start_date: newItem.startDate,
          end_date: newItem.endDate,
          notes: newItem.notes.trim(),
        }),
      tx("थपियो", "Added")
    );
    setBusy(false);
    if (ok) {
      setNewItem(emptyItem());
      await load();
    }
  };

  const saveItem = async () => {
    if (!editItemId) return;
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase
          .from("academic_calendar_items")
          .update({
            item_type: editItem.itemType,
            title: editItem.title.trim(),
            start_date: editItem.startDate,
            end_date: editItem.endDate,
            notes: editItem.notes.trim(),
          })
          .eq("id", editItemId),
      tx("सेभ भयो", "Saved")
    );
    setBusy(false);
    if (ok) {
      setEditItemId(null);
      await load();
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm(tx("यो प्रविष्टि मेटाउने?", "Delete this entry?"))) return;
    setBusy(true);
    await writeOp(() => supabase.from("academic_calendar_items").delete().eq("id", id), tx("मेटियो", "Deleted"));
    setBusy(false);
    await load();
  };

  const itemActions = (it: Item): ItemAction[] => {
    const base: ItemAction[] = [{ label: tx("हेर्नुहोस्", "View"), onClick: () => setViewId(viewId === it.id ? null : it.id) }];
    if (!canEdit) return base;
    return [
      ...base,
      {
        label: tx("सम्पादन", "Edit"),
        onClick: () => {
          setEditItemId(it.id);
          setEditItem({ itemType: it.itemType, title: it.title, startDate: it.startDate, endDate: it.endDate, notes: it.notes });
        },
      },
      { label: tx("मेटाउनुहोस्", "Delete"), danger: true, onClick: () => void removeItem(it.id) },
    ];
  };

  const deptName = depts.find((d) => d.id === deptId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{tx("शैक्षिक कार्यतालिका", "Academic calendar")}</h1>
        <p className="text-sm text-slate-500">
          {tx("विभाग र शैक्षिक वर्ष अनुसार: कक्षा सुरु, कार्यदिन, परीक्षा, नतिजा, बिदा, प्रयोगात्मक र भाइभा।", "By department and academic year: class start, working days, exams, results, vacations, practical and viva.")}
        </p>
      </div>

      {!orgId && <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>}

      {orgId && (
        <div className="flex flex-wrap gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("विभाग", "Department")}</span>
            <select className="field max-w-xs" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              {depts.map((d) => <option key={d.id} value={d.id}>{pick(d.name, d.name_en)}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{tx("शैक्षिक वर्ष", "Academic year")}</span>
            <select className="field max-w-xs" value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_active ? " ✓" : ""}</option>)}
            </select>
          </label>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}

      {orgId && deptId && yearId && !header && !loading && (
        <div className="card space-y-3">
          <p className="text-sm">{tx("यो विभाग र वर्षको कार्यतालिका अझै बनेको छैन।", "No calendar exists for this department and year yet.")}</p>
          {canEdit ? (
            <button className="btn" disabled={busy} onClick={() => void createHeader()}>{tx("कार्यतालिका बनाउनुहोस्", "Create calendar")}</button>
          ) : (
            <p className="text-xs text-slate-500">{tx("विभाग प्रमुखले बनाएपछि देखिन्छ।", "It appears after the department head creates it.")}</p>
          )}
        </div>
      )}

      {header && (
        <>
          <div className="card grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 font-semibold">
              {deptName ? pick(deptName.name, deptName.name_en) : ""} · {tx("सारांश", "Summary")}
              <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal">
                {header.status === "published" ? tx("प्रकाशित", "Published") : tx("मस्यौदा", "Draft")}
              </span>
            </div>
            <BsDateInput label={tx("कक्षा सुरु मिति", "Class start date")} value={header.classStart} onChange={(iso) => canEdit && setHeader({ ...header, classStart: iso })} />
            <BsDateInput label={tx("कक्षा अन्त्य मिति", "Class end date")} value={header.classEnd} onChange={(iso) => canEdit && setHeader({ ...header, classEnd: iso })} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{tx("कुल कार्यदिन", "Total working days")}</span>
              <input className="field" type="number" min={0} disabled={!canEdit} value={header.totalWorkingDays ?? ""} onChange={(e) => setHeader({ ...header, totalWorkingDays: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{tx("कुल पढाइ हुने दिन", "Total teaching days")}</span>
              <input className="field" type="number" min={0} disabled={!canEdit} value={header.totalTeachingDays ?? ""} onChange={(e) => setHeader({ ...header, totalTeachingDays: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{tx("स्थिति", "Status")}</span>
              <select className="field" disabled={!canEdit} value={header.status} onChange={(e) => setHeader({ ...header, status: e.target.value as "draft" | "published" })}>
                <option value="draft">{tx("मस्यौदा", "Draft")}</option>
                <option value="published">{tx("प्रकाशित (शिक्षकले देख्छन्)", "Published (visible to teachers)")}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{tx("टिप्पणी", "Notes")}</span>
              <input className="field" disabled={!canEdit} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
            </label>
            {canEdit && (
              <div className="sm:col-span-2">
                <button className="btn" disabled={busy} onClick={() => void saveHeader()}>{tx("सारांश सेभ गर्नुहोस्", "Save summary")}</button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{tx("कार्यक्रम र परीक्षा", "Events & exams")}</h2>

            {canEdit && (
              <form onSubmit={addItem} className="card grid gap-3 sm:grid-cols-2">
                <select className="field" value={newItem.itemType} onChange={(e) => setNewItem({ ...newItem, itemType: e.target.value as ItemType })}>
                  {ITEM_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
                </select>
                <input className="field" required placeholder={tx("शीर्षक", "Title")} value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} />
                <BsDateInput label={tx("सुरु मिति", "From")} value={newItem.startDate} onChange={(iso) => setNewItem({ ...newItem, startDate: iso })} />
                <BsDateInput label={tx("अन्त्य मिति", "To")} value={newItem.endDate} onChange={(iso) => setNewItem({ ...newItem, endDate: iso })} />
                <input className="field sm:col-span-2" placeholder={tx("टिप्पणी (वैकल्पिक)", "Notes (optional)")} value={newItem.notes} onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })} />
                <div className="sm:col-span-2"><button className="btn" disabled={busy}>{tx("थप्नुहोस्", "Add")}</button></div>
              </form>
            )}

            {items.map((it) => (
              <EntryRow key={it.id} title={`${typeLabel(it.itemType)} · ${it.title}`} archived={false} actions={itemActions(it)}>
                <div className="text-xs text-slate-500">
                  {displayDate(it.startDate, datePref)} {it.startDate !== it.endDate && `– ${displayDate(it.endDate, datePref)}`}
                  {it.notes ? ` · ${it.notes}` : ""}
                </div>
                {editItemId === it.id && (
                  <InlineEdit onSave={() => void saveItem()} onCancel={() => setEditItemId(null)} busy={busy}>
                    <select className="field" value={editItem.itemType} onChange={(e) => setEditItem({ ...editItem, itemType: e.target.value as ItemType })}>
                      {ITEM_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
                    </select>
                    <input className="field" value={editItem.title} onChange={(e) => setEditItem({ ...editItem, title: e.target.value })} />
                    <BsDateInput label={tx("सुरु", "From")} value={editItem.startDate} onChange={(iso) => setEditItem({ ...editItem, startDate: iso })} />
                    <BsDateInput label={tx("अन्त्य", "To")} value={editItem.endDate} onChange={(iso) => setEditItem({ ...editItem, endDate: iso })} />
                  </InlineEdit>
                )}
              </EntryRow>
            ))}
            {items.length === 0 && <p className="text-sm text-slate-500">{tx("कुनै प्रविष्टि छैन।", "No entries yet.")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
