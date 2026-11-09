import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";

/** Email को reset link ले यहाँ ल्याउँछ (URL मा recovery token हुन्छ) */
export default function ResetPassword() {
  const { tx } = useT();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase ले URL hash बाट recovery session बनाउँछ
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (p1.length < 8) return setMsg(tx("पासवर्ड कम्तीमा ८ अक्षरको हुनुपर्छ।", "Password must be at least 8 characters."));
    if (p1 !== p2) return setMsg(tx("दुई पासवर्ड मिलेनन्।", "The two passwords do not match."));
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return setMsg(error.message);
    // नयाँ पासवर्डले फेरि लगइन गर्न लगाउन साइन-आउट
    await supabase.auth.signOut();
    nav("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4">
        <h1 className="text-lg font-bold">{tx("नयाँ पासवर्ड सेट गर्नुहोस्", "Set a new password")}</h1>
        {!ready ? (
          <p className="text-sm text-slate-600">
            {tx("रिसेट लिंक मान्य छैन वा म्याद सकिएको छ। फेरि रिसेट अनुरोध गर्नुहोस्।", "This reset link is invalid or has expired. Request a new one.")}
          </p>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <input className="field" type="password" autoComplete="new-password" required placeholder={tx("नयाँ पासवर्ड", "New password")} value={p1} onChange={(e) => setP1(e.target.value)} />
            <input className="field" type="password" autoComplete="new-password" required placeholder={tx("पुनः लेख्नुहोस्", "Confirm password")} value={p2} onChange={(e) => setP2(e.target.value)} />
            {msg && <p className="text-sm text-red-600">{msg}</p>}
            <button className="btn w-full" disabled={busy}>{tx("सेभ गर्नुहोस्", "Save")}</button>
          </form>
        )}
        <button className="btn-ghost w-full" onClick={() => nav("/login", { replace: true })}>{tx("लगइनमा फर्कनुहोस्", "Back to sign in")}</button>
      </div>
    </div>
  );
}
