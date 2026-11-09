import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../lib/store";

export type PlanStatus = "draft" | "submitted" | "approved";

export interface MyClassSubject {
  id: string;
  classNameNe: string;
  classNameEn: string | null;
  subjectNameNe: string;
  subjectNameEn: string | null;
  totalLh: number;
}

export interface UnitRow {
  id: string;
  classSubjectId: string;
  unitNo: number;
  title: string;
  topics: string;
  plannedLh: number;
  startDate: string | null;
  endDate: string | null;
  methods: string;
  materials: string;
  assessment: string;
  status: PlanStatus;
  teacherUserId: string | null;
}

export interface LessonRow {
  id: string;
  classSubjectId: string;
  unitId: string | null;
  planDate: string;
  lh: number;
  title: string;
  objectives: string;
  steps: string[];
  resources: string;
  assessment: string;
  status: PlanStatus;
  teacherUserId: string;
}

export interface UnitDraft {
  unitNo: number;
  title: string;
  topics: string;
  plannedLh: number;
  startDate: string;
  endDate: string;
  methods: string;
  materials: string;
  assessment: string;
}

export interface LessonDraft {
  unitId: string;
  planDate: string;
  lh: number;
  title: string;
  objectives: string;
  steps: string;
  resources: string;
  assessment: string;
}

interface CsRow {
  id: string;
  class_id: string;
  subject_id: string;
  total_lh: number;
}

interface UnitDb {
  id: string;
  class_subject_id: string;
  unit_no: number;
  title: string;
  topics: string;
  planned_lh: number | string;
  start_date: string | null;
  end_date: string | null;
  methods: string;
  materials: string;
  assessment: string;
  status: PlanStatus;
}

interface LessonDb {
  id: string;
  class_subject_id: string;
  unit_id: string | null;
  plan_date: string;
  lh: number | string;
  title: string;
  objectives: string;
  steps: unknown;
  resources: string;
  assessment: string;
  status: PlanStatus;
  teacher_user_id: string;
}

const NUMERIC_MIN = 0;
const LH_MAX = 12;

/** शिक्षकको आफ्ना कक्षा-विषय (यो campus मा) */
export function useMyClassSubjectsForPlan(): { items: MyClassSubject[]; error: string | null } {
  const orgId = useAuthStore((s) => s.currentCampusId);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const [items, setItems] = useState<MyClassSubject[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !userId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cs = await supabase
          .from("class_subjects")
          .select("id,class_id,subject_id,total_lh")
          .eq("org_id", orgId)
          .eq("teacher_user_id", userId)
          .is("archived_at", null);
        if (cs.error) throw new Error(cs.error.message);
        const rows = ((cs.data ?? []) as unknown) as CsRow[];
        if (!rows.length) {
          if (!cancelled) setItems([]);
          return;
        }
        const [cl, sj] = await Promise.all([
          supabase.from("classes").select("id,name,name_en").in("id", [...new Set(rows.map((r) => r.class_id))]),
          supabase.from("subjects").select("id,name,name_en").in("id", [...new Set(rows.map((r) => r.subject_id))]),
        ]);
        if (cl.error) throw new Error(cl.error.message);
        if (sj.error) throw new Error(sj.error.message);
        const cMap = new Map(((cl.data ?? []) as unknown as { id: string; name: string; name_en: string | null }[]).map((c) => [c.id, c]));
        const sMap = new Map(((sj.data ?? []) as unknown as { id: string; name: string; name_en: string | null }[]).map((s) => [s.id, s]));
        if (!cancelled) {
          setItems(
            rows.map((r) => {
              const c = cMap.get(r.class_id);
              const s = sMap.get(r.subject_id);
              return {
                id: r.id,
                classNameNe: c?.name ?? "—",
                classNameEn: c?.name_en ?? null,
                subjectNameNe: s?.name ?? "—",
                subjectNameEn: s?.name_en ?? null,
                totalLh: r.total_lh,
              };
            })
          );
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId]);

  return { items, error };
}

