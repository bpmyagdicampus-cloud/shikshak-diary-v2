import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useT, type Lang } from "../lib/i18n";

type Item = { to: string; ne: string; en: string; show: boolean };

export default function Shell() {
  const { profile, can, orgOptions, activeOrgId, setActiveOrg, signOut } = useAuth();
  const { t, lang, setLang, tx } = useT();

  const items: Item[] = [
    { to: "/", ne: "ड्यासबोर्ड", en: "Dashboard", show: true },
    { to: "/account", ne: "मेरो खाता", en: "My account", show: true },
    { to: "/superadmins", ne: "सुपर एडमिन", en: "Super admins", show: can.superAdmin },
    { to: "/campus", ne: "क्याम्पस", en: "Campus", show: can.campusAdmin },
    { to: "/orgs", ne: "संस्था", en: "Organizations", show: can.superAdmin },
    { to: "/departments", ne: "विभाग", en: "Departments", show: can.campusAdmin },
    { to: "/classes", ne: "कक्षा", en: "Classes", show: can.campusAdmin || can.deptHead },
    { to: "/subjects", ne: "विषय", en: "Subjects", show: can.campusAdmin || can.deptHead },
    { to: "/members", ne: "सदस्य", en: "Members", show: can.campusAdmin },
    { to: "/years", ne: "शैक्षिक वर्ष", en: "Academic years", show: can.campusAdmin },
  ];
  const visible = items.filter((i) => i.show);
  const label = (i: Item) => (lang === "ne" ? i.ne : i.en);
  const onLang = (l: Lang) => setLang(l);

  // क्याम्पस switcher: एउटा मात्र भए देखाउनु पर्दैन
  const switcher =
    orgOptions.length > 1 ? (
      <label className="block text-xs">
        <span className="mb-1 block font-semibold text-slate-500">{tx("क्याम्पस", "Campus")}</span>
        <select className="field !py-1 text-sm" value={activeOrgId} onChange={(e) => setActiveOrg(e.target.value)}>
          {orgOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </label>
    ) : null;

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="space-y-3 p-4">
          <div className="text-lg font-bold text-brand">{t("appName")}</div>
          {switcher}
        </div>
        <nav className="flex flex-col gap-1 overflow-y-auto px-2">
          {visible.map((i) => (
            <NavLink key={i.to} to={i.to} end className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand text-white" : "hover:bg-slate-100"}`}>
              {label(i)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-slate-200 p-3 text-sm">
          <div className="truncate font-semibold">{profile?.full_name || profile?.email}</div>
          <div className="flex gap-1">
            <button className={lang === "ne" ? "btn" : "btn-ghost"} onClick={() => onLang("ne")}>नेपाली</button>
            <button className={lang === "en" ? "btn" : "btn-ghost"} onClick={() => onLang("en")}>English</button>
          </div>
          <button className="btn-ghost w-full" onClick={() => void signOut()}>{t("signOut")}</button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 space-y-2 border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <div className="flex items-center justify-between">
          <span className="font-bold text-brand">{t("appName")}</span>
          <div className="flex gap-1">
            <button className={lang === "ne" ? "btn px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"} onClick={() => onLang("ne")}>ने</button>
            <button className={lang === "en" ? "btn px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"} onClick={() => onLang("en")}>EN</button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void signOut()}>{t("signOut")}</button>
          </div>
        </div>
        {switcher}
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-slate-200 bg-white md:hidden">
        {visible.map((i) => (
          <NavLink key={i.to} to={i.to} end className={({ isActive }) => `min-w-[5.5rem] flex-1 whitespace-nowrap px-2 py-3 text-center text-xs font-semibold ${isActive ? "text-brand" : "text-slate-500"}`}>
            {label(i)}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
        <Outlet />
      </main>
    </div>
  );
}
