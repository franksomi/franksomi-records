// Franksomi Records — lets the Owner create staff logins and reset passwords from inside the app.
// Runs on Supabase Edge Functions (Deno) with the service key, which never reaches the website. Deploy with: supabase functions deploy manage-users
declare const Deno: any;

export type Deps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  getUser: (jwt: string) => Promise<string | null>;
  createUser: (email: string, password: string, fullName: string) => Promise<{ id?: string; error?: string }>;
  setPassword: (id: string, password: string) => Promise<{ error?: string }>;
  deleteUser: (id: string) => Promise<void>;
};

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
export const ROLES = ["manager", "accountant", "technician", "storekeeper", "sales", "auditor"];
export const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export const passwordProblem = (p: string, email: string): string | null =>
  p.length < 8 ? "The password must be at least 8 characters." : p.length > 72 ? "The password is too long." : p.toLowerCase() === email.toLowerCase() ? "The password cannot be the email address." : null;

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any = {}; try { body = await req.json(); } catch { return json({ error: "bad_request", message: "Bad request." }, 400); }
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const actor = jwt ? await d.getUser(jwt) : null;
  if (!actor) return json({ error: "not_allowed", message: "Please sign in." }, 401);
  const may = await d.rpc("user_has_perm", { p_user: actor, p: "users.manage" });
  if (may.error || may.data !== true) return json({ error: "not_allowed", message: "Only the owner can manage users." }, 403);

  if (body.action === "create") {
    const email = String(body.email || "").trim().toLowerCase(), name = String(body.full_name || "").trim().slice(0, 80), role = String(body.role || ""), pw = String(body.password || "");
    if (!EMAIL.test(email)) return json({ error: "bad_email", message: "That email address does not look right." }, 400);
    if (!name) return json({ error: "bad_name", message: "Please enter the person's name." }, 400);
    if (!ROLES.includes(role)) return json({ error: "bad_role", message: "Choose a role." }, 400);
    const pp = passwordProblem(pw, email); if (pp) return json({ error: "bad_password", message: pp }, 400);
    const c = await d.createUser(email, pw, name);
    if (c.error || !c.id) return json({ error: "create_failed", message: /already|registered|exists/i.test(c.error || "") ? "Someone with that email already has a login." : "Could not create the login: " + (c.error || "unknown error") }, 409);
    const f = await d.rpc("admin_finish_user", { p_actor: actor, p_id: c.id, p_name: name, p_role: role });
    if (f.error) { await d.deleteUser(c.id); return json({ error: "create_failed", message: "Could not set up the account, nothing was created." }, 500); }
    return json({ ok: true, id: c.id });
  }
  if (body.action === "reset_password") {
    const id = String(body.id || ""), pw = String(body.password || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad_request", message: "Unknown person." }, 400);
    if (pw.length < 8 || pw.length > 72) return json({ error: "bad_password", message: "The password must be 8 to 72 characters." }, 400);
    const r = await d.setPassword(id, pw); if (r.error) return json({ error: "reset_failed", message: "Could not change the password: " + r.error }, 500);
    await d.rpc("admin_log_password_reset", { p_actor: actor, p_id: id });
    return json({ ok: true });
  }
  return json({ error: "bad_request", message: "Unknown action." }, 400);
}

if (typeof Deno !== "undefined" && Deno.serve) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  Deno.serve((req: Request) => handle(req, {
    rpc: (fn, args) => admin.rpc(fn, args) as any,
    getUser: async (jwt) => { const { data, error } = await admin.auth.getUser(jwt); return error ? null : (data.user?.id ?? null); },
    createUser: async (email, password, fullName) => { const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }); return error ? { error: error.message } : { id: data.user?.id }; },
    setPassword: async (id, password) => { const { error } = await admin.auth.admin.updateUserById(id, { password }); return error ? { error: error.message } : {}; },
    deleteUser: async (id) => { await admin.auth.admin.deleteUser(id); },
  }));
}
