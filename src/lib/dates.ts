import NepaliDate from "nepali-date-converter";

/**
 * मिति सधैँ AD (ISO "YYYY-MM-DD") मा भण्डारण हुन्छ।
 * प्रदर्शन BS वा AD मा प्रयोगकर्ताको सेटिङ अनुसार हुन्छ।
 */

export const isoFromDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** BS (Y, M 1–12, D) → AD ISO string */
export function bsToAdIso(y: number, m: number, d: number): string {
  const js = new NepaliDate(y, m - 1, d).toJsDate();
  return isoFromDate(js);
}

/** AD ISO string → BS "YYYY-MM-DD" */
export function adIsoToBs(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const n = new NepaliDate(new Date(y, m - 1, d));
  return `${n.getYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** प्रयोगकर्ताको पसन्द अनुसार देखाउने */
export function displayDate(iso: string, pref: "bs" | "ad"): string {
  return pref === "bs" ? adIsoToBs(iso) : iso;
}

/** शैक्षिक वर्षको नाम: श्रावण (महिना 4) देखि सुरु हुने BS वर्ष */
export function academicYearName(bsYear: number): string {
  return `${bsYear}/${String((bsYear + 1) % 100).padStart(2, "0")}`;
}
