import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";

/* ------------------------------------------------------------------ */
/* Row types (DB schema अनुसार)                                         */
/* ------------------------------------------------------------------ */

export interface DepartmentRow {
  id: string;
  name: string;
  name_en: string | null;
}

export interface ProgramRow {
  id: string;
  name: string;
  department_id: string;
}

export interface ClassRow {
  id: string;
  name: string;
  program_id: string | null;
  academic_year_id: string;
}

export interface SectionRow {
  id: string;
  name: string;
  class_id: string;
}

export interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
  department_id: string;
}

export interface TeacherRow {
  user_id: string;
  full_name: string;
}

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface ListState<T> {
  items: T[];
  status: LoadStatus;
  errorMessage: string | null;
}

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

/** Supabase query को परिणाम; error भए throw (caller ले toast देखाउँछ) */
async function rowsOf<T>(query: PromiseLike<QueryResult>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown) as T[];
}

/**
 * सूची लोड गर्ने एकीकृत hook।
 * enabled=false भए fetch गर्दैन; deps परिवर्तनमा पुनः लोड; cleanup मा race रोक्छ।
 */
function useList<T>(enabled: boolean, deps: ReadonlyArray<unknown>, fetcher: () => Promise<T[]>): ListState<T> {
  const [state, setState] = useState<ListState<T>>({ items: [], status: "idle", errorMessage: null });

  useEffect(() => {
    if (!enabled) {
      setState({ items: [], status: "idle", errorMessage: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading", errorMessage: null }));
    fetcher()
      .then((items) => {
        if (!cancelled) setState({ items, status: "ready", errorMessage: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        toast.error(message);
        setState({ items: [], status: "error", errorMessage: message });
      });
    return () => {
      cancelled = true;
    };
    // fetcher जानाजान deps मार्फत नियन्त्रित हुन्छ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return state;
}

/* ------------------------------------------------------------------ */
/* Hierarchy hooks: Department → Program → Class → Section              */
/* ------------------------------------------------------------------ */

export function useDepartments(orgId: string | null): ListState<DepartmentRow> {
  return useList<DepartmentRow>(!!orgId, [orgId], () =>
    rowsOf<DepartmentRow>(
      supabase
        .from("departments")
        .select("id,name,name_en")
        .eq("org_id", orgId ?? "")
        .is("archived_at", null)
        .order("name")
    )
  );
}

export function usePrograms(departmentId: string | null): ListState<ProgramRow> {
  return useList<ProgramRow>(!!departmentId, [departmentId], () =>
    rowsOf<ProgramRow>(
      supabase
        .from("programs")
        .select("id,name,department_id")
        .eq("department_id", departmentId ?? "")
        .is("archived_at", null)
        .order("name")
    )
  );
}

export function useClasses(programId: string | null, academicYearId: string | null): ListState<ClassRow> {
  return useList<ClassRow>(!!programId && !!academicYearId, [programId, academicYearId], () =>
    rowsOf<ClassRow>(
      supabase
        .from("classes")
        .select("id,name,program_id,academic_year_id")
        .eq("program_id", programId ?? "")
        .eq("academic_year_id", academicYearId ?? "")
        .is("archived_at", null)
        .order("name")
    )
  );
}

export function useSections(classId: string | null): ListState<SectionRow> {
  return useList<SectionRow>(!!classId, [classId], () =>
    rowsOf<SectionRow>(
      supabase
        .from("sections")
        .select("id,name,class_id")
        .eq("class_id", classId ?? "")
        .is("archived_at", null)
        .order("name")
    )
  );
}

/* ------------------------------------------------------------------ */
/* Subject & teacher helpers                                           */
/* ------------------------------------------------------------------ */

export function useSubjects(departmentId: string | null): ListState<SubjectRow> {
  return useList<SubjectRow>(!!departmentId, [departmentId], () =>
    rowsOf<SubjectRow>(
      supabase
        .from("subjects")
        .select("id,name,code,department_id")
        .eq("department_id", departmentId ?? "")
        .is("archived_at", null)
        .order("name")
    )
  );
}

/** विभागका सक्रिय शिक्षक (नाम सहित) */
export function useTeachers(orgId: string | null, departmentId: string | null): ListState<TeacherRow> {
  return useList<TeacherRow>(!!orgId && !!departmentId, [orgId, departmentId], async () => {
    const memberships = await rowsOf<{ user_id: string }>(
      supabase
        .from("memberships")
        .select("user_id")
        .eq("org_id", orgId ?? "")
        .eq("department_id", departmentId ?? "")
        .eq("role", "teacher")
        .eq("is_active", true)
    );
    const ids = [...new Set(memberships.map((m) => m.user_id))];
    if (!ids.length) return [];
    const profiles = await rowsOf<{ id: string; full_name: string }>(
      supabase.from("profiles").select("id,full_name").in("id", ids)
    );
    return profiles.map((p) => ({ user_id: p.id, full_name: p.full_name }));
  });
}
