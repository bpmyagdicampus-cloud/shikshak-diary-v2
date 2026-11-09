import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../lib/store";
import { adIsoToBs, bsToAdIso } from "../lib/dates";

/* ------------------------------------------------------------------ */
/* नियम (SQL सँग मेल खानुपर्छ)                                          */
/* ------------------------------------------------------------------ */

export const EDIT_WINDOW_DAYS = 7;
export const MAX_LH = 12;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface BsParts {
  year: number;
  month: number;
  day: number;
}

export interface MyClassSubject {
  id: string;
  classNameNe: string;
  classNameEn: string | null;
  subjectNameNe: string;
  subjectNameEn: string | null;
  totalLh: number;
}

export interface DiaryEntry {
  id: string;
  classSubjectId: string;
  entryDate: string; // AD ISO
  lh: number;
  unit: string;
  topic: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  remarks: string;
}

export interface DiaryDraft {
  classSubjectId: string;
  bs: BsParts;
  lh: number;
  unit: string;
  topic: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  remarks: string;
}

interface CsRow {
  id: string;
  class_id: string;
  subject_id: string;
  total_lh: number;
  archived_at: string | null;
}

interface DiaryRow {
  id: string;
  class_subject_id: string;
  entry_date: string;
  lh: number | string;
  unit: string;
  topic: string;
  total_students: number;
  present_count: number;
  absent_count: number;
  remarks: string;
}

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function bsFromIso(iso: string): BsParts {
  const [y, m, d] = adIsoToBs(iso).split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** BS मिति वैध हो कि होइन: AD मा बदलेर फेरि BS मा फर्काउँदा उही आउनुपर्छ */
export function isValidBs(p: BsParts): boolean {
  try {
    const iso = bsToAdIso(p.year, p.month, p.day);
    return adIsoToBs(iso) === `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  } catch {
    return false;
  }
}

/** Edit/delete अनुमति: आजदेखि ७ दिनभित्र */
export function isEditable(entryIso: string, today: string = todayIso()): boolean {
  return entryIso <= today && entryIso >= addDaysIso(today, -EDIT_WINDOW_DAYS);
}

/* ------------------------------------------------------------------ */
/* Validation (त्रुटिको सन्देश key मा फर्काउँछ; caller ले tx गर्छ)       */
/* ------------------------------------------------------------------ */

export type DiaryErrorKey =
  | "select_class"
  | "bad_date"
  | "future_date"
  | "outside_window"
  | "bad_lh"
  | "bad_counts"
  | "bad_present";

export function validateDraft(d: DiaryDraft): DiaryErrorKey | null {
  if (!d.classSubjectId) return "select_class";
  if (!isValidBs(d.bs)) return "bad_date";
  const iso = bsToAdIso(d.bs.year, d.bs.month, d.bs.day);
  const today = todayIso();
  if (iso > today) return "future_date";
  if (!isEditable(iso, today)) return "outside_window";
  if (!Number.isFinite(d.lh) || d.lh <= 0 || d.lh > MAX_LH) return "bad_lh";
  if (d.totalStudents < 0 || d.presentCount < 0 || d.absentCount < 0) return "bad_counts";
  if (d.presentCount + d.absentCount > d.totalStudents) return "bad_present";
  return null;
}

/* ------------------------------------------------------------------ */
/* Hook: यो campus मा मेरा कक्षा-विषय र डायरी                           */
/* ------------------------------------------------------------------ */

export interface UseDiaryResult {
  classSubjects: MyClassSubject[];
  entries: DiaryEntry[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveEntry: (draft: DiaryDraft, editingId: string | null) => Promise<string | null>;
  deleteEntry: (id: string) => Promise<string | null>;
}

export function useDiary(): UseDiaryResult {
  const orgId = useAuthStore((s) => s.currentCampusId);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  const [classSubjects, setClassSubjects] = useState<MyClassSubject[]>([]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId || !userId) {
      setClassSubjects([]);
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const csRes = await supabase
        .from("class_subjects")
        .select("id,class_id,subject_id,total_lh,archived_at")
        .eq("org_id", orgId)
        .eq("teacher_user_id", userId)
        .is("archived_at", null);
      if (csRes.error) throw new Error(csRes.error.message);
      const cs = ((csRes.data ?? []) as unknown) as CsRow[];
      if (!cs.length) {
        setClassSubjects([]);
        setEntries([]);
        return;
      }

      const classIds = [...new Set(cs.map((x) => x.class_id))];
      const subjIds = [...new Set(cs.map((x) => x.subject_id))];
      const [clsRes, subRes] = await Promise.all([
        supabase.from("classes").select("id,name,name_en").in("id", classIds),
        supabase.from("subjects").select("id,name,name_en").in("id", subjIds),
      ]);
      if (clsRes.error) throw new Error(clsRes.error.message);
      if (subRes.error) throw new Error(subRes.error.message);
      const clsMap = new Map(
        ((clsRes.data ?? []) as unknown as { id: string; name: string; name_en: string | null }[]).map((c) => [c.id, c])
      );
      const subMap = new Map(
        ((subRes.data ?? []) as unknown as { id: string; name: string; name_en: string | null }[]).map((s) => [s.id, s])
      );

      setClassSubjects(
        cs.map((x) => {
          const c = clsMap.get(x.class_id);
          const s = subMap.get(x.subject_id);
          return {
            id: x.id,
            classNameNe: c?.name ?? "—",
            classNameEn: c?.name_en ?? null,
            subjectNameNe: s?.name ?? "—",
            subjectNameEn: s?.name_en ?? null,
            totalLh: x.total_lh,
          };
        })
      );

      const dRes = await supabase
        .from("diary_entries")
        .select("id,class_subject_id,entry_date,lh,unit,topic,total_students,present_count,absent_count,remarks")
        .eq("teacher_user_id", userId)
        .eq("org_id", orgId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (dRes.error) throw new Error(dRes.error.message);
      setEntries(
        (((dRes.data ?? []) as unknown) as DiaryRow[]).map((r) => ({
          id: r.id,
          classSubjectId: r.class_subject_id,
          entryDate: r.entry_date,
          lh: Number(r.lh),
          unit: r.unit,
          topic: r.topic,
          totalStudents: r.total_students,
          presentCount: r.present_count,
          absentCount: r.absent_count,
          remarks: r.remarks,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveEntry = useCallback(
    async (draft: DiaryDraft, editingId: string | null): Promise<string | null> => {
      const key = validateDraft(draft);
      if (key) return key;
      const row = {
        class_subject_id: draft.classSubjectId,
        entry_date: bsToAdIso(draft.bs.year, draft.bs.month, draft.bs.day),
        lh: draft.lh,
        unit: draft.unit.trim(),
        topic: draft.topic.trim(),
        total_students: draft.totalStudents,
        present_count: draft.presentCount,
        absent_count: draft.absentCount,
        remarks: draft.remarks.trim(),
      };
      const res = editingId
        ? await supabase.from("diary_entries").update(row).eq("id", editingId)
        : await supabase.from("diary_entries").insert({ ...row, teacher_user_id: userId });
      if (res.error) return res.error.message;
      await reload();
      return null;
    },
    [userId, reload]
  );

  const deleteEntry = useCallback(
    async (id: string): Promise<string | null> => {
      const res = await supabase.from("diary_entries").delete().eq("id", id);
      if (res.error) return res.error.message;
      await reload();
      return null;
    },
    [reload]
  );

  return { classSubjects, entries, loading, error, reload, saveEntry, deleteEntry };
}
