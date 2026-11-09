import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useSetupHierarchy } from "../hooks/useSetupHierarchy";
import { useTeachers } from "../hooks/useCampusData";
import SetupHierarchyForm from "../components/setup/SetupHierarchyForm";
import ItemMenu, { ArchivedToggle, type ItemAction } from "../components/ItemMenu";

/** सक्रिय शैक्षिक वर्षमा कक्षा-विषयको एक पंक्ति */
interface LinkRow {
  id: string;
  classId: string;
  className: string;
  classNameEn: string | null;
  subjectId: string;
  subjectName: string;
  subjectNameEn: string | null;
  subjectCode: string | null;
  departmentId: string;
  teacherId: string | null;
  teacherName: string;
  totalLh: number;
  archived: boolean;
}

interface ClassLite {
  id: string;
  name: string;
  name_en: string | null;
}

interface ClassSubjectRaw {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_user_id: string | null;
  total_lh: number;
  archived_at: string | null;
}

interface SubjectLite {
  id: string;
  name: string;
  name_en: string | null;
  code: string | null;
  department_id: string;
}

interface ProfileLite {
  id: string;
  full_name: string;
}

/** Supabase को परिणाम (unknown बाट typed array) */
function asRows<T>(data: unknown): T[] {
  return ((data ?? []) as unknown) as T[];
}

