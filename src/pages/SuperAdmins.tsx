import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";

type Row = { user_id: string; profiles: { full_name: string; email: string | null } | null };

export default function SuperAdmins() {
  const { tx } = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("platform_roles")
      .select("user_id,profiles(full_name,email)")
      .order("created_at");
    if (error) setMsg(error.message);
    else setRows((data ?? []) as unknown as Row[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    const { data: found, error: pErr } = await supabase.rpc("find_user_by_email", { p_email: email.trim() });
    if (pErr) return setMsg(pErr.message);
    const prof = (found as { id: string }[] | null)?.[0];
    if (!prof) return setMsg(tx("यो इमेलको user भेटिएन।", "No user found with this email."));
    // ५ सम्मको सीमा database trigger ले जाँच्छ
    const { error } = await supabase.from("platform_roles").insert({ user_id: prof.id });
    if (error) return setMsg(error.message);
    setEmail("");
    setMsg(tx("Super admin थपियो", "Super admin added"));
    await load();
  };

  const remove = async (uid: string) => {
    if (!confirm(tx("यो super admin हटाउने?", "Remove this super admin?"))) return;
    const { error } = await supabase.from("platform_roles").delete().eq("user_id", uid);
    if (error) return setMsg(error.message);
    await load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Super admin · {rows.length}/5</h1>
      <form onSubmit={add} className="card flex flex-wrap gap-2">
        <input className="field max-w-sm" type="email" required placeholder={tx("इमेल", "Email")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn" disabled={rows.length >= 5}>{tx("थप्नुहोस्", "Add")}</button>
      </form>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.user_id} className="card flex items-center justify-between">
            <div>
              <div className="font-semibold">{r.profiles?.full_name || "—"}</div>
              <div className="text-xs text-slate-500">{r.profiles?.email}</div>
            </div>
            <button className="btn-ghost text-xs" onClick={() => void remove(r.user_id)}>{tx("हटाउनुहोस्", "Remove")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
