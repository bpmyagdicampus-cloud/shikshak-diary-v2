import { useMemo, useState } from "react";
import { useT } from "../../lib/i18n";
import { adIsoToBs } from "../../lib/dates";
import { classifyDay, isoOf, type CalEvent, type DayKind } from "../../lib/calendarDays";

/** महिना अनुसार दिन-ग्रिड. BS गते देखाउँछ; रंग: बिदा=रातो, कार्यक्रम=निलो, कक्षा=हरियो */

const WEEK: { ne: string; en: string }[] = [
  { ne: "आइत", en: "Sun" }, { ne: "सोम", en: "Mon" }, { ne: "मंगल", en: "Tue" },
  { ne: "बुध", en: "Wed" }, { ne: "बिहि", en: "Thu" }, { ne: "शुक्र", en: "Fri" }, { ne: "शनि", en: "Sat" },
];

const CELL: Record<DayKind, string> = {
  holiday: "bg-red-500 text-white",
  weekly_off: "bg-red-100 text-red-700",
  event: "bg-blue-500 text-white",
  class: "bg-emerald-500 text-white",
};

export interface CalendarGridProps {
  events: CalEvent[];
  weeklyOff: number[];
  /** शुरुआती महिना (AD) */
  initial?: Date;
  onDayClick?: (iso: string) => void;
}

export default function CalendarGrid({ events, weeklyOff, initial, onDayClick }: CalendarGridProps) {
  const { tx, lang } = useT();
  const [cursor, setCursor] = useState(() => {
    const d = initial ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const cells = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const out: ({ iso: string; bsDay: number; kind: DayKind; title: string } | null)[] = [];
    for (let i = 0; i < first; i++) out.push(null);
    for (let d = 1; d <= days; d++) {
      const iso = isoOf(new Date(y, m, d));
      const info = classifyDay(iso, weeklyOff, events);
      const bsDay = Number(adIsoToBs(iso).split("-")[2]);
      out.push({ iso, bsDay, kind: info.kind, title: info.events.map((e) => e.title).join(", ") });
    }
    return out;
  }, [cursor, events, weeklyOff]);

  const monthLabel = cursor.toLocaleDateString(lang === "ne" ? "ne-NP" : "en-US", { year: "numeric", month: "long" });
  const legend: { kind: DayKind; ne: string; en: string }[] = [
    { kind: "holiday", ne: "पठनपाठन बन्द (बिदा)", en: "No teaching (holiday)" },
    { kind: "event", ne: "कार्यक्रम", en: "Event" },
    { kind: "class", ne: "नियमित कक्षा", en: "Regular class" },
    { kind: "weekly_off", ne: "साप्ताहिक बिदा", en: "Weekly off" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button className="btn-ghost text-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
        <div className="font-semibold">{monthLabel}</div>
        <button className="btn-ghost text-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
        {WEEK.map((w) => <div key={w.en}>{lang === "ne" ? w.ne : w.en}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) =>
          c ? (
            <button
              key={c.iso}
              type="button"
              title={c.title || undefined}
              onClick={() => onDayClick?.(c.iso)}
              className={`flex aspect-square flex-col items-center justify-center rounded-md text-xs font-semibold ${CELL[c.kind]}`}
            >
              <span>{c.bsDay}</span>
              <span className="text-[9px] font-normal opacity-80">{Number(c.iso.slice(8, 10))}</span>
            </button>
          ) : (
            <div key={`e${i}`} />
          )
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {legend.map((l) => (
          <span key={l.kind} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded ${CELL[l.kind]}`} />
            {tx(l.ne, l.en)}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-500">{tx("ठूलो अङ्क: BS गते, सानो अङ्क: AD गते", "Large number: BS day, small number: AD day")}</p>
    </div>
  );
}
