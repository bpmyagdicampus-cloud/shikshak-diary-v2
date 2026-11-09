import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuthStore } from "../lib/store";
import { asRows, writeOp } from "../lib/crud";
import { bsToAdIso, displayDate, academicYearName } from "../lib/dates";
import ItemMenu, { ArchivedToggle, type ItemAction } from "../components/ItemMenu";
import EntryRow, { InlineEdit } from "../components/EntryRow";

interface YearRow {
  id: string;
  name: string;
  calendar_system: "bs" | "ad";
  start_date: string;
  end_date: string;
  is_active: boolean;
  archived: boolean;
}

interface RawYear {
  id: string;
  name: string;
  calendar_system: "bs" | "ad";
  start_date: string;
  end_date: string;
  is_active: boolean;
  archived_at: string | null;
}

/** अर्को दिन: ISO मितिबाट एक दिन घटाउने */
function dayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AcademicYears() {
  const { tx } = useT();
  const orgId = useAuthStore((s) => s.currentCampusId);
  const datePref = useAuthStore((s) => s.profile?.datePref ?? "bs");

  const [years, setYears] = useState<YearRow[]>([]);
  const [startMonth, setStartMonth] = useState(4);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const [system, setSystem] = useState<"bs" | "ad">("bs");
  const [bsYear, setBsYear] = useState(2083);
  const [adStart, setAdStart] = useState("");
  const [adEnd, setAdEnd] = useState("");

  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const refresh = useCallback(async () => {
    if (!orgId) {
      setYears([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [org, yr] = await Promise.all([
        supabase.from("organizations").select("academic_year_start_month").eq("id", orgId).maybeSingle(),
        supabase
          .from("academic_years")
          .select("id,name,calendar_system,start_date,end_date,is_active,archived_at")
          .eq("org_id", orgId)
          .order("start_date", { ascending: false }),
      ]);
      if (org.error) throw new Error(org.error.message);
      if (yr.error) throw new Error(yr.error.message);
      const om = (org.data as { academic_year_start_month: number } | null)?.academic_year_start_month;
      if (om) setStartMonth(om);
      setYears(
        asRows<RawYear>(yr.data).map((y) => ({
          id: y.id,
          name: y.name,
          calendar_system: y.calendar_system,
          start_date: y.start_date,
          end_date: y.end_date,
          is_active: y.is_active,
          archived: y.archived_at !== null,
        }))
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createYear = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    let name: string;
    let start: string;
    let end: string;
    if (system === "bs") {
      start = bsToAdIso(bsYear, startMonth, 1);
      end = dayBefore(bsToAdIso(bsYear + 1, startMonth, 1));
      name = academicYearName(bsYear);
    } else {
      if (!DATE_RE.test(adStart) || !DATE_RE.test(adEnd)) {
        return setLoadError(tx("AD मिति YYYY-MM-DD ढाँचामा लेख्नुहोस्।", "Enter AD dates as YYYY-MM-DD."));
      }
      start = adStart;
      end = adEnd;
      name = `${adStart.slice(0, 4)}/${adEnd.slice(2, 4)}`;
    }
    if (end <= start) return setLoadError(tx("अन्त्य मिति सुरु मितिभन्दा पछि हुनुपर्छ।", "End date must be after start date."));

    setBusy(true);
    const makeActive = years.every((y) => y.archived || !y.is_active);
    const ok = await writeOp(
      () =>
        supabase.from("academic_years").insert({
          org_id: orgId,
          name,
          calendar_system: system,
          start_date: start,
          end_date: end,
          is_active: makeActive,
        }),
      tx("शैक्षिक वर्ष थपियो", "Academic year added")
    );
    setBusy(false);
    if (ok) {
      setAdStart("");
      setAdEnd("");
      setLoadError(null);
      await refresh();
    }
  };

  const startEdit = (y: YearRow) => {
    setViewId(null);
    setEditId(y.id);
    setEditName(y.name);
  };

  const saveEdit = async () => {
    if (!editId || !editName.trim()) return;
    setBusy(true);
    const ok = await writeOp(
      () => supabase.from("academic_years").update({ name: editName.trim() }).eq("id", editId),
      tx("सेभ भयो", "Saved")
    );
    setBusy(false);
    if (ok) {
      setEditId(null);
      await refresh();
    }
  };

  /** सक्रिय बनाउँदा यो क्याम्पसका अरू सबै वर्ष निष्क्रिय हुन्छन् (एउटै मात्र सक्रिय) */
  const activate = async (y: YearRow) => {
    if (!orgId) return;
    setBusy(true);
    const { error: offErr } = await supabase.from("academic_years").update({ is_active: false }).eq("org_id", orgId);
    if (offErr) {
      toast.error(offErr.message);
    } else {
      await writeOp(
        () => supabase.from("academic_years").update({ is_active: true, archived_at: null }).eq("id", y.id),
        tx("सक्रिय गरियो", "Activated")
      );
    }
    setBusy(false);
    await refresh();
  };

  /** निष्क्रिय: सक्रिय र archived दुवै */
  const deactivate = async (y: YearRow) => {
    setBusy(true);
    await writeOp(
      () => supabase.from("academic_years").update({ is_active: false, archived_at: new Date().toISOString() }).eq("id", y.id),
      tx("निष्क्रिय गरियो", "Deactivated")
    );
    setBusy(false);
    await refresh();
  };

  const remove = async (y: YearRow) => {
    if (!confirm(tx("यो शैक्षिक वर्ष स्थायी रूपमा मेटाउने?", "Permanently delete this academic year?"))) return;
    setBusy(true);
    await writeOp(() => supabase.from("academic_years").delete().eq("id", y.id), tx("मेटियो", "Deleted"));
    setBusy(false);
    await refresh();
  };

  const actionsFor = (y: YearRow): ItemAction[] => [
    { label: tx("हेर्नुहोस्", "View"), onClick: () => { setEditId(null); setViewId(viewId === y.id ? null : y.id); } },
    { label: tx("सम्पादन", "Edit"), onClick: () => startEdit(y) },
    ...(y.is_active
      ? []
      : [{ label: tx("सक्रिय बनाउनुहोस्", "Make active"), onClick: () => void activate(y) }]),
    ...(y.archived
      ? []
      : [{ label: tx("निष्क्रिय गर्नुहोस्", "Deactivate"), onClick: () => void deactivate(y) }]),
    { label: tx("मेटाउनुहोस्", "Delete"), onClick: () => void remove(y), danger: true },
  ];

  const visible = years.filter((y) => showArchived || !y.archived);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tx("शैक्षिक वर्ष", "Academic years")}</h1>
        <ArchivedToggle value={showArchived} onChange={setShowArchived} />
      </div>

      {!orgId && <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>}

      {orgId && (
        <form onSubmit={createYear} className="card space-y-3">
          <div className="flex gap-2">
            <button type="button" className={system === "bs" ? "btn" : "btn-ghost"} onClick={() => setSystem("bs")}>{tx("विक्रम संवत (BS)", "Bikram Sambat (BS)")}</button>
            <button type="button" className={system === "ad" ? "btn" : "btn-ghost"} onClick={() => setSystem("ad")}>{tx("ग्रेगोरियन (AD)", "Gregorian (AD)")}</button>
          </div>
          {system === "bs" ? (
            <label className="block max-w-xs text-sm">
              <span className="mb-1 block font-medium">{tx("BS वर्ष (जस्तै 2083)", "BS year (e.g. 2083)")}</span>
              <input className="field" type="number" min={2000} max={2099} value={bsYear} onChange={(e) => setBsYear(Number(e.target.value))} />
              <span className="mt-1 block text-xs text-slate-500">{tx("सुरु", "Starts")}: {startMonth}/1</span>
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="field" placeholder="YYYY-MM-DD" value={adStart} onChange={(e) => setAdStart(e.target.value)} />
              <input className="field" placeholder="YYYY-MM-DD" value={adEnd} onChange={(e) => setAdEnd(e.target.value)} />
            </div>
          )}
          <button className="btn" disabled={busy}>{tx("शैक्षिक वर्ष थप्नुहोस्", "Add academic year")}</button>
        </form>
      )}

      {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <div className="space-y-4">
        {visible.map((y) => (
          <EntryRow
            key={y.id}
            title={`${y.name}${y.is_active ? ` · ${tx("सक्रिय", "Active")}` : ""}`}
            archived={y.archived}
            actions={actionsFor(y)}
          >
            {viewId === y.id && (
              <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">{tx("सुरु मिति", "Start date")}</dt><dd>{displayDate(y.start_date, datePref)}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("अन्त्य मिति", "End date")}</dt><dd>{displayDate(y.end_date, datePref)}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("मिति प्रणाली", "Calendar")}</dt><dd>{y.calendar_system.toUpperCase()}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("स्थिति", "Status")}</dt><dd>{y.archived ? tx("निष्क्रिय", "Inactive") : y.is_active ? tx("सक्रिय", "Active") : tx("सक्रिय छैन", "Not active")}</dd></div>
              </dl>
            )}

            {editId === y.id && (
              <InlineEdit onSave={() => void saveEdit()} onCancel={() => setEditId(null)} busy={busy}>
                <input className="field" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </InlineEdit>
            )}
          </EntryRow>
        ))}
      </div>
    </div>
  );
}
