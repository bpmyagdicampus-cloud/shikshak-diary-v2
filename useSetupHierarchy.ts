import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../lib/store";
import { useT } from "../lib/i18n";
import {
  useDepartments,
  usePrograms,
  useClasses,
  useSections,
  useSubjects,
  useTeachers,
  type ListState,
  type DepartmentRow,
  type ProgramRow,
  type ClassRow,
  type SectionRow,
  type SubjectRow,
  type TeacherRow,
} from "./useCampusData";

/** Form को मान (सबै string/number; अनिर्णीत भए खाली) */
export interface SetupHierarchyValues {
  departmentId: string;
  programId: string;
  classId: string;
  sectionId: string;
  /** मौजुदा विषय छनोट गर्दा */
  subjectId: string;
  /** नयाँ विषय बनाउँदा (भरिएमा subjectId लाई पन्छाउँछ) */
  newSubjectName: string;
  newSubjectNameEn: string;
  newSubjectCode: string;
  teacherId: string;
  totalLh: number;
}

export interface SetupHierarchyResult {
  orgId: string | null;
  academicYearId: string | null;
  values: SetupHierarchyValues;
  setDepartment: (id: string) => void;
  setProgram: (id: string) => void;
  setClass: (id: string) => void;
  setSection: (id: string) => void;
  setSubject: (id: string) => void;
  setField: <K extends "newSubjectName" | "newSubjectNameEn" | "newSubjectCode" | "teacherId" | "totalLh">(
    key: K,
    value: SetupHierarchyValues[K]
  ) => void;
  departments: ListState<DepartmentRow>;
  programs: ListState<ProgramRow>;
  classes: ListState<ClassRow>;
  sections: ListState<SectionRow>;
  subjects: ListState<SubjectRow>;
  teachers: ListState<TeacherRow>;
  submitting: boolean;
  submit: () => Promise<boolean>;
}

const EMPTY: SetupHierarchyValues = {
  departmentId: "",
  programId: "",
  classId: "",
  sectionId: "",
  subjectId: "",
  newSubjectName: "",
  newSubjectNameEn: "",
  newSubjectCode: "",
  teacherId: "",
  totalLh: 0,
};

/** सक्रिय क्याम्पसको सक्रिय शैक्षिक वर्ष */
function useActiveAcademicYear(orgId: string | null): string | null {
  const [yearId, setYearId] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setYearId(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("academic_years")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .is("archived_at", null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(error.message);
          setYearId(null);
          return;
        }
        setYearId((data as { id: string } | null)?.id ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return yearId;
}

/**
 * Setup form को सम्पूर्ण logic: dependent dropdowns, loading/empty states, र submit।
 * UI component ले यसको परिणाम मात्र देखाउँछ।
 */
export function useSetupHierarchy(): SetupHierarchyResult {
  const { tx } = useT();
  const orgId = useAuthStore((s) => s.currentCampusId);
  const academicYearId = useActiveAcademicYear(orgId);
  const [values, setValues] = useState<SetupHierarchyValues>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const departments = useDepartments(orgId);
  const programs = usePrograms(values.departmentId || null);
  const classes = useClasses(values.programId || null, academicYearId);
  const sections = useSections(values.classId || null);
  const subjects = useSubjects(values.departmentId || null);
  const teachers = useTeachers(orgId, values.departmentId || null);

  // माथिल्लो level बदलिँदा तल्लो सबै चयन रिसेट (गलत जोडी रोक्न)
  const setDepartment = useCallback((id: string) => {
    setValues((v) => ({ ...v, departmentId: id, programId: "", classId: "", sectionId: "", subjectId: "", teacherId: "" }));
  }, []);
  const setProgram = useCallback((id: string) => {
    setValues((v) => ({ ...v, programId: id, classId: "", sectionId: "" }));
  }, []);
  const setClass = useCallback((id: string) => {
    setValues((v) => ({ ...v, classId: id, sectionId: "" }));
  }, []);
  const setSection = useCallback((id: string) => {
    setValues((v) => ({ ...v, sectionId: id }));
  }, []);
  const setSubject = useCallback((id: string) => {
    setValues((v) => ({ ...v, subjectId: id, newSubjectName: "", newSubjectNameEn: "", newSubjectCode: "" }));
  }, []);
  const setField = useCallback(
    <K extends "newSubjectName" | "newSubjectNameEn" | "newSubjectCode" | "teacherId" | "totalLh">(key: K, value: SetupHierarchyValues[K]) => {
      setValues((v) => ({ ...v, [key]: value }));
    },
    []
  );

  /** Validation + DB writes (नयाँ विषय बनाउने → class_subjects मा जोड्ने) */
  const submit = useCallback(async (): Promise<boolean> => {
    if (!orgId) {
      toast.error(tx("क्याम्पस छनोट गर्नुहोस्", "Select a campus"));
      return false;
    }
    if (!values.departmentId || !values.classId) {
      toast.error(tx("विभाग र कक्षा छनोट गर्नुहोस्", "Select department and class"));
      return false;
    }
    const creatingNew = values.newSubjectName.trim().length > 0;
    if (!creatingNew && !values.subjectId) {
      toast.error(tx("विषय छनोट गर्नुहोस् वा नयाँ नाम लेख्नुहोस्", "Select or enter a subject"));
      return false;
    }
    if (values.totalLh < 0 || !Number.isFinite(values.totalLh)) {
      toast.error(tx("कुल LH सही हुनुपर्छ", "Total LH must be a valid number"));
      return false;
    }

    setSubmitting(true);
    try {
      let subjectId = values.subjectId;

      if (creatingNew) {
        const { data, error } = await supabase
          .from("subjects")
          .insert({
            org_id: orgId,
            department_id: values.departmentId,
            name: values.newSubjectName.trim(),
            name_en: values.newSubjectNameEn.trim() || null,
            code: values.newSubjectCode.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        subjectId = (data as { id: string }).id;
      }

      const { error: linkErr } = await supabase.from("class_subjects").insert({
        class_id: values.classId,
        subject_id: subjectId,
        teacher_user_id: values.teacherId || null,
        total_lh: values.totalLh,
      });
      if (linkErr) throw new Error(linkErr.message);

      toast.success(tx("विषय सफलतापूर्वक थपियो", "Subject added"));
      setValues((v) => ({ ...v, subjectId: "", newSubjectName: "", newSubjectNameEn: "", newSubjectCode: "", teacherId: "", totalLh: 0 }));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(message);
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [orgId, values, tx]);

  return {
    orgId,
    academicYearId,
    values,
    setDepartment,
    setProgram,
    setClass,
    setSection,
    setSubject,
    setField,
    departments,
    programs,
    classes,
    sections,
    subjects,
    teachers,
    submitting,
    submit,
  };
}
