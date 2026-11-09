// Edge Function: user व्यवस्थापन (सबै कार्य एकै ठाउँमा)
// actions: update_profile | update_email | set_membership | toggle_campus | reset_password | delete_membership
// अधिकार: super admin = सबै; campus admin = आफ्नो क्याम्पसका non-admin सदस्य मात्र।
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ROLES = ["admin", "department_head", "teacher", "student"];

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

    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: me, error: meErr } = await caller.auth.getUser();
    if (meErr || !me.user) return json({ error: "Unauthorized" }, 401);
    const actor = me.user.id;

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json();
    const action = String(body.action ?? "");

    const { data: sa } = await admin.from("platform_roles").select("user_id").eq("user_id", actor).maybeSingle();
    const isSuper = !!sa;

    // इनपुट अनुसार लक्ष्य क्याम्पस र user निर्धारण
    let orgId = String(body.org_id ?? "");
    let targetId = String(body.user_id ?? "");
    if (action === "set_membership" || action === "delete_membership") {
      const { data: mem } = await admin.from("memberships").select("user_id,org_id").eq("id", String(body.membership_id ?? "")).maybeSingle();
      if (!mem) return json({ error: "सदस्यता भेटिएन / Membership not found" }, 404);
      orgId = mem.org_id;
      targetId = mem.user_id;
    }
    if (!targetId) return json({ error: "user_id आवश्यक छ" }, 400);

    // अधिकार जाँच
    if (!isSuper) {
      if (!orgId) return json({ error: "org_id आवश्यक छ" }, 400);
      const { data: am } = await admin
        .from("memberships").select("id").eq("user_id", actor).eq("org_id", orgId).eq("role", "admin").eq("is_active", true).maybeSingle();
      if (!am) return json({ error: "यो क्याम्पसको admin होइनौ / Not an admin of this campus" }, 403);
      const { data: tm } = await admin.from("memberships").select("role").eq("user_id", targetId).eq("org_id", orgId);
      if (!tm?.length) return json({ error: "यो user यो क्याम्पसको सदस्य होइन" }, 400);
      if ((tm ?? []).some((x) => x.role === "admin")) {
        return json({ error: "Admin को व्यवस्थापन super admin ले मात्र गर्छ / Only super admin manages admins" }, 403);
      }
      if (action === "set_membership" && body.role === "admin") {
        return json({ error: "Admin बनाउने अधिकार super admin को हो" }, 403);
      }
    } else if (action === "set_membership" || action === "toggle_campus") {
      // super admin ले सबै गर्न सक्छ
    }

    // ---------- कार्यहरू ----------
    if (action === "update_profile") {
      const fullName = String(body.full_name ?? "").trim();
      if (!fullName) return json({ error: "नाम आवश्यक छ" }, 400);
      const { error } = await admin.from("profiles")
        .update({ full_name: fullName, phone: String(body.phone ?? "").trim() || null })
        .eq("id", targetId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "update_email") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "इमेल मान्य छैन" }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetId, { email, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ email }).eq("id", targetId);
      return json({ ok: true });
    }

    if (action === "set_membership") {
      const patch: Record<string, unknown> = {};
      if (body.role !== undefined) {
        if (!ROLES.includes(String(body.role))) return json({ error: "भूमिका मिलेन" }, 400);
        patch.role = body.role;
      }
      if (body.department_id !== undefined) patch.department_id = body.department_id || null;
      if (body.is_active !== undefined) patch.is_active = !!body.is_active;
      const { error } = await admin.from("memberships").update(patch).eq("id", String(body.membership_id));
      if (error) return json({ error: error.message }, 400);
      await syncLogin(admin, targetId);
      return json({ ok: true });
    }

    if (action === "toggle_campus") {
      // क्याम्पसको सबै सदस्यता निष्क्रिय/सक्रिय
      const { error } = await admin.from("memberships").update({ is_active: !!body.is_active })
        .eq("user_id", targetId).eq("org_id", orgId);
      if (error) return json({ error: error.message }, 400);
      await syncLogin(admin, targetId);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ must_change_password: true }).eq("id", targetId);
      await admin.from("audit_log").insert({
        org_id: orgId || null, table_name: "auth.users", record_id: targetId,
        action: "password_reset", actor_id: actor, old_data: null, new_data: { must_change_password: true },
      });
      return json({ ok: true, temporary_password: password });
    }

    if (action === "delete_membership") {
      // प्रयोगमा भएको user मेटिँदैन (कक्षा-विषय वा डायरी भए)
      const { count: used } = await admin.from("class_subjects").select("id", { count: "exact", head: true }).eq("teacher_user_id", targetId);
      const { count: diary } = await admin.from("diary_entries").select("id", { count: "exact", head: true }).eq("teacher_user_id", targetId);
      if ((used ?? 0) > 0 || (diary ?? 0) > 0) {
        return json({ error: "यो user का कक्षा-विषय वा डायरी छन्। पहिले निष्क्रिय गर्नुहोस्। / Has classes or diary; deactivate instead." }, 400);
      }
      const { error } = await admin.from("memberships").delete().eq("id", String(body.membership_id));
      if (error) return json({ error: error.message }, 400);
      // कुनै सदस्यता बाँकी छैन र super admin पनि होइन भने खाता पनि हटाउने
      const { count: left } = await admin.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", targetId);
      const { data: sa2 } = await admin.from("platform_roles").select("user_id").eq("user_id", targetId).maybeSingle();
      if ((left ?? 0) === 0 && !sa2) await admin.auth.admin.deleteUser(targetId);
      return json({ ok: true });
    }

    return json({ error: "अज्ञात कार्य / Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

/** सक्रिय सदस्यता छैन भने लगइन बन्द (ban); भए खोल्ने */
async function syncLogin(admin: ReturnType<typeof createClient>, userId: string) {
  const { count } = await admin.from("memberships").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("is_active", true);
  const { data: sa } = await admin.from("platform_roles").select("user_id").eq("user_id", userId).maybeSingle();
  const active = (count ?? 0) > 0 || !!sa;
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
}
