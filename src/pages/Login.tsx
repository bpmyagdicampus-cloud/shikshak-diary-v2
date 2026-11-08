import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT, type Lang } from "../lib/i18n";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { t, lang, setLang } = useT();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (session) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message);
  };

  const pick = (l: Lang) => setLang(l);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-xl font-bold text-brand">{t("appName")}</div>
        </div>

        {/* लगइनमै भाषा छान्ने */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{t("language")}</span>
          <div className="flex gap-1">
            <button type="button" className={lang === "ne" ? "btn px-3 py-1" : "btn-ghost px-3 py-1"} onClick={() => pick("ne")}>नेपाली</button>
            <button type="button" className={lang === "en" ? "btn px-3 py-1" : "btn-ghost px-3 py-1"} onClick={() => pick("en")}>English</button>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("email")}</span>
            <input className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("password")}</span>
            <input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn w-full" disabled={busy}>{t("signIn")}</button>
        </form>
      </div>
    </div>
  );
}
