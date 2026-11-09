import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useT, type Lang } from "../lib/i18n";

type Item = { to: string; ne: string; en: string; show: boolean };

export default function Shell() {
  const { profile, isSuperAdmin, memberships, signOut } = useAuth();
  const { t, lang, setLang } = useT();
  const isAdmin = memberships.some((m) => m.role === "admin");
  const isHead = memberships.some((m) => m.role === "department_head");

  const items: Item[] = [
    { to: "/", ne: "ड्यासबोर्ड", en: "Dashboard", show: true },
    { to: "/account", ne: "मेरो खाता", en: "My account", show: true },
    { to: "/superadmins", ne: "सुपर एडमिन", en: "Super admins", show: isSuperAdmin },
    { to: "/orgs", ne: "संस्था", en: "Organizations", show: isSuperAdmin },
    { to: "/departments", ne: "विभाग", en: "Departments", show: isSuperAdmin || isAdmin },
    { to: "/classes", ne: "कक्षा", en: "Classes", show: isSuperAdmin || isAdmin || isHead },
    { to: "/subjects", ne: "विषय", en: "Subjects", show: isSuperAdmin || isAdmin || isHead },
    { to: "/members", ne: "सदस्य", en: "Members", show: isSuperAdmin || isAdmin },
    { to: "/years", ne: "शैक्षिक वर्ष", en: "Academic years", show: isSuperAdmin || isAdmin },
  ];
  const visible = items.filter((i) => i.show);
  const label = (i: Item) => (lang === "ne" ? i.ne : i.en);
  const onLang = (l: Lang) => setLang(l);

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="p-4 text-lg font-bold text-brand">{t("appName")}</div>
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

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <span className="font-bold text-brand">{t("appName")}</span>
        <div className="flex gap-1">
          <button className={lang === "ne" ? "btn px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"} onClick={() => onLang("ne")}>ने</button>
          <button className={lang === "en" ? "btn px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"} onClick={() => onLang("en")}>EN</button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => void signOut()}>{t("signOut")}</button>
        </div>
      </header>

      {/* मोबाइलमा मेनु स्क्रोल हुने (धेरै आइटम भए पनि) */}
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