export default function Subjects() {
  const { tx, pick } = useT();
  const model = useSetupHierarchy();
  const { orgId, academicYearId } = model;

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // View / Edit state (एकपटकमा एक पंक्ति)
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTeacher, setEditTeacher] = useState("");
  const [editLh, setEditLh] = useState(0);
  const [saving, setSaving] = useState(false);

  const editRow = links.find((r) => r.id === editId) ?? null;
  const teachers = useTeachers(orgId, editRow?.departmentId ?? null);

  /** सक्रिय क्याम्पस + वर्षको कक्षा-विषय सूची (archived सहित) */
  const loadLinks = useCallback(async (campusId: string, yearId: string): Promise<LinkRow[]> => {
    const classRes = await supabase
      .from("classes")
      .select("id,name,name_en")
      .eq("org_id", campusId)
      .eq("academic_year_id", yearId);
    if (classRes.error) throw new Error(classRes.error.message);
    const classes = asRows<ClassLite>(classRes.data);
    const classIds = classes.map((c) => c.id);
    if (!classIds.length) return [];

    const linkRes = await supabase
      .from("class_subjects")
      .select("id,class_id,subject_id,teacher_user_id,total_lh,archived_at")
      .in("class_id", classIds);
    if (linkRes.error) throw new Error(linkRes.error.message);
    const raw = asRows<ClassSubjectRaw>(linkRes.data);
    if (!raw.length) return [];

    const subjectIds = [...new Set(raw.map((r) => r.subject_id))];
    const teacherIds = [...new Set(raw.map((r) => r.teacher_user_id).filter((x): x is string => !!x))];

    const subjRes = await supabase.from("subjects").select("id,name,name_en,code,department_id").in("id", subjectIds);
    if (subjRes.error) throw new Error(subjRes.error.message);
    const subjects = new Map(asRows<SubjectLite>(subjRes.data).map((s) => [s.id, s]));

    const teacherMap = new Map<string, string>();
    if (teacherIds.length) {
      const profRes = await supabase.from("profiles").select("id,full_name").in("id", teacherIds);
      if (profRes.error) throw new Error(profRes.error.message);
      asRows<ProfileLite>(profRes.data).forEach((p) => teacherMap.set(p.id, p.full_name));
    }

    const classMap = new Map(classes.map((c) => [c.id, c]));
    return raw
      .map((r) => {
        const subj = subjects.get(r.subject_id);
        return {
          id: r.id,
          classId: r.class_id,
          className: classMap.get(r.class_id)?.name ?? "—",
          classNameEn: classMap.get(r.class_id)?.name_en ?? null,
          subjectId: r.subject_id,
          subjectName: subj?.name ?? "—",
          subjectNameEn: subj?.name_en ?? null,
          subjectCode: subj?.code ?? null,
          departmentId: subj?.department_id ?? "",
          teacherId: r.teacher_user_id,
          teacherName: r.teacher_user_id ? teacherMap.get(r.teacher_user_id) ?? "—" : tx("पछि तोकिने", "Unassigned"),
          totalLh: r.total_lh,
          archived: r.archived_at !== null,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName));
  }, [tx]);

  const refresh = useCallback(async () => {
    if (!orgId || !academicYearId) {
      setLinks([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setLinks(await loadLinks(orgId, academicYearId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [orgId, academicYearId, loadLinks]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Form submit सकिएपछि सूची पुनः लोड
  const wasSubmitting = useRef(false);
  useEffect(() => {
    if (wasSubmitting.current && !model.submitting) void refresh();
    wasSubmitting.current = model.submitting;
  }, [model.submitting, refresh]);

  const openEdit = (row: LinkRow) => {
    setViewId(null);
    setEditId(row.id);
    setEditTeacher(row.teacherId ?? "");
    setEditLh(row.totalLh);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    if (editLh < 0 || !Number.isFinite(editLh)) {
      toast.error(tx("कुल LH सही हुनुपर्छ", "Total LH must be a valid number"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("class_subjects")
        .update({ teacher_user_id: editTeacher || null, total_lh: editLh })
        .eq("id", editRow.id);
      if (error) throw new Error(error.message);
      toast.success(tx("सेभ भयो", "Saved"));
      setEditId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  /** निष्क्रिय (archive) / सक्रिय (restore) — डाटा मेटिँदैन */
  const toggleActive = async (row: LinkRow) => {
    try {
      const { error } = await supabase
        .from("class_subjects")
        .update({ archived_at: row.archived ? null : new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      toast.success(row.archived ? tx("सक्रिय गरियो", "Activated") : tx("निष्क्रिय गरियो", "Deactivated"));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
  };

  /** स्थायी मेटाउने — प्रयोगमा भए database ले रोक्छ */
  const removeRow = async (row: LinkRow) => {
    if (!confirm(tx("यो कक्षा-विषय स्थायी रूपमा हटाउने?", "Permanently delete this class-subject?"))) return;
    try {
      const { error } = await supabase.from("class_subjects").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      toast.success(tx("हटाइयो", "Deleted"));
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const actionsFor = (row: LinkRow): ItemAction[] => [
    { label: tx("हेर्नुहोस्", "View"), onClick: () => { setEditId(null); setViewId(viewId === row.id ? null : row.id); } },
    { label: tx("सम्पादन", "Edit"), onClick: () => openEdit(row) },
    {
      label: row.archived ? tx("सक्रिय गर्नुहोस्", "Activate") : tx("निष्क्रिय गर्नुहोस्", "Deactivate"),
      onClick: () => void toggleActive(row),
    },
    { label: tx("मेटाउनुहोस्", "Delete"), onClick: () => void removeRow(row), danger: true },
  ];

  const visible = links.filter((r) => showArchived || !r.archived);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tx("विषय", "Subjects")}</h1>

      {!orgId && <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>}
      {orgId && !academicYearId && (
        <p className="text-sm text-amber-700">
          {tx("सक्रिय शैक्षिक वर्ष छैन। पहिले शैक्षिक वर्षमा एउटा सक्रिय वर्ष बनाउनुहोस्।", "No active academic year. Create and activate one first.")}
        </p>
      )}

      {orgId && <SetupHierarchyForm model={model} />}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{tx("यो वर्षका कक्षा-विषय", "Class-subjects this year")}</h2>
          <ArchivedToggle value={showArchived} onChange={setShowArchived} />
        </div>

        {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {!loading && !loadError && orgId && academicYearId && visible.length === 0 && (
          <p className="text-sm text-slate-500">{tx("कुनै कक्षा-विषय छैन।", "No class-subjects yet.")}</p>
        )}

        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className={`card space-y-3 ${row.archived ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {pick(row.subjectName, row.subjectNameEn)}
                    {row.archived && (
                      <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs">{tx("निष्क्रिय", "Inactive")}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {pick(row.className, row.classNameEn)} · {tx("शिक्षक", "Teacher")}: {row.teacherName} · LH: {row.totalLh}
                  </div>
                </div>
                <ItemMenu actions={actionsFor(row)} />
              </div>

              {viewId === row.id && (
                <dl className="grid gap-2 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-500">{tx("विषय", "Subject")}</dt><dd>{pick(row.subjectName, row.subjectNameEn)}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("कोड", "Code")}</dt><dd>{row.subjectCode ?? "—"}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("कक्षा", "Class")}</dt><dd>{pick(row.className, row.classNameEn)}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("शिक्षक", "Teacher")}</dt><dd>{row.teacherName}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("कुल LH", "Total LH")}</dt><dd>{row.totalLh}</dd></div>
                  <div><dt className="text-xs text-slate-500">{tx("स्थिति", "Status")}</dt><dd>{row.archived ? tx("निष्क्रिय", "Inactive") : tx("सक्रिय", "Active")}</dd></div>
                </dl>
              )}

              {editId === row.id && editRow && (
                <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">{tx("शिक्षक", "Teacher")}</span>
                    <select className="field" value={editTeacher} onChange={(e) => setEditTeacher(e.target.value)} disabled={teachers.status === "loading"}>
                      <option value="">{tx("पछि तोक्नुहोस्", "Assign later")}</option>
                      {teachers.items.map((t) => (
                        <option key={t.user_id} value={t.user_id}>{t.full_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">{tx("कुल LH", "Total LH")}</span>
                    <input className="field" type="number" min={0} value={editLh} onChange={(e) => setEditLh(Number(e.target.value))} />
                  </label>
                  <div className="flex items-end gap-2">
                    <button className="btn" disabled={saving} onClick={() => void saveEdit()}>
                      {saving ? tx("सेभ हुँदैछ…", "Saving…") : tx("सेभ गर्नुहोस्", "Save")}
                    </button>
                    <button className="btn-ghost" onClick={() => setEditId(null)}>{tx("रद्द", "Cancel")}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
