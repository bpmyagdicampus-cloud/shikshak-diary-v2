import type { ReactNode } from "react";
import { useT } from "../lib/i18n";
import ItemMenu, { type ItemAction } from "./ItemMenu";

interface EntryRowProps {
  title: string;
  archived: boolean;
  actions: ItemAction[];
  children?: ReactNode;
}

/**
 * सूचीको एक पंक्ति: शीर्षक + ⋮ मेनु + (खुलेको भए) विवरण/सम्पादन।
 * Stateless: सबै data र actions props बाट।
 */
export default function EntryRow({ title, archived, actions, children }: EntryRowProps) {
  const { tx } = useT();
  return (
    <div className={`card space-y-3 ${archived ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 font-semibold">
          {title}
          {archived && (
            <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs font-normal">{tx("निष्क्रिय", "Inactive")}</span>
          )}
        </div>
        <ItemMenu actions={actions} />
      </div>
      {children}
    </div>
  );
}

/** Inline edit box (नाम सम्पादन) */
export function InlineEdit({
  onSave,
  onCancel,
  busy,
  children,
}: {
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const { tx } = useT();
  return (
    <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
      {children}
      <div className="flex items-end gap-2">
        <button className="btn" disabled={busy} onClick={onSave}>
          {busy ? tx("सेभ हुँदैछ…", "Saving…") : tx("सेभ गर्नुहोस्", "Save")}
        </button>
        <button className="btn-ghost" onClick={onCancel}>{tx("रद्द", "Cancel")}</button>
      </div>
    </div>
  );
}
