import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../lib/store";

/** शैक्षिक कार्यतालिका सारांश (पुरानो Plans मा देखिने कार्ड अनुसार) */
export interface CalendarEvent {
  id: string;
  title: string;
  eventType: "event" | "holiday" | "exam" | "activity";
  startDate: string;
  endDate: string;
}

export interface CalendarSummary {
  yearName: string | null;
  yearStart: string | null;
  yearEnd: string | null;
  totalWorkingDays: number;
  netTeachingDays: number;
  exams: CalendarEvent[];
  vacations: CalendarEvent[];
  loaded: boolean;
  error: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Saturday = 6 (JS getDay). साप्ताहिक बिदा केन्द्रीय नियम हो; यहाँ शनिबार */
const WEEKLY_OFF = 6;

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** दुई मितिबीच (समावेश) साप्ताहिक बिदा बाहेक कार्यदिन */
function countWorkingDays(startIso: string, endIso: string, skip: Set<string>): number {
  let count = 0;
  const end = isoToDate(endIso).getTime();
  for (let t = isoToDate(startIso).getTime(); t <= end; t += DAY_MS) {
    const d = new Date(t);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (d.getDay() === WEEKLY_OFF) continue;
    if (skip.has(iso)) continue;
    count++;
  }
  return count;
}

export function useCalendarSummary(): CalendarSummary {
  const orgId = useAuthStore((s) => s.currentCampusId);
  const [state, setState] = useState<CalendarSummary>({
    yearName: null, yearStart: null, yearEnd: null, totalWorkingDays: 0, netTeachingDays: 0,
    exams: [], vacations: [], loaded: false, error: null,
  });

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const yr = await supabase
          .from("academic_years")
          .select("id,name,start_date,end_date")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .is("archived_at", null)
          .maybeSingle();
        if (yr.error) throw new Error(yr.error.message);
        const y = yr.data as { id: string; name: string; start_date: string; end_date: string } | null;
        if (!y) {
          if (!cancelled) setState((s) => ({ ...s, loaded: true }));
          return;
        }
        const ev = await supabase
          .from("calendar_events")
          .select("id,title,event_type,start_date,end_date")
          .eq("org_id", orgId)
          .lte("start_date", y.end_date)
          .gte("end_date", y.start_date);
        if (ev.error) throw new Error(ev.error.message);
        const events = ((ev.data ?? []) as unknown as { id: string; title: string; event_type: CalendarEvent["eventType"]; start_date: string; end_date: string }[]).map((e) => ({
          id: e.id, title: e.title, eventType: e.event_type, startDate: e.start_date, endDate: e.end_date,
        }));

        // बिदा/परीक्षाका सबै मिति (पुनरावृत्ति नगरी)
        const skip = new Set<string>();
        for (const e of events) {
          if (e.eventType !== "holiday" && e.eventType !== "exam") continue;
          for (let t = isoToDate(e.startDate).getTime(); t <= isoToDate(e.endDate).getTime(); t += DAY_MS) {
            const d = new Date(t);
            skip.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
          }
        }
        const total = countWorkingDays(y.start_date, y.end_date, new Set());
        const net = countWorkingDays(y.start_date, y.end_date, skip);

        if (!cancelled) {
          setState({
            yearName: y.name,
            yearStart: y.start_date,
            yearEnd: y.end_date,
            totalWorkingDays: total,
            netTeachingDays: net,
            exams: events.filter((e) => e.eventType === "exam"),
            vacations: events.filter((e) => e.eventType === "holiday"),
            loaded: true,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loaded: true, error: err instanceof Error ? err.message : "Unknown error" }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return state;
}
