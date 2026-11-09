import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useAuthStore } from "../lib/store";
import { asRows, writeOp } from "../lib/crud";
import ItemMenu, { ArchivedToggle, type ItemAction } from "../components/ItemMenu";
import EntryRow, { InlineEdit } from "../components/EntryRow";

interface DeptLite {
  id: string;
  name: string;
  name_en: string | null;
}

interface ProgLite {
  id: string;
  name: string;
  name_en: string | null;
  department_id: string;
}

interface ClassRow {
  id: string;
  name: string;
  name_en: string | null;
  department_id: string;
  program_id: string | null;
  archived: boolean;
}

interface SectionRow {
  id: string;
  name: string;
  class_id: string;
  archived: boolean;
}

interface RawClass {
  id: string;
  name: string;
  name_en: string | null;
  department_id: string;
  program_id: string | null;
  archived_at: string | null;
}

interface RawSection {
  id: string;
  name: string;
  class_id: string;
  archived_at: string | null;
}

type Kind = "class" | "section";

export default function Classes() {
  const { tx, pick } = useT();
  const orgId = useAuthStore((s) => s.currentCampusId);

  const [yearId, setYearId] = useState<string | null>(null);
  const [depts, setDepts] = useState<DeptLite[]>([]);
  const [progs, setProgs] = useState<ProgLite[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newDept, setNewDept] = useState("");
  const [newProg, setNewProg] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newClassNameEn, setNewClassNameEn] = useState("");
  const [editNameEn, setEditNameEn] = useState("");
  const [newSectionFor, setNewSectionFor] = useState<Record<string, string>>({});

  const [viewKey, setViewKey] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ kind: Kind; id: string } | null>(null);
  const [editName, setEditName] = useState("");

  const refresh = useCallback(async () => {
    if (!orgId) {
      setYearId(null);
      setClasses([]);
      setSections([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [yr, d, p] = await Promise.all([
        supabase.from("academic_years").select("id").eq("org_id", orgId).eq("is_active", true).is("archived_at", null).maybeSingle(),
        supabase.from("departments").select("id,name,name_en").eq("org_id", orgId).is("archived_at", null).order("name"),
        supabase.from("programs").select("id,name,name_en,department_id").eq("org_id", orgId).is("archived_at", null).order("name"),
      ]);
      if (yr.error) throw new Error(yr.error.message);
      if (d.error) throw new Error(d.error.message);
      if (p.error) throw new Error(p.error.message);
      const activeYear = (yr.data as { id: string } | null)?.id ?? null;
      setYearId(activeYear);
      setDepts(asRows<DeptLite>(d.data));
      setProgs(asRows<ProgLite>(p.data));

      if (!activeYear) {
        setClasses([]);
        setSections([]);
        return;
      }

      const cRes = await supabase
        .from("classes")
        .select("id,name,name_en,department_id,program_id,archived_at")
        .eq("org_id", orgId)
        .eq("academic_year_id", activeYear)
        .order("name");
      if (cRes.error) throw new Error(cRes.error.message);
      const rawClasses = asRows<RawClass>(cRes.data);
      setClasses(
        rawClasses.map((c) => ({
          id: c.id,
          name: c.name,
          name_en: c.name_en,
          department_id: c.department_id,
          program_id: c.program_id,
          archived: c.archived_at !== null,
        }))
      );

      const classIds = rawClasses.map((c) => c.id);
      if (!classIds.length) {
        setSections([]);
        return;
      }
      const sRes = await supabase.from("sections").select("id,name,class_id,archived_at").in("class_id", classIds).order("name");
      if (sRes.error) throw new Error(sRes.error.message);
      setSections(
        asRows<RawSection>(sRes.data).map((s) => ({
          id: s.id,
          name: s.name,
          class_id: s.class_id,
          archived: s.archived_at !== null,
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

  const deptLabel = (id: string) => {
    const d = depts.find((x) => x.id === id);
    return d ? pick(d.name, d.name_en) : "—";
  };
  const progLabel = (id: string | null) => progs.find((p) => p.id === id)?.name ?? "—";
  const table = (kind: Kind) => (kind === "class" ? "classes" : "sections");

  const createClass = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId || !yearId || !newDept || !newClassName.trim()) return;
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase.from("classes").insert({
          org_id: orgId,
          academic_year_id: yearId,
          department_id: newDept,
          program_id: newProg || null,
          name: newClassName.trim(),
          name_en: newClassNameEn.trim() || null,
        }),
      tx("कक्षा थपियो", "Class added")
    );
    setBusy(false);
    if (ok) {
      setNewClassName("");
      setNewClassNameEn("");
      await refresh();
    }
  };

  const createSection = async (classId: string) => {
    const name = (newSectionFor[classId] ?? "").trim();
    if (!name) return;
    setBusy(true);
    const ok = await writeOp(() => supabase.from("sections").insert({ class_id: classId, name }), tx("सेक्सन थपियो", "Section added"));
    setBusy(false);
    if (ok) {
      setNewSectionFor({ ...newSectionFor, [classId]: "" });
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
    if (!edit || !editName.trim()) return;
    setBusy(true);
    const ok = await writeOp(
      () =>
        supabase
          .from(table(edit.kind))
          .update(edit.kind === "class" ? { name: editName.trim(), name_en: editNameEn.trim() || null } : { name: editName.trim() })
          .eq("id", edit.id),
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
      () => supabase.from(table(kind)).update({ archived_at: archived ? null : new Date().toISOString() }).eq("id", id),
      archived ? tx("सक्रिय गरियो", "Activated") : tx("निष्क्रिय गरियो", "Deactivated")
    );
    setBusy(false);
    await refresh();
  };

  const remove = async (kind: Kind, id: string) => {
    if (!confirm(tx("स्थायी रूपमा मेटाउने?", "Permanently delete?"))) return;
    setBusy(true);
    await writeOp(() => supabase.from(table(kind)).delete().eq("id", id), tx("मेटियो", "Deleted"));
    setBusy(false);
    await refresh();
  };

  const actionsFor = (kind: Kind, id: string, archived: boolean, name: string, nameEn: string | null): ItemAction[] => {
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

  const visibleClasses = classes.filter((c) => showArchived || !c.archived);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tx("कक्षा र सेक्सन", "Classes & Sections")}</h1>
        <ArchivedToggle value={showArchived} onChange={setShowArchived} />
      </div>

      {!orgId && <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>}
      {orgId && !yearId && (
        <p className="text-sm text-amber-700">{tx("सक्रिय शैक्षिक वर्ष छैन।", "No active academic year.")}</p>
      )}
      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {orgId && yearId && (
        <form onSubmit={createClass} className="card grid gap-3 sm:grid-cols-4">
          <select className="field" required value={newDept} onChange={(e) => { setNewDept(e.target.value); setNewProg(""); }}>
            <option value="">{tx("विभाग छान्नुहोस्", "Select department")}</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{pick(d.name, d.name_en)}</option>)}
          </select>
          <select className="field" value={newProg} onChange={(e) => setNewProg(e.target.value)} disabled={!newDept}>
            <option value="">{tx("कार्यक्रम (वैकल्पिक)", "Program (optional)")}</option>
            {progs.filter((p) => p.department_id === newDept).map((p) => <option key={p.id} value={p.id}>{pick(p.name, p.name_en)}</option>)}
          </select>
          <input className="field" required placeholder={tx("कक्षा (जस्तै MBS III)", "Class (e.g. MBS III)")} value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
          <input className="field" placeholder={tx("English नाम (वैकल्पिक)", "English name (optional)")} value={newClassNameEn} onChange={(e) => setNewClassNameEn(e.target.value)} />
          <button className="btn" disabled={busy}>{tx("कक्षा थप्नुहोस्", "Add class")}</button>
        </form>
      )}

      {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}

      <div className="space-y-4">
        {visibleClasses.map((c) => {
          const key = `class:${c.id}`;
          const mySections = sections.filter((s) => s.class_id === c.id && (showArchived || !s.archived));
          return (
            <EntryRow key={c.id} title={pick(c.name, c.name_en)} archived={c.archived} actions={actionsFor("class", c.id, c.archived, c.name, c.name_en)}>
              {viewKey === key && (
                <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">{tx("विभाग", "Department")}</dt><dd>{deptLabel(c.department_id)}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("कार्यक्रम", "Program")}</dt><dd>{progLabel(c.program_id)}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("सेक्सन संख्या", "Sections")}</dt><dd>{mySections.length}</dd></div>
                </dl>
              )}

              {edit?.kind === "class" && edit.id === c.id && (
                <InlineEdit onSave={() => void saveEdit()} onCancel={() => setEdit(null)} busy={busy}>
                  <input className="field" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className="field" value={editNameEn} onChange={(e) => setEditNameEn(e.target.value)} placeholder={tx("English नाम", "English name")} />
                </InlineEdit>
              )}

              <div className="space-y-2 pl-3">
                {mySections.map((s) => {
                  const sKey = `section:${s.id}`;
                  return (
                    <div key={s.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm">
                          {tx("सेक्सन", "Section")} {s.name}
                          {s.archived && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs">{tx("निष्क्रिय", "Inactive")}</span>}
                        </div>
                        <ItemMenu actions={actionsFor("section", s.id, s.archived, s.name, null)} />
                      </div>
                      {viewKey === sKey && (
                        <p className="text-xs text-slate-500">
                          {tx("कक्षा", "Class")}: {c.name} · {tx("स्थिति", "Status")}: {s.archived ? tx("निष्क्रिय", "Inactive") : tx("सक्रिय", "Active")}
                        </p>
                      )}
                      {edit?.kind === "section" && edit.id === s.id && (
                        <InlineEdit onSave={() => void saveEdit()} onCancel={() => setEdit(null)} busy={busy}>
                          <input className="field" value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </InlineEdit>
                      )}
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-1">
                  <input
                    className="field max-w-[12rem]"
                    placeholder={tx("नयाँ सेक्सन (A, B…)", "New section (A, B…)")}
                    value={newSectionFor[c.id] ?? ""}
                    onChange={(e) => setNewSectionFor({ ...newSectionFor, [c.id]: e.target.value })}
                  />
                  <button className="btn-ghost text-sm" disabled={busy} onClick={() => void createSection(c.id)}>
                    {tx("सेक्सन थप्नुहोस्", "Add section")}
                  </button>
                </div>
              </div>
            </EntryRow>
          );
        })}
      </div>
    </div>
  );
}
