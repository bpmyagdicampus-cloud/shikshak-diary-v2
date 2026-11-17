/**
 * दिन वर्गीकरण (पठनपाठन/बिदा/कार्यक्रम).
 * रंग नियम: बिदा (पठनपाठन बन्द) = रातो, साप्ताहिक बिदा = रातो (हल्का),
 * कार्यक्रम = निलो, नियमित कक्षा = हरियो।
 */

export interface CalEvent {
  id: string;
  title: string;
  eventType: string;
  startDate: string; // AD ISO
  endDate: string | null;
  teachingOff: boolean;
  campusOpen: boolean;
}

export type DayKind = "holiday" | "weekly_off" | "event" | "class";

export interface DayInfo {
  kind: DayKind;
  events: CalEvent[];
}

/** JS getDay(): 0=आइतबार … 6=शनिबार */
export const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6];

const pad = (n: number) => String(n).padStart(2, "0");

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return isoOf(new Date());
}

export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** दिनको वर्गीकरण. पठनपाठन बन्द भएको कार्यक्रम प्राथमिकतामा. */
export function classifyDay(iso: string, weeklyOff: number[], events: CalEvent[]): DayInfo {
  const covering = events.filter((e) => {
    const end = e.endDate ?? e.startDate;
    return iso >= e.startDate && iso <= end;
  });
  if (covering.some((e) => e.teachingOff)) {
    return { kind: "holiday", events: covering };
  }
  if (covering.length > 0) {
    return { kind: "event", events: covering };
  }
  if (weeklyOff.includes(weekdayOf(iso))) {
    return { kind: "weekly_off", events: [] };
  }
  return { kind: "class", events: [] };
}

/** कक्षा लाग्ने दिन होइन भने (पठनपाठन बन्द) */
export function isTeachingDay(kind: DayKind): boolean {
  return kind === "class" || kind === "event";
}
