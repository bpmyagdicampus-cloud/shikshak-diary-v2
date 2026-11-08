import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ne" | "en";

const DICT = {
  appName: { ne: "शिक्षक डायरी", en: "Shikshak Diary" },
  signIn: { ne: "लगइन", en: "Sign in" },
  email: { ne: "इमेल", en: "Email" },
  password: { ne: "पासवर्ड", en: "Password" },
  language: { ne: "भाषा", en: "Language" },
  signOut: { ne: "बाहिर निस्कनुहोस्", en: "Sign out" },
  dashboard: { ne: "ड्यासबोर्ड", en: "Dashboard" },
  organizations: { ne: "संस्था / क्याम्पस", en: "Organizations" },
  academicYears: { ne: "शैक्षिक वर्ष", en: "Academic years" },
  create: { ne: "थप्नुहोस्", en: "Create" },
  name: { ne: "नाम", en: "Name" },
  startMonth: { ne: "सुरु महिना (BS, १–१२)", en: "Start month (BS, 1–12)" },
  calendar: { ne: "क्यालेन्डर प्रणाली", en: "Calendar system" },
  bs: { ne: "विक्रम संवत (BS)", en: "Bikram Sambat (BS)" },
  ad: { ne: "ग्रेगोरियन (AD)", en: "Gregorian (AD)" },
  startDate: { ne: "सुरु मिति", en: "Start date" },
  endDate: { ne: "अन्त्य मिति", en: "End date" },
  noAccess: { ne: "तपाईंसँग यो पेज हेर्ने अधिकार छैन।", en: "You do not have access to this page." },
  loading: { ne: "लोड हुँदैछ…", en: "Loading…" },
  error: { ne: "त्रुटि", en: "Error" },
  saved: { ne: "सुरक्षित भयो", en: "Saved" },
  superAdmin: { ne: "सुपर एडमिन", en: "Super admin" },
  admin: { ne: "एडमिन", en: "Admin" },
  departmentHead: { ne: "विभाग प्रमुख", en: "Department head" },
  teacher: { ne: "शिक्षक", en: "Teacher" },
  student: { ne: "विद्यार्थी", en: "Student" },
  welcome: { ne: "स्वागत छ", en: "Welcome" },
} as const;

export type TKey = keyof typeof DICT;

const STORAGE = "sd_lang";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string; tx: (ne: string, en: string) => string; pick: (name: string, nameEn?: string | null) => string };
const LangCtx = createContext<Ctx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE) : null;
    return v === "en" ? "en" : "ne";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE, l);
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (k: TKey) => DICT[k][lang];
  // पृष्ठका सामान्य पाठ: नेपाली वा English, छानिएको भाषा अनुसार
  const tx = (ne: string, en: string) => (lang === "ne" ? ne : en);
  // डाटाबेसको नाम: English मा छ भने name_en, नभए मूल नाम
  const pick = (name: string, nameEn?: string | null) => (lang === "en" && nameEn ? nameEn : name);

  return <LangCtx.Provider value={{ lang, setLang, t, tx, pick }}>{children}</LangCtx.Provider>;
}

export function useT() {
  const c = useContext(LangCtx);
  if (!c) throw new Error("useT must be used inside LangProvider");
  return c;
}
