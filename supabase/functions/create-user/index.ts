// Supabase Edge Function: नयाँ user बनाएर क्याम्पसमा सदस्यता दिने।
// Service role key यही function भित्र मात्र प्रयोग हुन्छ (browser मा कहिल्यै होइन)।
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
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // १. बोलाउने व्यक्ति लगइन छ कि छैन
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: me, error: meErr } = await caller.auth.getUser();
    if (meErr || !me.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

    // २. इनपुट जाँच
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const phone = String(body.phone ?? "").trim() || null;
    const role = String(body.role ?? "");
    const orgId = String(body.org_id ?? "");
    const deptId = body.department_id ? String(body.department_id) : null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "इमेल मान्य छैन / Invalid email" }, 400);
    if (!fullName) return json({ error: "नाम आवश्यक छ / Name is required" }, 400);
    if (!ROLES.includes(role)) return json({ error: "भूमिका मिलेन / Invalid role" }, 400);
    if (!orgId) return json({ error: "क्याम्पस छनोट गर्नुहोस् / Select a campus" }, 400);
    if ((role === "department_head" || role === "teacher") && !deptId) {
      return json({ error: "विभाग अनिवार्य छ / Department is required" }, 400);
    }

    // ३. अधिकार जाँच
    const { data: sa } = await admin.from("platform_roles").select("user_id").eq("user_id", me.user.id).maybeSingle();
    const isSuper = !!sa;
    if (!isSuper) {
      const { data: m } = await admin
        .from("memberships")
        .select("id")
        .eq("user_id", me.user.id)
        .eq("org_id", orgId)
        .eq("role", "admin")
        .eq("is_active", true)
        .maybeSingle();
      if (!m) return json({ error: "यो क्याम्पसको admin होइनौ / Not an admin of this campus" }, 403);
      // Campus admin ले admin बनाउन सक्दैन; super admin ले मात्र
      if (role === "admin") return json({ error: "Admin सिर्फ super admin ले बनाउँछ / Only super admin can create admins" }, 403);
    }

    // ४. पहिले इमेल पहिल्यै छ कि जाँच; छैन भने मात्र नयाँ user बनाउने
    const givenPw = String(body.password ?? "").trim();
    if (givenPw && givenPw.length < 8) return json({ error: "पासवर्ड कम्तीमा ८ अक्षरको हुनुपर्छ / Password must be at least 8 characters" }, 400);
    const password = givenPw || tempPassword();
    let userId: string | null = null;
    let created = false;

    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (lErr) return json({ error: `User खोज्न सकेन: ${lErr.message}` }, 500);
    const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);

    if (existing) {
      userId = existing.id;
    } else {
      const { data: newUser, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      // वास्तविक त्रुटि सिधै फर्काउने (अनुमान गरिँदैन)
      if (cErr || !newUser?.user) {
        return json({ error: `User बनाउन सकिएन: ${cErr?.message ?? "unknown error"}` }, 400);
      }
      userId = newUser.user.id;
      created = true;
    }

    // ५. profile र सदस्यता
    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id: userId!, full_name: fullName, email, phone }, { onConflict: "id" });
    if (pErr) return json({ error: `Profile: ${pErr.message}` }, 400);

    const { error: mErr } = await admin.from("memberships").insert({
      user_id: userId!,
      org_id: orgId,
      role,
      department_id: deptId,
    });
    if (mErr) return json({ error: `सदस्यता: ${mErr.message}` }, 400);

    return json({
      ok: true,
      user_id: userId,
      created,
      // नयाँ user मा मात्र अस्थायी पासवर्ड; एकपटक मात्र देखाउने
      temporary_password: created ? password : null,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
