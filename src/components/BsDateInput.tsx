import { useEffect, useState } from "react";
import { useT } from "../../lib/i18n";
import { adIsoToBs, bsToAdIso } from "../../lib/dates";

/** BS महिनाका नाम (ne/en) */
const BS_MONTHS: { ne: string; en: string }[] = [
  { ne: "बैशाख", en: "Baisakh" }, { ne: "जेठ", en: "Jestha" }, { ne: "असार", en: "Ashad" },
  { ne: "साउन", en: "Shrawan" }, { ne: "भदौ", en: "Bhadra" }, { ne: "असोज", en: "Ashwin" },
  { ne: "कार्तिक", en: "Kartik" }, { ne: "मंसिर", en: "Mangsir" }, { ne: "पुष", en: "Poush" },
  { ne: "माघ", en: "Magh" }, { ne: "फागुन", en: "Falgun" }, { ne: "चैत", en: "Chaitra" },
];

const YEARS = Array.from({ length: 21 }, (_, i) => 2075 + i);
const pad = (n: number) => String(n).padStart(2, "0");

interface Parts {
  year: number;
  month: number;
  day: number;
}

/** AD ISO → BS parts (खाली भए null) */
function partsOf(iso: string): Parts | null {
  if (!iso) return null;
  const [y, m, d] = adIsoToBs(iso).split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** BS parts → AD ISO (अवैध भए खाली) */
function isoOf(p: Parts): string {
  try {
    const iso = bsToAdIso(p.year, p.month, p.day);
    return adIsoToBs(iso) === `${p.year}-${pad(p.month)}-${pad(p.day)}` ? iso : "";
  } catch {
    return "";
  }
}

export interface BsDateInputProps {
  label: string;
  /** मान AD ISO (YYYY-MM-DD) मा; खाली भए अनिर्णीत */
  value: string;
  onChange: (iso: string) => void;
  /** खाली छोड्न मिल्ने हो कि होइन */
  optional?: boolean;
}

/** BS मितिका लागि dropdown (वर्ष / महिना / गते) — भाषा अनुसार महिनाका नाम */
export default function BsDateInput({ label, value, onChange, optional = false }: BsDateInputProps) {
  const { tx, lang } = useT();
  const [parts, setParts] = useState<Parts | null>(partsOf(value));

  useEffect(() => {
    setParts(partsOf(value));
  }, [value]);

  const update = (patch: Partial<Parts>) => {
    const base: Parts = parts ?? { year: 2083, month: 1, day: 1 };
    const next = { ...base, ...patch };
    setParts(next);
    onChange(isoOf(next));
  };

  return (
    <div>
      <div className="mb-1 text-sm font-medium">
        {label}
        {optional && <span className="ml-1 text-xs text-slate-500">({tx("वैकल्पिक", "optional")})</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <select className="field" value={parts?.year ?? ""} onChange={(e) => update({ year: Number(e.target.value) })}>
          {!parts && <option value="">{tx("वर्ष", "Year")}</option>}
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="field" value={parts?.month ?? ""} onChange={(e) => update({ month: Number(e.target.value) })}>
          {!parts && <option value="">{tx("महिना", "Month")}</option>}
          {BS_MONTHS.map((m, i) => <option key={m.en} value={i + 1}>{lang === "ne" ? m.ne : m.en}</option>)}
        </select>
        <select className="field" value={parts?.day ?? ""} onChange={(e) => update({ day: Number(e.target.value) })}>
          {!parts && <option value="">{tx("गते", "Day")}</option>}
          {Array.from({ length: 32 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {optional && value && (
        <button type="button" className="mt-1 text-xs text-slate-500 underline" onClick={() => { setParts(null); onChange(""); }}>
          {tx("मिति हटाउनुहोस्", "Clear date")}
        </button>
      )}
    </div>
  );
}