/** कक्षा-विषयका एकाइ र पाठ योजना */
export function usePlanning(classSubjectId: string | null) {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!classSubjectId) {
      setUnits([]);
      setLessons([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [u, l] = await Promise.all([
        supabase.from("course_units").select("*").eq("class_subject_id", classSubjectId).is("archived_at", null).order("unit_no"),
        supabase.from("lesson_plans").select("*").eq("class_subject_id", classSubjectId).order("plan_date", { ascending: false }),
      ]);
      if (u.error) throw new Error(u.error.message);
      if (l.error) throw new Error(l.error.message);
      setUnits(
        ((u.data ?? []) as unknown as UnitDb[]).map((x) => ({
          id: x.id,
          classSubjectId: x.class_subject_id,
          unitNo: x.unit_no,
          title: x.title,
          topics: x.topics,
          plannedLh: Number(x.planned_lh),
          startDate: x.start_date,
          endDate: x.end_date,
          methods: x.methods,
          materials: x.materials,
          assessment: x.assessment,
          status: x.status,
          teacherUserId: null,
        }))
      );
      setLessons(
        ((l.data ?? []) as unknown as LessonDb[]).map((x) => ({
          id: x.id,
          classSubjectId: x.class_subject_id,
          unitId: x.unit_id,
          planDate: x.plan_date,
          lh: Number(x.lh),
          title: x.title,
          objectives: x.objectives,
          steps: Array.isArray(x.steps) ? (x.steps as unknown[]).map((s) => String(s)) : [],
          resources: x.resources,
          assessment: x.assessment,
          status: x.status,
          teacherUserId: x.teacher_user_id,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [classSubjectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** एकाइ: बचत (नयाँ वा सम्पादन). त्रुटि भए सन्देश फर्काउँछ */
  const saveUnit = async (d: UnitDraft, id: string | null): Promise<string | null> => {
    if (!classSubjectId) return "select_class";
    if (!d.title.trim()) return "title_required";
    if (!Number.isFinite(d.plannedLh) || d.plannedLh < NUMERIC_MIN) return "bad_lh";
    if (d.startDate && d.endDate && d.endDate < d.startDate) return "bad_dates";
    const row = {
      unit_no: d.unitNo,
      title: d.title.trim(),
      topics: d.topics.trim(),
      planned_lh: d.plannedLh,
      start_date: d.startDate || null,
      end_date: d.endDate || null,
      methods: d.methods.trim(),
      materials: d.materials.trim(),
      assessment: d.assessment.trim(),
    };
    const res = id
      ? await supabase.from("course_units").update(row).eq("id", id)
      : await supabase.from("course_units").insert({ ...row, class_subject_id: classSubjectId });
    if (res.error) return res.error.message;
    await reload();
    return null;
  };

  /** पाठ योजना: बचत */
  const saveLesson = async (d: LessonDraft, id: string | null): Promise<string | null> => {
    if (!classSubjectId || !userId) return "select_class";
    if (!d.title.trim()) return "title_required";
    if (!d.planDate) return "bad_date";
    if (!Number.isFinite(d.lh) || d.lh <= 0 || d.lh > LH_MAX) return "bad_lh";
    const steps = d.steps
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    const row = {
      unit_id: d.unitId || null,
      plan_date: d.planDate,
      lh: d.lh,
      title: d.title.trim(),
      objectives: d.objectives.trim(),
      steps,
      resources: d.resources.trim(),
      assessment: d.assessment.trim(),
    };
    const res = id
      ? await supabase.from("lesson_plans").update(row).eq("id", id)
      : await supabase.from("lesson_plans").insert({ ...row, class_subject_id: classSubjectId, teacher_user_id: userId });
    if (res.error) return res.error.message;
    await reload();
    return null;
  };

  /** स्थिति परिवर्तन: draft ↔ submitted (शिक्षक), approved (विभाग प्रमुख) */
  const setStatus = async (table: "course_units" | "lesson_plans", id: string, status: PlanStatus): Promise<string | null> => {
    const extra = status === "approved" ? { approved_at: new Date().toISOString(), approved_by: userId } : {};
    const res = await supabase.from(table).update({ status, ...extra }).eq("id", id);
    if (res.error) return res.error.message;
    await reload();
    return null;
  };

  const remove = async (table: "course_units" | "lesson_plans", id: string): Promise<string | null> => {
    const res = await supabase.from(table).delete().eq("id", id);
    if (res.error) return res.error.message;
    await reload();
    return null;
  };

  return { units, lessons, loading, error, reload, saveUnit, saveLesson, setStatus, remove, userId };
}
