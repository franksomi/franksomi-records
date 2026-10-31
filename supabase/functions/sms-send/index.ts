// Franksomi Records — sends the SMS messages waiting in the outbox (repair updates, payment receipts) through Africa's Talking.
// Runs on Supabase Edge Functions (Deno). Secrets are set in Supabase, never in the website. See SMS_SETUP.md.
declare const Deno: any;

export type Deps = {
  env: (k: string) => string | undefined;
  fetch: typeof fetch;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  getUser: (jwt: string) => Promise<string | null>;
};

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

export const atUrl = (env: Deps["env"]) => (env("AT_ENV") === "production" ? "https://api.africastalking.com" : "https://api.sandbox.africastalking.com") + "/version1/messaging";
export const toPlus = (p: string) => {
  const d = String(p || "").replace(/\D/g, "");
  if (/^254[71][0-9]{8}$/.test(d)) return "+" + d;
  if (/^0[71][0-9]{8}$/.test(d)) return "+254" + d.slice(1);
  if (/^[71][0-9]{8}$/.test(d)) return "+254" + d;
  return null;
};
// keep to plain characters so messages stay in the cheaper single-part SMS format
export const clean = (s: string) => s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\x7E\n]/g, "").trim();
export function render(message: string, jobRef: string | null, siteUrl: string | undefined): string {
  let m = message;
  if (siteUrl && jobRef) { const base = siteUrl.replace(/\/?$/, "/"); m = m.replace(/\{link\}/g, `${base}portal.html?job=${encodeURIComponent(jobRef)}`); }
  else m = m.replace(/\s*Track it:\s*\{link\}/i, "").replace(/\{link\}/g, "");
  return clean(m.replace(/\s{2,}/g, " "));
}

async function sendOne(d: Deps, phonePlus: string, message: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = d.env("AT_USERNAME"), key = d.env("AT_API_KEY"), from = d.env("AT_SENDER_ID");
  const body = new URLSearchParams({ username: user!, to: phonePlus, message }); if (from) body.set("from", from);
  try {
    const r = await d.fetch(atUrl(d.env), { method: "POST", headers: { apiKey: key!, accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
    const j: any = await r.json().catch(() => ({}));
    const rec = j?.SMSMessageData?.Recipients?.[0];
    if (!r.ok) return { ok: false, error: `Provider error ${r.status}: ${typeof j === "object" ? (j.message || j.error || "") : ""}`.slice(0, 200) };
    if (rec && [100, 101, 102].includes(Number(rec.statusCode))) return { ok: true, id: rec.messageId };
    return { ok: false, error: rec ? `${rec.status || "Rejected"} (${rec.statusCode})` : (j?.SMSMessageData?.Message || "No recipient in reply") };
  } catch (e) { return { ok: false, error: "Could not reach the SMS provider: " + (e instanceof Error ? e.message : "error") }; }
}

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any = {}; try { body = await req.json(); } catch { /* empty body is fine */ }
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const service = d.env("SUPABASE_SERVICE_ROLE_KEY");
  // the database pings this function with a shared secret when a message is queued (or every 5 minutes for retries)
  const trig = d.env("SMS_TRIGGER_SECRET"), hdr = req.headers.get("x-trigger-secret") || "";
  const viaTrigger = !!trig && trig.length >= 24 && hdr.length === trig.length && [...trig].reduce((acc, ch, i) => acc | (ch.charCodeAt(0) ^ hdr.charCodeAt(i)), 0) === 0;
  const isService = viaTrigger || (!!jwt && !!service && jwt === service);
  const userId = !isService && jwt ? await d.getUser(jwt) : null;
  if (!isService && !userId) return json({ error: "not_allowed", message: "Please sign in." }, 401);
  if (!d.env("AT_USERNAME") || !d.env("AT_API_KEY")) return json({ error: "not_configured", message: "SMS is not set up yet." }, 503);

  if (body.action === "test") {
    const o = userId ? await d.rpc("sms_is_owner", { p_user: userId }) : { data: true, error: null };
    if (o.error || !o.data) return json({ error: "not_allowed", message: "You are not allowed to send a test SMS." }, 403);
    const to = toPlus(String(body.phone || "")); if (!to) return json({ error: "bad_phone", message: "That is not a valid Safaricom number." }, 400);
    const res = await sendOne(d, to, clean(String(body.message || "Test message from Franksomi Records.")).slice(0, 300));
    return json(res.ok ? { ok: true, id: res.id } : { ok: false, message: res.error }, res.ok ? 200 : 502);
  }

  let sent = 0, failed = 0, claimed = 0;
  for (let batch = 0; batch < 5; batch++) {
    const c = await d.rpc("sms_claim", { p_limit: 20 });
    const rows: any[] = c.data || []; if (c.error || !rows.length) break;
    for (const row of rows) {
      claimed++;
      const to = toPlus(row.phone || "");
      if (!to) { await d.rpc("sms_mark", { p_id: row.id, p_ok: false, p_provider: null, p_error: "Invalid phone number" }); failed++; continue; }
      const res = await sendOne(d, to, render(row.message, row.job_ref, d.env("SITE_URL")));
      await d.rpc("sms_mark", { p_id: row.id, p_ok: res.ok, p_provider: res.id ?? null, p_error: res.ok ? null : res.error ?? "Failed" });
      res.ok ? sent++ : failed++;
    }
    if (rows.length < 20) break;   // a failed message is retried on the next run, not straight away
  }
  return json({ ok: true, claimed, sent, failed });
}

if (typeof Deno !== "undefined" && Deno.serve) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  Deno.serve((req: Request) => handle(req, {
    env: (k) => Deno.env.get(k), fetch,
    rpc: (fn, args) => admin.rpc(fn, args) as any,
    getUser: async (jwt) => { const { data, error } = await admin.auth.getUser(jwt); return error ? null : (data.user?.id ?? null); },
  }));
}
