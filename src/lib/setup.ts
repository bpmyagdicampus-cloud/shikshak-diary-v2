import { supabase } from "./supabase";

/**
 * सबै सेटअप तालिकाका लागि साझा कार्य।
 * Archive = archived_at सेट (मेटाउँदैन, इतिहास रहन्छ)।
 * Delete = database trigger ले प्रयोगमा भएको रेकर्ड रोक्छ; सन्देश फिर्ता आउँछ।
 */
export type SetupTable =
  | "departments" | "programs" | "academic_years" | "classes"
  | "sections" | "subjects" | "class_subjects";

export async function setArchived(table: SetupTable, id: string, archive: boolean): Promise<string | null> {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id);
  return error ? error.message : null;
}

/** त्रुटि सन्देश (database बाट आएको दुवै भाषाको पाठ सहित) */
export async function deleteRow(table: SetupTable, id: string): Promise<string | null> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  return error ? error.message : null;
}
