import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";

/** लगइन भएपछि आफ्नो पासवर्ड परिवर्तन (email link बिना) */
export default function Account() {
  const { tx } = useT();
  const { profile, session, reload } = useAuth();
  const forced = !!profile?.must_change_password;
  const [current, setCurrent] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setOk(false);
    if (p1.length < 8) return setMsg(tx("नयाँ पासवर्ड कम्तीमा ८ अक्षरको हुनुपर्छ।", "New password must be at least 8 characters."));
    if (p1 !== p2) return setMsg(tx("नयाँ पासवर्ड दुवै मिलेनन्।", "The new passwords do not match."));
    if (p1 === current) return setMsg(tx("नयाँ पासवर्ड पुरानैसँग उही हुन सक्दैन।", "New password must differ from the current one."));
    const email = session?.user.email;
    if (!email) return setMsg(tx("इमेल फेला परेन।", "Email not found."));

    setBusy(true);
    // रिसेट पछिको पहिलो परिवर्तनमा हालको (अस्थायी) पासवर्ड जाँच्न आवश्यक छैन
    if (!forced) {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (authErr) {
        setBusy(false);
        return setMsg(tx("हालको पासवर्ड गलत छ।", "The current password is incorrect."));
      }
    }
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) {
      setBusy(false);
      return setMsg(error.message);
    }
    if (forced && profile) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", profile.id);
      await reload();
    }
    setBusy(false);
    setCurrent("");
    setP1("");
    setP2("");
    setOk(true);
    setMsg(tx("पासवर्ड सफलतापूर्वक परिवर्तन भयो।", "Password changed successfully."));
  };

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{tx("मेरो खाता", "My account")}</h1>
      <div className="card text-sm">
        <div className="font-semibold">{profile?.full_name || "—"}</div>
        <div className="text-slate-500">{session?.user.email}</div>
      </div>

      <form onSubmit={change} className="card space-y-3">
        <div className="font-semibold">{tx("पासवर्ड परिवर्तन", "Change password")}</div>
        {forced ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm">{tx("तपाईंको पासवर्ड रिसेट गरिएको छ। अगाडि बढ्न नयाँ पासवर्ड सेट गर्नुहोस्।", "Your password was reset. Set a new password to continue.")}</p>
        ) : (
          <input className="field" type="password" autoComplete="current-password" required placeholder={tx("हालको पासवर्ड", "Current password")} value={current} onChange={(e) => setCurrent(e.target.value)} />
        )}
        <input className="field" type="password" autoComplete="new-password" required placeholder={tx("नयाँ पासवर्ड", "New password")} value={p1} onChange={(e) => setP1(e.target.value)} />
        <input className="field" type="password" autoComplete="new-password" required placeholder={tx("नयाँ पासवर्ड पुनः", "Confirm new password")} value={p2} onChange={(e) => setP2(e.target.value)} />
        {msg && <p className={`text-sm ${ok ? "text-emerald-700" : "text-red-600"}`}>{msg}</p>}
        <button className="btn w-full" disabled={busy}>{tx("परिवर्तन गर्नुहोस्", "Change password")}</button>
      </form>
    </div>
  );
}
