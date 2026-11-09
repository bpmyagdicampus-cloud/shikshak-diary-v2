import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuthStore } from "../lib/store";
import { asRows, writeOp } from "../lib/crud";
import ItemMenu, { ArchivedToggle, type ItemAction } from "../components/ItemMenu";
import EntryRow, { InlineEdit } from "../components/EntryRow";

interface DeptRow {
  id: string;
  name: string;
  name_en: string | null;
  archived: boolean;
}

interface ProgRow {
  id: string;
  name: string;
  name_en: string | null;
  department_id: string;
  archived: boolean;
}

interface RawDept {
  id: string;
  name: string;
  name_en: string | null;
  archived_at: string | null;
}

interface RawProg {
  id: string;
  name: string;
  name_en: string | null;
  department_id: string;
  archived_at: string | null;
}

type Kind = "dept" | "prog";

export default function Departments() {
  const { tx, pick } = useT();
  const orgId = useAuthStore((s) => s.currentCampusId);

  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [progs, setProgs] = useState<ProgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptNameEn, setNewDeptNameEn] = useState("");
  const [newProgDept, setNewProgDept] = useState("");
  const [newProgName, setNewProgName] = useState("");
  const [newProgNameEn, setNewProgNameEn] = useState("");

  const [viewKey, setViewKey] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ kind: Kind; id: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameEn, setEditNameEn] = useState("");

  const refresh = useCallback(async () => {
    if (!orgId) {
      setDepts([]);
      setProgs([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [d, p] = await Promise.all([
        supabase.from("departments").select("id,name,name_en,archived_at").eq("org_id", orgId).order("name"),
        supabase.from("programs").select("id,name,name_en,department_id,archived_at").eq("org_id", orgId).order("name"),
      ]);
      if (d.error) throw new Error(d.error.message);
      if (p.error) throw new Error(p.error.message);
      setDepts(
        asRows<RawDept>(d.data).map((x) => ({
          id: x.id,
          name: x.name,
          name_en: x.name_en,
          archived: x.archived_at !== null,
        }))
      );
      setProgs(
        asRows<RawProg>(p.data).map((x) => ({
          id: x.id,
          name: x.name,
          name_en: x.name_en,
          department_id: x.department_id,
          archived: x.archived_at !== null,
        }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tableOf = (kind: Kind) => (kind === "dept" ? "departments" : "programs");

  const createDept = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId || !newDeptName.trim()) return;
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase.from("departments").insert({
          org_id: orgId,
          name: newDeptName.trim(),
          name_en: newDeptNameEn.trim() || null,
        }),
      tx("विभाग थपियो", "Department added")
    );
    setBusy(false);
    if (ok) {
      setNewDeptName("");
      setNewDeptNameEn("");
      await refresh();
    }
  };

  const createProg = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId || !newProgDept || !newProgName.trim()) return;
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase.from("programs").insert({
          org_id: orgId,
          department_id: newProgDept,
          name: newProgName.trim(),
          name_en: newProgNameEn.trim() || null,
        }),
      tx("कार्यक्रम थपियो", "Program added")
    );
    setBusy(false);
    if (ok) {
      setNewProgName("");
      setNewProgNameEn("");
      await refresh();
    }
  };

  const startEdit = (kind: Kind, id: string, name: string, nameEn: string | null) => {
    setViewKey(null);
    setEdit({ kind, id });
    setEditName(name);
    setEditNameEn(nameEn ?? "");
  };

  const saveEdit = async () => {
    if (!edit) return;
    const name = editName.trim();
    if (!name) return;
    setBusy(true);
    const patch = { name, name_en: editNameEn.trim() || null };
    const ok = await writeOp(
      () => supabase.from(tableOf(edit.kind)).update(patch).eq("id", edit.id),
      tx("सेभ भयो", "Saved")
    );
    setBusy(false);
    if (ok) {
      setEdit(null);
      await refresh();
    }
  };

  const toggleArchive = async (kind: Kind, id: string, archived: boolean) => {
    setBusy(true);
    await writeOp(
      () =>
        supabase
          .from(tableOf(kind))
          .update({ archived_at: archived ? null : new Date().toISOString() })
          .eq("id", id),
      archived ? tx("सक्रिय गरियो", "Activated") : tx("निष्क्रिय गरियो", "Deactivated")
    );
    setBusy(false);
    await refresh();
  };

  const remove = async (kind: Kind, id: string) => {
    if (!confirm(tx("स्थायी रूपमा मेटाउने?", "Permanently delete?"))) return;
    setBusy(true);
    await writeOp(() => supabase.from(tableOf(kind)).delete().eq("id", id), tx("मेटियो", "Deleted"));
    setBusy(false);
    await refresh();
  };

  const actionsFor = (
    kind: Kind,
    id: string,
    archived: boolean,
    name: string,
    nameEn: string | null
  ): ItemAction[] => {
    const key = `${kind}:${id}`;
    return [
      { label: tx("हेर्नुहोस्", "View"), onClick: () => setViewKey(viewKey === key ? null : key) },
      { label: tx("सम्पादन", "Edit"), onClick: () => startEdit(kind, id, name, nameEn) },
      {
        label: archived ? tx("सक्रिय गर्नुहोस्", "Activate") : tx("निष्क्रिय गर्नुहोस्", "Deactivate"),
        onClick: () => void toggleArchive(kind, id, archived),
      },
      { label: tx("मेटाउनुहोस्", "Delete"), onClick: () => void remove(kind, id), danger: true },
    ];
  };

  const visibleDepts = depts.filter((d) => showArchived || !d.archived);
  const deptNameEn = (d: DeptRow) => pick(d.name, d.name_en);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tx("विभाग र कार्यक्रम", "Departments & Programs")}</h1>
        <ArchivedToggle value={showArchived} onChange={setShowArchived} />
      </div>

      {!orgId && <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {orgId && (
        <div className="grid gap-4 md:grid-cols-2">
          <form onSubmit={createDept} className="card space-y-3">
            <div className="font-semibold">{tx("नयाँ विभाग", "New department")}</div>
            <input className="field" required placeholder={tx("विभागको नाम (नेपाली)", "Department name (Nepali)")} value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} />
            <input className="field" placeholder={tx("English नाम (वैकल्पिक)", "English name (optional)")} value={newDeptNameEn} onChange={(e) => setNewDeptNameEn(e.target.value)} />
            <button className="btn" disabled={busy}>{tx("थप्नुहोस्", "Add")}</button>
          </form>

          <form onSubmit={createProg} className="card space-y-3">
            <div className="font-semibold">{tx("नयाँ कार्यक्रम", "New program")}</div>
            <select className="field" required value={newProgDept} onChange={(e) => setNewProgDept(e.target.value)}>
              <option value="">{tx("विभाग छान्नुहोस्", "Select department")}</option>
              {depts.filter((d) => !d.archived).map((d) => (
                <option key={d.id} value={d.id}>{deptNameEn(d)}</option>
              ))}
            </select>
            <input className="field" required placeholder={tx("कार्यक्रमको नाम", "Program name")} value={newProgName} onChange={(e) => setNewProgName(e.target.value)} />
            <input className="field" placeholder={tx("English नाम (वैकल्पिक)", "English name (optional)")} value={newProgNameEn} onChange={(e) => setNewProgNameEn(e.target.value)} />
            <button className="btn" disabled={busy}>{tx("थप्नुहोस्", "Add")}</button>
          </form>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}

      <div className="space-y-4">
        {visibleDepts.map((d) => {
          const key = `dept:${d.id}`;
          const myProgs = progs.filter((p) => p.department_id === d.id && (showArchived || !p.archived));
          return (
            <EntryRow
              key={d.id}
              title={deptNameEn(d)}
              archived={d.archived}
              actions={actionsFor("dept", d.id, d.archived, d.name, d.name_en)}
            >
              {viewKey === key && (
                <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">{tx("नेपाली नाम", "Nepali name")}</dt><dd>{d.name}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("English नाम", "English name")}</dt><dd>{d.name_en ?? "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("कार्यक्रम संख्या", "Programs")}</dt><dd>{myProgs.length}</dd></div>
                </dl>
              )}

              {edit?.kind === "dept" && edit.id === d.id && (
                <InlineEdit onSave={() => void saveEdit()} onCancel={() => setEdit(null)} busy={busy}>
                  <input className="field" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className="field" value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} placeholder={tx("English नाम", "English name")} />
                </InlineEdit>
              )}

              <div className="space-y-2 pl-3">
                {myProgs.map((p) => {
                  const pKey = `prog:${p.id}`;
                  return (
                    <div key={p.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">
                          {pick(p.name, p.name_en)}
                          {p.archived && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs font-normal">{tx("निष्क्रिय", "Inactive")}</span>}
                        </div>
                        <ItemMenu actions={actionsFor("prog", p.id, p.archived, p.name, p.name_en)} />
                      </div>
                      {viewKey === pKey && (
                        <p className="text-xs text-slate-500">
                          {tx("विभाग", "Department")}: {deptNameEn(d)} · {tx("स्थिति", "Status")}: {p.archived ? tx("निष्क्रिय", "Inactive") : tx("सक्रिय", "Active")}
                        </p>
                      )}
                      {edit?.kind === "prog" && edit.id === p.id && (
                        <InlineEdit onSave={() => void saveEdit()} onCancel={() => setEdit(null)} busy={busy}>
                          <input className="field" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        <input className="field" value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} placeholder={tx("English नाम", "English name")} />
                        </InlineEdit>
                      )}
                    </div>
                  );
                })}
                {myProgs.length === 0 && <p className="text-xs text-slate-500">{tx("कार्यक्रम छैन", "No programs")}</p>}
              </div>
            </EntryRow>
          );
        })}
      </div>
    </div>
  );
}
