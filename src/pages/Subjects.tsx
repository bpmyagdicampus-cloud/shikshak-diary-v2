import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { useSetupHierarchy } from "../hooks/useSetupHierarchy";
import SetupHierarchyForm from "../components/setup/SetupHierarchyForm";

/** सक्रिय शैक्षिक वर्षमा कक्षा-विषयको सूचीको एक पंक्ति */
interface LinkRow {
  id: string;
  className: string;
  subjectName: string;
  teacherName: string;
  totalLh: number;
}

interface ClassLite {
  id: string;
  name: string;
}

interface ClassSubjectRaw {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_user_id: string | null;
  total_lh: number;
}

interface NameRow {
  id: string;
  name: string;
}

/** Supabase को परिणाम (unknown बाट typed array) */
function asRows<T>(data: unknown): T[] {
  return ((data ?? []) as unknown) as T[];
}

export default function Subjects() {
  const { tx } = useT();
  const model = useSetupHierarchy();
  const { orgId, academicYearId } = model;

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** सक्रिय क्याम्पस + वर्षको कक्षा-विषय सूची */
  const loadLinks = useCallback(async (campusId: string, yearId: string): Promise<LinkRow[]> => {
    const classRes = await supabase
      .from("classes")
      .select("id,name")
      .eq("org_id", campusId)
      .eq("academic_year_id", yearId)
      .is("archived_at", null);
    if (classRes.error) throw new Error(classRes.error.message);
    const classes = asRows<ClassLite>(classRes.data);
    const classIds = classes.map((c) => c.id);
    if (!classIds.length) return [];

    const linkRes = await supabase
      .from("class_subjects")
      .select("id,class_id,subject_id,teacher_user_id,total_lh")
      .in("class_id", classIds);
    if (linkRes.error) throw new Error(linkRes.error.message);
    const raw = asRows<ClassSubjectRaw>(linkRes.data);
    if (!raw.length) return [];

    const subjectIds = [...new Set(raw.map((r) => r.subject_id))];
    const teacherIds = [...new Set(raw.map((r) => r.teacher_user_id).filter((x): x is string => !!x))];

    const subjRes = await supabase.from("subjects").select("id,name").in("id", subjectIds);
    if (subjRes.error) throw new Error(subjRes.error.message);
    const subjects = new Map(asRows<NameRow>(subjRes.data).map((s) => [s.id, s.name]));

    const teacherMap = new Map<string, string>();
    if (teacherIds.length) {
      const profRes = await supabase.from("profiles").select("id,full_name").in("id", teacherIds);
      if (profRes.error) throw new Error(profRes.error.message);
      asRows<NameRow>(profRes.data).forEach((p) => teacherMap.set(p.id, p.name));
    }

    const classMap = new Map(classes.map((c) => [c.id, c.name]));
    return raw
      .map((r) => ({
        id: r.id,
        className: classMap.get(r.class_id) ?? "—",
        subjectName: subjects.get(r.subject_id) ?? "—",
        teacherName: r.teacher_user_id ? teacherMap.get(r.teacher_user_id) ?? "—" : tx("पछि तोकिने", "Unassigned"),
        totalLh: r.total_lh,
      }))
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

  // Form submit सकिएपछि (submitting true→false) सूची पुनः लोड
  const wasSubmitting = useRef(false);
  useEffect(() => {
    if (wasSubmitting.current && !model.submitting) void refresh();
    wasSubmitting.current = model.submitting;
  }, [model.submitting, refresh]);

  const removeLink = async (row: LinkRow) => {
    if (!confirm(tx("यो कक्षा-विषय हटाउने?", "Remove this class-subject link?"))) return;
    try {
      const { error } = await supabase.from("class_subjects").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
      toast.success(tx("हटाइयो", "Removed"));
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{tx("विषय", "Subjects")}</h1>

      {!orgId && (
        <p className="text-sm text-slate-500">{tx("क्याम्पस छनोट गर्नुहोस्।", "Select a campus.")}</p>
      )}
      {orgId && !academicYearId && (
        <p className="text-sm text-amber-700">
          {tx("सक्रिय शैक्षिक वर्ष छैन। पहिले शैक्षिक वर्षमा एउटा सक्रिय वर्ष बनाउनुहोस्।", "No active academic year. Create and activate one first.")}
        </p>
      )}

      {orgId && <SetupHierarchyForm model={model} />}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tx("यो वर्षका कक्षा-विषय", "Class-subjects this year")}</h2>

        {loading && <p className="text-sm text-slate-500">{tx("लोड हुँदैछ…", "Loading…")}</p>}
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {!loading && !loadError && orgId && academicYearId && links.length === 0 && (
          <p className="text-sm text-slate-500">{tx("कुनै कक्षा-विषय छैन।", "No class-subjects yet.")}</p>
        )}

        <div className="space-y-2">
          {links.map((row) => (
            <div key={row.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{row.subjectName}</div>
                <div className="text-xs text-slate-500">
                  {row.className} · {tx("शिक्षक", "Teacher")}: {row.teacherName} · LH: {row.totalLh}
                </div>
              </div>
              <button className="btn-ghost text-xs text-red-600" onClick={() => void removeLink(row)}>
                {tx("हटाउनुहोस्", "Remove")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
