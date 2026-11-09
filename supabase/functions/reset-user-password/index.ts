// Edge Function: admin/super admin ले user को पासवर्ड रिसेट गर्छ।
// नयाँ अस्थायी पासवर्ड एकपटक मात्र फर्काइन्छ, कहीं सुरक्षित हुँदैन।
// User ले अर्को लगइनमा नयाँ पासवर्ड सेट गर्नु पर्छ (must_change_password = true)।
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: me, error: meErr } = await caller.auth.getUser();
    if (meErr || !me.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json();
    const targetId = String(body.user_id ?? "");
    const orgId = String(body.org_id ?? "");
    if (!targetId || !orgId) return json({ error: "user_id र org_id आवश्यक छ" }, 400);

    // Target user त्यही क्याम्पसको सदस्य हो कि?
    const { data: tm } = await admin
      .from("memberships")
      .select("role")
      .eq("user_id", targetId)
      .eq("org_id", orgId)
      .eq("is_active", true);
    const targetRoles = (tm ?? []).map((x) => x.role as string);
    if (!targetRoles.length) return json({ error: "यो user यो क्याम्पसको सदस्य होइन" }, 400);

    // बोलाउनेको अधिकार
    const { data: sa } = await admin.from("platform_roles").select("user_id").eq("user_id", me.user.id).maybeSingle();
    const isSuper = !!sa;
    if (!isSuper) {
      const { data: am } = await admin
        .from("memberships")
        .select("id")
        .eq("user_id", me.user.id)
        .eq("org_id", orgId)
        .eq("role", "admin")
        .eq("is_active", true)
        .maybeSingle();
      if (!am) return json({ error: "यो क्याम्पसको admin होइनौ" }, 403);
      // Campus admin ले अर्को admin को पासवर्ड रिसेट गर्न सक्दैन; super admin ले सक्छ
      if (targetRoles.includes("admin")) {
        return json({ error: "Admin को पासवर्ड super admin ले मात्र रिसेट गर्छ" }, 403);
      }
    }

    // अस्थायी पासवर्ड सेट
    const password = tempPassword();
    const { error: uErr } = await admin.auth.admin.updateUserById(targetId, { password });
    if (uErr) return json({ error: uErr.message }, 400);

    await admin.from("profiles").update({ must_change_password: true }).eq("id", targetId);

    // Audit (पासवर्ड स्वयं रेकर्ड हुँदैन)
    await admin.from("audit_log").insert({
      org_id: orgId,
      table_name: "auth.users",
      record_id: targetId,
      action: "password_reset",
      actor_id: me.user.id,
      old_data: null,
      new_data: { must_change_password: true },
    });

    return json({ ok: true, temporary_password: password });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
