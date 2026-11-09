import { toast } from "sonner";

/** Supabase को परिणाम (unknown बाट typed array) */
export function asRows<T>(data: unknown): T[] {
  return ((data ?? []) as unknown) as T[];
}

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export interface WriteResult {
  error: { message: string } | null;
}

/**
 * Write operation को एकीकृत runner।
 * सफल भए success toast र true; असफल भए (database trigger को सन्देश सहित) error toast र false।
 */
export async function writeOp(op: () => PromiseLike<WriteResult>, okMessage: string): Promise<boolean> {
  try {
    const { error } = await op();
    if (error) throw new Error(error.message);
    toast.success(okMessage);
    return true;
  } catch (err) {
    toast.error(messageOf(err));
    return false;
  }
}
