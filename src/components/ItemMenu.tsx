import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";

export type ItemAction = { label: string; onClick: () => void; danger?: boolean };

/** हरेक सूचीको पंक्तिमा ⋮ मेनु: Edit / Archive / Delete */
export default function ItemMenu({ actions }: { actions: ItemAction[] }) {
  const { tx } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={tx("विकल्पहरू", "Options")}
        className="btn-ghost px-3 py-1 text-lg leading-none"
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${a.danger ? "text-red-600" : ""}`}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Archive गरिएका रेकर्ड देखाउने/नदेखाउने टगल */
export function ArchivedToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { tx } = useT();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {tx("Archive गरिएका पनि देखाउनुहोस्", "Show archived items")}
    </label>
  );
}
