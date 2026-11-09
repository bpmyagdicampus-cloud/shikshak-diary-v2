import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { asRows, writeOp } from "../lib/crud";
import ItemMenu, { ArchivedToggle, type ItemAction } from "../components/ItemMenu";
import EntryRow, { InlineEdit } from "../components/EntryRow";

interface OrgRow {
  id: string;
  name: string;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  head_name: string | null;
  academic_year_start_month: number;
  archived: boolean;
}

interface RawOrg {
  id: string;
  name: string;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  head_name: string | null;
  academic_year_start_month: number;
  archived_at: string | null;
}

/** Super admin पृष्ठ: सबै क्याम्पसको सूची, नयाँ क्याम्पस, र ⋮ मेनु */
export default function Organizations() {
  const { tx, pick } = useT();

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newStartMonth, setNewStartMonth] = useState(4);

  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameEn, setEditNameEn] = useState("");
  const [editStartMonth, setEditStartMonth] = useState(4);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,name_en,address,phone,email,website,head_name,academic_year_start_month,archived_at")
      .order("name");
    if (error) {
      setLoadError(error.message);
    } else {
      setOrgs(
        asRows<RawOrg>(data).map((o) => ({
          id: o.id,
          name: o.name,
          name_en: o.name_en,
          address: o.address,
          phone: o.phone,
          email: o.email,
          website: o.website,
          head_name: o.head_name,
          academic_year_start_month: o.academic_year_start_month,
          archived: o.archived_at !== null,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createOrg = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase.from("organizations").insert({
          name: newName.trim(),
          name_en: newNameEn.trim() || null,
          academic_year_start_month: newStartMonth,
        }),
      tx("क्याम्पस थपियो", "Campus added")
    );
    setBusy(false);
    if (ok) {
      setNewName("");
      setNewNameEn("");
      await refresh();
    }
  };

  const startEdit = (o: OrgRow) => {
    setViewId(null);
    setEditId(o.id);
    setEditName(o.name);
    setEditNameEn(o.name_en ?? "");
    setEditStartMonth(o.academic_year_start_month);
  };

  const saveEdit = async () => {
    if (!editId || !editName.trim()) return;
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase
          .from("organizations")
          .update({
            name: editName.trim(),
            name_en: editNameEn.trim() || null,
            academic_year_start_month: editStartMonth,
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

  const toggleArchive = async (o: OrgRow) => {
    setBusy(true);
    await writeOp(
      () =>
        supabase
          .from("organizations")
          .update({ archived_at: o.archived ? null : new Date().toISOString() })
          .eq("id", o.id),
      o.archived ? tx("सक्रिय गरियो", "Activated") : tx("निष्क्रिय गरियो", "Deactivated")
    );
    setBusy(false);
    await refresh();
  };

  const remove = async (o: OrgRow) => {
    if (!confirm(tx("यो क्याम्पस स्थायी रूपमा मेटाउने?", "Permanently delete this campus?"))) return;
    setBusy(true);
    await writeOp(() => supabase.from("organizations").delete().eq("id", o.id), tx("मेटियो", "Deleted"));
    setBusy(false);
    await refresh();
  };

  const actionsFor = (o: OrgRow): ItemAction[] => [
    { label: tx("हेर्नुहोस्", "View"), onClick: () => { setEditId(null); setViewId(viewId === o.id ? null : o.id); } },
    { label: tx("सम्पादन", "Edit"), onClick: () => startEdit(o) },
    { label: o.archived ? tx("सक्रिय गर्नुहोस्", "Activate") : tx("निष्क्रिय गर्नुहोस्", "Deactivate"), onClick: () => void toggleArchive(o) },
    { label: tx("मेटाउनुहोस्", "Delete"), onClick: () => void remove(o), danger: true },
  ];

  const visible = orgs.filter((o) => showArchived || !o.archived);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tx("सबै क्याम्पस", "All campuses")}</h1>
        <ArchivedToggle value={showArchived} onChange={setShowArchived} />
      </div>

      <form onSubmit={createOrg} className="card grid gap-3 sm:grid-cols-4">
        <input className="field" required placeholder={tx("क्याम्पसको नाम (नेपाली)", "Campus name (Nepali)")} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input className="field" placeholder={tx("English नाम (वैकल्पिक)", "English name (optional)")} value={newNameEn} onChange={(e) => setNewNameEn(e.target.value)} />
        <select className="field" value={newStartMonth} onChange={(e) => setNewStartMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{tx("सुरु महिना", "Start month")}: {m}</option>)}
        </select>
        <button className="btn" disabled={busy}>{tx("क्याम्पस थप्नुहोस्", "Add campus")}</button>
      </form>

      {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      <div className="space-y-4">
        {visible.map((o) => (
          <EntryRow key={o.id} title={pick(o.name, o.name_en)} archived={o.archived} actions={actionsFor(o)}>
            {viewId === o.id && (
              <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">{tx("ठेगाना", "Address")}</dt><dd>{o.address ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("फोन", "Phone")}</dt><dd>{o.phone ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("इमेल", "Email")}</dt><dd>{o.email ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Website</dt><dd>{o.website ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("क्याम्पस प्रमुख", "Campus head")}</dt><dd>{o.head_name ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">{tx("सुरु महिना", "Start month")}</dt><dd>{o.academic_year_start_month}</dd></div>
              </dl>
            )}

            {editId === o.id && (
              <InlineEdit onSave={() => void saveEdit()} onCancel={() => setEditId(null)} busy={busy}>
                <input className="field" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={tx("नाम (नेपाली)", "Name (Nepali)")} />
                <input className="field" value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} placeholder={tx("English नाम", "English name")} />
                <select className="field" value={editStartMonth} onChange={(e) => setEditStartMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{tx("सुरु महिना", "Start month")}: {m}</option>)}
                </select>
              </InlineEdit>
            )}
          </EntryRow>
        ))}
      </div>
    </div>
  );
}
